import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const db=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
const CORS={"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"https://carte.smbg-conseil.fr","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,OPTIONS","Cache-Control":"no-store","X-Robots-Tag":"noindex,nofollow","Vary":"Origin"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:CORS});
function canonical(url:string){try{const x=new URL(url);return x.origin+x.pathname.replace(/\/$/,"");}catch{return url||"";}}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="GET")return json({error:"Méthode refusée"},405);
 try{
  const params=new URL(req.url).searchParams;
  const personalKey=params.get("k")||"";
  if(personalKey.length<8||personalKey.length>180)return json({error:"Accès refusé"},403);
  let verified=false;
  try{
   const check=await fetch((Deno.env.get("SUPABASE_URL")||"")+"/functions/v1/rental-search?api=settings&k="+encodeURIComponent(personalKey),{signal:AbortSignal.timeout(7500)});
   verified=check.ok;
  }catch{verified=false;}
  if(!verified)return json({error:"Accès refusé"},403);
  const mode=params.get("mode");
  if(mode==="candidates"){
   const [q,l]=await Promise.all([
    db.from("rental_candidate_review_queue").select("candidate_url,source_key,title,observed_at,last_seen,price_guess,surface_guess,furnished_guess,geo_relation,geo_precision,review_status,review_priority_reason").order("observed_at",{ascending:false}).limit(800),
    db.from("rental_listings").select("source_url").limit(1000)
   ]);
   if(q.error||l.error)return json({error:q.error?.message||l.error?.message},500);
   const published=new Set((l.data||[]).map(x=>canonical(x.source_url)));
   const all=q.data||[];
   const items=all.filter(x=>{
    if(published.has(canonical(x.candidate_url)))return false;
    if(Number(x.surface_guess)<37||Number(x.price_guess)>1800||Number(x.price_guess)<=0)return false;
    if(/(?:page\s+\d+|page\s+de\s+résultats|immobilier\s*:\s*location\s+appartement\s+paris\s+-\s+page)/i.test(x.title||""))return false;
    if(/\/(?:annonce|offre-location|immobilier-location)-[^/]*-g\d+(?:-\d+)?$/i.test(new URL(x.candidate_url).pathname))return false;
    return true;
   });
   return json({candidates:items,raw_review_count:all.length,shown_count:items.length,warning:"Pistes non vérifiées : disponibilité, adresse exacte, loyer CC et location vide restent à confirmer",generated_at:new Date().toISOString()});
  }
  if(mode==="health"){
   const [h,s,l]=await Promise.all([
    db.from("rental_collection_health").select("*").like("run_key","edge-%").order("last_check",{ascending:false}).limit(1),
    db.from("rental_search_sources").select("source_key,name,priority,active").eq("active",true).limit(500),
    db.from("rental_listings").select("created_at").order("created_at",{ascending:false}).limit(1)
   ]);
   if(h.error||s.error||l.error)return json({error:h.error?.message||s.error?.message||l.error?.message},500);
   const health=h.data?.[0]||null;
   const x=health?await db.from("rental_source_checks").select("source_key,outcome,html_pages,listing_pages_inspected,candidate_links_seen,catalogue_exhaustive").eq("run_key",health.run_key).limit(500):{data:[],error:null};
   if(x.error)return json({error:x.error.message},500);
   const rows=x.data||[],sources=s.data||[];
   const count=(pred:(x:any)=>boolean)=>new Set(rows.filter(pred).map(x=>x.source_key)).size;
   const summary={sources_active:sources.length,sources_attempted:count(()=>true),with_listing_pages:count(z=>z.listing_pages_inspected>0),inaccessible:count(z=>z.outcome==="inaccessible"),login_required:count(z=>z.outcome==="login_required"),technical_limit:count(z=>z.outcome==="not_checked_technical_limit"),catalogues_exhaustive:count(z=>z.catalogue_exhaustive===true),html_pages:rows.reduce((n,z)=>n+(z.html_pages||0),0),listing_pages_inspected:rows.reduce((n,z)=>n+(z.listing_pages_inspected||0),0),candidate_links_seen:rows.reduce((n,z)=>n+(z.candidate_links_seen||0),0)};
   const bykey=new Map(rows.map(z=>[z.source_key,z]));
   const sites=sources.map(z=>{const c:any=bykey.get(z.source_key);return {name:z.name,outcome:c?.outcome||"not_attempted",listing_pages_inspected:c?.listing_pages_inspected||0,html_pages:c?.html_pages||0};});
   return json({health,summary,sites,latest_listing_created_at:l.data?.[0]?.created_at||null,generated_at:new Date().toISOString()});
  }
  return json({error:"Mode inconnu"},400);
 }catch(e){return json({error:"Surveillance indisponible",detail:String(e).slice(0,100)},503);}
});