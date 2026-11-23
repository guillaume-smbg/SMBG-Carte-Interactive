import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const secret=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(Deno.env.get("SUPABASE_URL")||"",secret,{auth:{persistSession:false,autoRefreshToken:false}});
const USER_AGENT="Mozilla/5.0 (compatible; MontparnasseRentalLinkCheck/2.0; availability-monitor)";
const HEADERS={"user-agent":USER_AGENT,accept:"text/html,application/xhtml+xml", "accept-language":"fr-FR,fr;q=0.9"};
const VERSION="2.4.0";
const HOSTS=new Set(["superimmo.com","paruvendu.fr","lesiteimmo.com","century21.fr","cdc-habitat.fr","ladresse.com","123loger.com","seloger.com","ajp-immobilier.com","pap.fr","logic-immo.com","arobazimmo.com","locservice.fr","bienici.com"]);
const trimHost=(h:string)=>h.toLowerCase().replace(/^www\./,"");
const sourceSafe=(url:string)=>{try{const u=new URL(url);return u.protocol==="https:"&&HOSTS.has(trimHost(u.hostname))&&u.username===""&&u.password===""&&(!u.port||u.port==="443")?u:null}catch{return null}};
const normalize=(u:string)=>{try{const v=new URL(u);return v.origin+v.pathname.replace(/\/+$/,"")}catch{return u}};
const striptags=(s:string)=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;|&amp;|&eacute;|&agrave;|&quot;|&#39;/gi,x=>({"&amp;":"&","&nbsp;":" ","&#160;":" ","&eacute;":"é","&agrave;":"à","&quot;":'"',"&#39;":"'"}[x.toLowerCase()]||x)).replace(/\s+/g," ").trim();
function uniqueListingPath(uri:URL){
 const p=uri.pathname.toLowerCase();
 if(/superimmo.com$/.test(uri.hostname))return /^\/annonces\/location-[^/]+-x[a-z0-9]{5,9}$/.test(p);
 if(/paruvendu.fr$/.test(uri.hostname))return /\/immobilier\/location\/[^/]+\/[0-9]{8,}[a-z0-9]+\/?$/.test(p);
 if(/lesiteimmo.com$/.test(uri.hostname))return /\/louer\/[^/]+\/[^/]+\/\d{6,}\/?$/.test(p);
 if(/century21.fr$/.test(uri.hostname))return /\/trouver_logement\/detail\/\d{7,}\/?$/.test(p);
 if(/cdc-habitat.fr$/.test(uri.hostname))return /\/annonces-immobilieres\/location\/.+\/\d{5,}\/?$/.test(p);
 if(/ladresse.com$/.test(uri.hostname))return /\/annonce\/location\/.+\/\d{5,}\/?$/.test(p);
 if(/123loger.com$/.test(uri.hostname))return /\/location\/.+\/appartement\/[a-z0-9]{7,}\/?$/.test(p);
 if(/locservice.fr$/.test(uri.hostname))return /\/location-(?:studio|appartement)-paris-\d{1,2}\/\d{4,}\/?$/.test(p);
 if(/arobazimmo.com$/.test(uri.hostname))return /\/locations\/[a-z0-9-]{12,}\/?$/i.test(p);
 if(/seloger.com$/.test(uri.hostname))return /\/annonce(?:s)?\/.+\/[0-9a-z]{10,}(?:\.htm)?\/?$/.test(p);
 if(/pap.fr$/.test(uri.hostname))return /\/annonces?\/[^/]+-r\d{7,}\/?$/.test(p);
 if(/logic-immo.com$/.test(uri.hostname))return /\/detail-annonce\/.+\/[0-9a-z]{8,}\/?$/.test(p);
 return /\/(?:detail|annonces?|fiches?|louer|location)\/.+(?:\/\d{5,}|\/[0-9a-f-]{10,})\/?$/.test(p);
}
const isGenericPath=(u:URL)=>{
 const p=u.pathname.toLowerCase().replace(/\/+$/,"");
 return !p||p==="/"||/\/(?:annonces?|locations?|appartements?|immobilier|recherche|resultats?)$/.test(p)||
 (/pap\.fr$/.test(u.hostname)&&/-g\d+(?:-\d+)?$/.test(p))||
 (/superimmo\.com$/.test(u.hostname)&&/\/location\//.test(p)&&!/\/annonces\//.test(p))||
 (/century21\.fr$/.test(u.hostname)&&/\/annonces\/location/.test(p));
};
const blockedText=(t:string)=>/captcha|vérification de sécurité|access denied|cloudflare|robot verification|please enable javascript|just a moment/i.test(t);
const goneText=(t:string)=>/(cette annonce n.est plus disponible|ce logement n.est plus disponible|ce bien n.est plus disponible|annonce (?:a été )?(?:supprimée|retirée|expirée)|logement (?:déjà )?loué|ce bien a été loué|annonce introuvable|annonce n.existe plus)/i.test(t);
function isFarAway(title:string){
 const t=title.toLowerCase();
 if(/le touquet|lille|lyon|marseille|bordeaux|strasbourg|toulouse|nantes|roubaix|saint-denis|boulogne-billancourt/i.test(t))return true;
 const m=t.match(/(?:paris[- ]+)(\d{1,2})(?:e|ème|eme|è|[^\d]|$)|\b75(0\d{2}|1\d{2})\b/i);
 if(!m)return false;
 const n=Number(m[1]||String(m[2]||"").slice(-2));
 return [1,2,3,4,8,9,10,11,12,16,17,18,19,20].includes(n);
}
type Verdict={outcome:string,http_status:number|null,response_title:string,final_url:string,evidence:string,related_source:string,response_bytes:number,hidden_from_queue:boolean};
async function inspect(c:any):Promise<Verdict>{
 const original=sourceSafe(c.candidate_url),blank:Verdict={outcome:"ambiguous",http_status:null,response_title:"",final_url:c.candidate_url,evidence:"Réponse non concluante",related_source:c.source_key||"",response_bytes:0,hidden_from_queue:false};
 if(!original)return {...blank,outcome:"technical_error",evidence:"URL en dehors des domaines immobiliers autorisés"};
 let current=original,resp:Response|null=null,location="",hops=0;
 try{
  for(let i=0;i<3;i++){
   resp=await fetch(current.href,{headers:HEADERS,redirect:"manual",signal:AbortSignal.timeout(9000)});
   if([301,302,303,307,308].includes(resp.status)){
    location=resp.headers.get("location")||"";
    let target:URL;
    try{target=new URL(location,current.href)}catch{return {...blank,http_status:resp.status,outcome:"redirected_generic",final_url:location,evidence:"Redirection invalide, sans fiche immobilière",hidden_from_queue:true}};
    if(!sourceSafe(target)||trimHost(target.hostname)!==trimHost(original.hostname)){
      return {...blank,http_status:resp.status,outcome:"ambiguous",final_url:target.href,evidence:"Redirection hors domaine d'origine: "+target.hostname};
    }
    if(isGenericPath(target)||/\/(?:recherche|resultats?|find|search)\//i.test(target.pathname)){
      return {...blank,http_status:resp.status,outcome:"redirected_generic",final_url:target.href,evidence:"Redirection vers une page générique ou un catalogue, non vers l'annonce individuelle",hidden_from_queue:true};
    }
    if(normalize(target.href)===normalize(current.href))break;
    current=target;hops++;
    continue;
   }
   break;
  }
  if(!resp)return {...blank,outcome:"technical_error",evidence:"Pas de réponse HTTP"};
  const base={...blank,http_status:resp.status,final_url:current.href};
  if([404,410].includes(resp.status)){
    return {...base,outcome:"gone",evidence:"La fiche individuelle renvoie directement HTTP "+resp.status,hidden_from_queue:true};
  }
  if(resp.status===401||resp.status===403||resp.status===429||resp.status>=500){
    return {...base,outcome:"blocked",evidence:"Accès bloqué / erreur technique HTTP "+resp.status};
  }
  if(resp.status<200||resp.status>=300){
    return {...base,outcome:"ambiguous",evidence:"Statut HTTP "+resp.status+" non interprétable comme annonce"};
  }
  if(!/html|text\/plain/i.test(resp.headers.get("content-type")||"")){
    return {...base,outcome:"non_listing",evidence:"La réponse n'est pas une page d'annonce HTML",hidden_from_queue:true};
  }
  let html=(await resp.text()).slice(0,370000);
  const title=striptags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").slice(0,340);
  const h1=striptags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"").slice(0,400);
  const main=(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html.match(/<body\b[^>]*>([\s\S]{0,90000})/i)?.[1]||html.slice(0,90000));
  const text=striptags(main.slice(0,90000)).slice(0,18000);
  const page={...base,response_title:title,response_bytes:html.length};
  if(blockedText(title+" "+h1+" "+text.slice(0,700))){
    return {...page,outcome:"blocked",evidence:"Page de protection anti-robot ou login au lieu d'une annonce"};
  }
  if(uniqueListingPath(original)&&goneText([title,h1,text.slice(0,1600)].join(" | "))){
    return {...page,outcome:"unavailable",evidence:"Page de l'annonce indique explicitement son retrait: "+[title,h1,text.slice(0,600)].join(" | ").slice(0,350),hidden_from_queue:true};
  }
  // If the actual destination is a generic listings page the saved URL is no longer an individual ad.
  const canonical=html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
  if(canonical){
    try{const can=new URL(canonical,current.href);
      if(isGenericPath(can)&&uniqueListingPath(original)){
        return {...page,outcome:"non_listing",evidence:"Page reçue avec canonical générique "+can.pathname.slice(0,150),hidden_from_queue:true};
      }
    }catch{}
  }
  if(isGenericPath(current)){
    return {...page,outcome:"non_listing",evidence:"URL source n'identifie pas une annonce immobilière individuelle",hidden_from_queue:true};
  }
  if(/page introuvable|page non trouvée|erreur 404|aucun résultat|les annonces immobilières à|recherche immobilière/i.test(title+" "+h1)&&!/(\d{2,3}(?:[,.]\d{1,2})?\s*m(?:²|2))/.test(title+" "+h1)){
    return {...page,outcome:"non_listing",evidence:"Page générique / erreur HTML 200: "+(title||h1).slice(0,160),hidden_from_queue:true};
  }
  const area=Number(c.surface_guess);
  const areas=[...([title,h1,text.slice(0,4500)].join(" ").matchAll(/(\d{2,3}(?:[,.]\d{1,2})?)\s*m(?:²|2)/gi))].slice(0,70).map(m=>Number(m[1].replace(",",".")));
  const areaMatches=Number.isFinite(area)&&areas.some(v=>Math.abs(v-area)<Math.max(2.0,area*0.04));
  const propertyWords=/appartement|studio|logement|maison|pièces|location|\bT[1-5]\b/i.test(title+" "+h1);
  const propertyText=/appartement|loyer|pièces|chambres|location/i.test(text.slice(0,6500));
  const genericHeading=/^(immobilier|annonces immobilières|location appartement à|toutes les annonces|recherche immobilière)/i.test(h1);
  if(areaMatches&&propertyWords&&(propertyText||/\bT[1-5]\b.*\d+\s*m(?:²|2).*\d+\s*€/i.test(title))&&!genericHeading){
    if(isFarAway(title+" "+h1)){
      return {...page,outcome:"out_of_area",evidence:"Fiche originale immobilière hors du secteur Montparnasse: "+(title||h1).slice(0,160),hidden_from_queue:true};
    }
    // The extracted title-price can be more trustworthy than an unrelated scraped number.
    const priceFromTitle=(title+" "+h1).match(/(\d[\d\s\u00a0]*(?:[,.]\d{2})?)\s*€/);
    const amount=priceFromTitle?Number(priceFromTitle[1].replace(/[\s\u00a0]/g,"").replace(",",".")):NaN;
    if(Number.isFinite(amount)&&amount>1800&&amount<25000){
      return {...page,outcome:"out_of_budget",evidence:"Loyer affiché sur titre de la fiche originale: "+amount+" €, supérieur au plafond de 1 800 €",hidden_from_queue:true};
    }
    return {...page,outcome:"live_listing",evidence:"Fiche individuelle accessible; titre="+title.slice(0,170)+"; surface "+area+" m² retrouvée; disponibilité/non-meublé/adresse NON certifiés"};
  }
  return {...page,outcome:"ambiguous",evidence:"HTML 200 mais contenu de l'annonce individuelle non suffisamment établi; titre="+title.slice(0,170)+"; surface concordante="+areaMatches};
 }catch(e){
  return {...blank,outcome:"technical_error",evidence:"Échec réseau/timeout : "+String(e).slice(0,180)};
 }
}
function shard(url:string){let n=2166136261;for(let i=0;i<url.length;i++)n=Math.imul(n^url.charCodeAt(i),16777619);return (n>>>0)%8}
const statusByOutcome:Record<string,string>={
 live_listing:"link_verified",gone:"link_gone",unavailable:"unavailable_confirmed",
 blocked:"verification_blocked",technical_error:"verification_blocked",ambiguous:"needs_manual_url_review",
 non_listing:"not_individual_listing",redirected_generic:"not_individual_listing",
 out_of_area:"discarded_out_of_area",out_of_budget:"discarded_out_of_budget"
};
async function persist(c:any,v:Verdict){
 const {error:err}=await db.from("rental_candidate_url_checks").insert({
   candidate_url:c.candidate_url,outcome:v.outcome,http_status:v.http_status,response_title:v.response_title,
   final_url:v.final_url,evidence:v.evidence,related_source:v.related_source,response_bytes:v.response_bytes,
   audit_version:VERSION,hidden_from_queue:v.hidden_from_queue
 });
 if(err)return {url:c.candidate_url,outcome:v.outcome,error:"Event insert failed: "+err.message};
 const target=statusByOutcome[v.outcome];
 if(target){
  // Never overwrite a user's or human review when the candidate was already discarded by other evidence.
  const allowed=["unverified","location_uncertain","link_verified","verification_blocked","needs_manual_url_review"];
  if(allowed.includes(c.review_status)){
   const update=await db.from("rental_collector_candidates")
       .update({review_status:target,extraction_note:(c.extraction_note||"").slice(0,560)+" | Vérification URL "+new Date().toISOString().slice(0,10)+": "+v.evidence.slice(0,320)})
       .eq("candidate_url",c.candidate_url).in("review_status",allowed);
   if(update.error)return {url:c.candidate_url,outcome:v.outcome,error:"Review update failed: "+update.error.message};
  }
 }
 return {url:c.candidate_url,outcome:v.outcome,status:v.http_status,hidden:v.hidden_from_queue,evidence:v.evidence.slice(0,175)};
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return Response.json({error:"Only POST"},{status:405});
 try{
  const token=req.headers.get("x-rental-cron-token")||"";
  if(!/^[0-9a-f]{64}$/.test(token))return Response.json({error:"Unauthorized"},{status:401});
  const auth=await db.from("rental_collector_auth").select("token").eq("id",1).single();
  if(auth.error||auth.data?.token!==token)return Response.json({error:"Unauthorized"},{status:401});
  const input=await req.json();
  if(input.mode==="selftest"){
   return Response.json({version:VERSION,checks:{
    unique:uniqueListingPath(new URL("https://www.superimmo.com/annonces/location-appartement-44m-paris-15eme-75015-x12ivr7")),
    generic:!uniqueListingPath(new URL("https://www.superimmo.com/location/appartement/ile-de-france/paris/paris-15eme-75015")),
    faraway:isFarAway("Location appartement Paris 18ème 41 m²"),
    target:!isFarAway("Location appartement Paris 14ème 41 m²"),
    safe:!!sourceSafe("https://www.paruvendu.fr/immobilier/location/appartement/1297726144A1KILHAP000"),
    unsafe:!sourceSafe("http://127.0.0.1/admin")
   }});
  }
  const {data,error}=await db.from("rental_collector_candidates")
   .select("candidate_url,source_key,title,price_guess,surface_guess,review_status,extraction_note")
   .in("review_status",["unverified","location_uncertain","link_verified","verification_blocked","needs_manual_url_review"]).order("candidate_url",{ascending:true}).limit(1000);
  if(error)return Response.json({error:error.message},{status:500});
  const candidates=data||[];
  let selected:any[]=[];
  if(input.mode==="probe"){
   if(!Array.isArray(input.urls)||input.urls.length>10)return Response.json({error:"Invalid probe list"},{status:400});
   selected=candidates.filter(c=>input.urls.includes(c.candidate_url));
  }else if(input.mode==="batch"){
   if(!Number.isInteger(input.batch)||input.batch<0||input.batch>7)return Response.json({error:"Invalid batch"},{status:400});
   selected=candidates.filter(c=>shard(c.candidate_url)===input.batch);
   if(!input.force){
    const {data:recent,error:recentError}=await db.from("rental_candidate_url_checks")
      .select("candidate_url,checked_at,outcome,http_status")
      .gte("checked_at",new Date(Date.now()-8*24*60*60*1000).toISOString())
      .order("checked_at",{ascending:false}).limit(1200);
    if(recentError)return Response.json({error:recentError.message},{status:500});
    const latest=new Map<string,any>();
    for(const row of recent||[])if(!latest.has(row.candidate_url))latest.set(row.candidate_url,row);
    const now=Date.now();
    selected=selected.filter(c=>{
      const v=latest.get(c.candidate_url);
      if(!v)return true;
      const waitDays=v.outcome==="blocked"&&v.http_status===429?7:
        v.outcome==="blocked"?3:
        v.outcome==="technical_error"||v.outcome==="ambiguous"?2:
        v.outcome==="live_listing"?1:7;
      return now-new Date(v.checked_at).getTime()>waitDays*86400000;
    });
   }
  }else return Response.json({error:"Unknown mode"},{status:400});
  const results:any[]=[];
  for(let i=0;i<selected.length;i+=4){
   const batch=await Promise.all(selected.slice(i,i+4).map(async c=>{
    const verdict=await inspect(c);
    return input.mode==="probe"?{url:c.candidate_url,...verdict}:await persist(c,verdict);
   }));
   results.push(...batch);
  }
  const summary:Record<string,number>={};
  for(const r of results)summary[r.outcome]=(summary[r.outcome]||0)+1;
  return Response.json({version:VERSION,mode:input.mode,batch:input.batch??null,checked:results.length,total_candidate_pool:candidates.length,summary,results});
 }catch(e){return Response.json({error:String(e).slice(0,500)},{status:500})}
});