
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "{}";
let secret = "";
try { secret = JSON.parse(raw).default || ""; } catch {}
secret = secret || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(Deno.env.get("SUPABASE_URL") || "",secret,{auth:{persistSession:false,autoRefreshToken:false}});
const VERSION = "2.0.0";
const HEADERS = {"user-agent":"Mozilla/5.0 (compatible; MontparnasseRentalStatus/1.0; contact via original source)","accept":"text/html,application/xhtml+xml","accept-language":"fr-FR,fr;q=0.9"};
function safe(url:string) {
 try {
  const u = new URL(url);
  const h=u.hostname.toLowerCase();
  return ["http:","https:"].includes(u.protocol)&&h.includes(".")&&
   !/^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?)/.test(h)&&
   !/\.(?:local|internal|localhost)$/.test(h)&&!/^\d+\.\d+\.\d+\.\d+$/.test(h)?u:null;
 } catch {return null;}
}
function strip(v:string) {return v.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim().slice(0,1800);}
function individualUrl(value:string){
 const u=new URL(value), path=u.pathname.toLowerCase();
 if(/pap\.fr$/.test(u.hostname)&&/-g\d+(?:-\d+)?\/?$/.test(path))return false;
 if(/(?:\/p\/\d+\/?$|\/immobilier\/?$|\/studios?-paris|\/appartement\/location\/?$)/.test(path))return false;
 if(/(?:annonces?\/[^/]*-r\d{7,}|\/\d{7,}|\/\d{3,}-[^/]+|\/detail[-/]\w{7,}|\/appartement\/[a-f0-9]{8,}\/?$|\/annonce\/[^/]{12,})/i.test(path))return true;
 return false;
}
function removalProof(html:string) {
 const a=strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
 const b=strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||"");
 const c=strip((html.match(/<main\b[^>]*>([\s\S]{0,7000})/i)||[])[1]||"");
 const text=(a+" | "+b+" | "+c.slice(0,1100)).slice(0,1500);
 const re=/(annonce.{0,35}(?:n.est plus disponible|expir[ée]e|retir[ée]e|supprim[ée]e)|logement.{0,35}(?:d[ée]j[àa] lou[ée]|n.est plus disponible)|bien.{0,35}(?:n.est plus disponible|a [ée]t[ée] lou[ée]))/i;
 return text.match(re)?.[0]||null;
}
async function one(listing:any) {
 const target=safe(listing.source_url);
 if(!target)return {listing_id:listing.id,outcome:"technical_error",error:"Invalid source URL"};
 let status:number|null=null,finalUrl=target.href,home:number|null=null,outcome="ambiguous",proof="Original site response was inconclusive";
 try{
  const response=await fetch(target.href,{headers:HEADERS,redirect:"manual",signal:AbortSignal.timeout(9500)});
  status=response.status;finalUrl=response.url||target.href;
  if([301,302,303,307,308].includes(response.status)){
   outcome="redirected";proof="HTTP redirect: "+status+"; target "+(response.headers.get("location")||"unspecified").slice(0,170);
  }else if(status===404||status===410){
   outcome=status===404?"hard_404":"hard_410";
   proof="Original listing URL returned HTTP "+status+"; domain homepage checked separately";
   try {
    const homepage=await fetch(target.origin+"/",{headers:HEADERS,redirect:"manual",signal:AbortSignal.timeout(5500)});
    home=homepage.status;
   }catch{}
   proof+="; homepage HTTP "+(home??"unknown");
  }else if(status===401||status===403||status===429||status>=500){
   outcome="blocked";proof="Original site blocked request or returned a temporary server error: HTTP "+status;
  }else if(status>=200&&status<300){
   const ct=response.headers.get("content-type")||"";
   if(!/html/i.test(ct)){outcome="ambiguous";proof="Non-HTML response: "+ct.slice(0,100);}
   else{
    const size=Number(response.headers.get("content-length")||0);
    if(size>3000000){outcome="ambiguous";proof="HTML too large to verify safely";}else{
     const html=(await response.text()).slice(0,340000);
     const title=strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").slice(0,250);
     const definitive=removalProof(html);
     const generic=/^(?:page non trouv[ée]e|page introuvable|annonce introuvable|recherche immobili[èe]re|annonces immobili[èe]res)/i.test(title);
     if(definitive&&individualUrl(target.href)){outcome="explicitly_removed";proof="Original page states: "+definitive;}
     else if(generic){outcome="non_listing";proof="Verified generic page title: "+title;}
     else if(individualUrl(target.href)&&/appartement|studio|logement|location/i.test(strip(html.slice(0,24000)))) {
      outcome="online";proof="Original individual URL responds with property/rental HTML; availability and eligibility NOT certified";
     }else{outcome="ambiguous";proof="HTTP 2xx but no individual property content confirmed";}
    }
   }
  }else{outcome="ambiguous";proof="Unexpected HTTP status "+status;}
 }catch(e){outcome="technical_error";proof="Network or timeout: "+String(e).slice(0,170);}
 try{
  const {data,error}=await sb.rpc("rental_record_listing_verification",{
   p_listing_id:listing.id,p_outcome:outcome,p_http_status:status,
   p_final_url:finalUrl,p_homepage_status:home,p_proof:proof
  });
  if(error)return {listing_id:listing.id,outcome,error:error.message};
  return {...data,source_status:status,homepage_status:home};
 }catch(e){return {listing_id:listing.id,outcome,error:String(e)};}
}
Deno.serve(async req=>{
 if(req.method!=="POST")return Response.json({error:"Only POST"},{status:405});
 try {
  const token=req.headers.get("x-rental-cron-token")||"";
  if(!/^[0-9a-f]{64}$/.test(token))return Response.json({error:"Unauthorized"},{status:401});
  const auth=await sb.from("rental_collector_auth").select("token").eq("id",1).single();
  if(auth.error||!auth.data||auth.data.token!==token)return Response.json({error:"Unauthorized"},{status:401});
  const input=await req.json();
  if(input.mode==="selftest"){
   const html="<title>Annonce expirée</title><h1>Cette annonce n'est plus disponible</h1><main>Logement déjà loué</main>";
   return Response.json({version:VERSION,passed:!!removalProof(html)&&!removalProof("<title>Location appartement Paris 14</title><h1>Appartement 2 pièces</h1>")&&!!safe("https://www.pap.fr/annonces/example")&&!safe("http://127.0.0.1/")});
  }
  const batch=input.batch;
  if(!Number.isInteger(batch)||batch<0||batch>3)return Response.json({error:"Invalid batch"},{status:400});
  const data=await sb.from("rental_listings").select("id,source_url,available_status").neq("available_status","removed").order("id",{ascending:true});
  if(data.error)throw data.error;
  const list=(data.data||[]).filter(x=>!!safe(x.source_url));
  const batchItems=list.filter((_,i)=>i%4===batch);
  const result:any[]=[];
  for(let i=0;i<batchItems.length;i+=5){
   const group=await Promise.all(batchItems.slice(i,i+5).map(x=>one(x)));
   result.push(...group);
  }
  return Response.json({version:VERSION,batch,total_active_listings:list.length,checked:result.length,retired:result.filter(x=>x.retired===true).length,results:result});
 }catch(e){return Response.json({error:String(e).slice(0,230)},{status:500});}
});
