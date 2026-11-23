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
  if(mode==="blocked"){
   const q=await db.from("rental_collector_candidates")
    .select("candidate_url,source_key,title,observed_at,price_guess,surface_guess,review_status")
    .in("review_status",["verification_blocked","needs_manual_url_review"]).order("observed_at",{ascending:false}).limit(500);
   if(q.error)return json({error:q.error.message},500);
   const entries=q.data||[];
   const latest=await db.from("rental_candidate_url_checks")
    .select("candidate_url,checked_at,outcome,http_status,evidence")
    .order("checked_at",{ascending:false}).limit(500);
   const seen=new Map();
   for(const v of latest.data||[])if(!seen.has(v.candidate_url))seen.set(v.candidate_url,v);
   return json({candidates:entries.map(x=>({...x,last_check:seen.get(x.candidate_url)||null})),
    blocked:entries.filter(x=>x.review_status==="verification_blocked").length,
    ambiguous:entries.filter(x=>x.review_status==="needs_manual_url_review").length,
    warning:"Ces liens ont été testés mais restent techniquement inaccessibles ou non concluants. Ils ne sont pas considérés comme supprimés.",generated_at:new Date().toISOString()});
  }
  if(mode==="health"){
   const [h,s,l,states,events]=await Promise.all([
    db.from("rental_collection_health").select("*").like("run_key","edge-%").order("last_check",{ascending:false}).limit(1),
    db.from("rental_search_sources").select("source_key,name,priority,active,updated_at").eq("active",true).limit(500),
    db.from("rental_listings").select("created_at").order("created_at",{ascending:false}).limit(1),
    db.from("rental_listings").select("id,available_status").limit(500),
    db.from("rental_listing_verification_events").select("listing_id,checked_at,led_to_retirement,outcome").gte("checked_at",new Date(Date.now()-86400000).toISOString()).order("checked_at",{ascending:false}).limit(1200)
   ]);
   if(h.error||s.error||l.error||states.error||events.error)return json({error:h.error?.message||s.error?.message||l.error?.message||states.error?.message||events.error?.message},500);
   const health=h.data?.[0]||null;
   const x=health?await db.from("rental_source_checks").select("source_key,outcome,html_pages,listing_pages_inspected,candidate_links_seen,catalogue_exhaustive").eq("run_key",health.run_key).limit(500):{data:[],error:null};
   if(x.error)return json({error:x.error.message},500);
   const sources=s.data||[];
   const activeKeys=new Set(sources.map(z=>z.source_key));
   const rows=(x.data||[]).filter(z=>activeKeys.has(z.source_key));
   const latestSourceUpdate=Math.max(0,...sources.map(z=>new Date(z.updated_at||0).getTime()));
   const runPredatesConfiguration=health?new Date(health.last_check||0).getTime()<latestSourceUpdate:false;
   const count=(pred:(x:any)=>boolean)=>new Set(rows.filter(pred).map(x=>x.source_key)).size;
   const summary={sources_active:sources.length,sources_attempted:count(()=>true),with_listing_pages:count(z=>z.listing_pages_inspected>0),inaccessible:count(z=>z.outcome==="inaccessible"),login_required:count(z=>z.outcome==="login_required"),technical_limit:count(z=>z.outcome==="not_checked_technical_limit"),catalogues_exhaustive:count(z=>z.catalogue_exhaustive===true),html_pages:rows.reduce((n,z)=>n+(z.html_pages||0),0),listing_pages_inspected:rows.reduce((n,z)=>n+(z.listing_pages_inspected||0),0),candidate_links_seen:rows.reduce((n,z)=>n+(z.candidate_links_seen||0),0)};
   const checkedLast24h=new Set((events.data||[]).map(z=>z.listing_id)).size;
    const retiredLast24h=(events.data||[]).filter(z=>z.led_to_retirement).length;
    const retiredTotal=(states.data||[]).filter(z=>z.available_status==="removed").length;
    const activeListings=(states.data||[]).filter(z=>z.available_status!=="removed").length;
    Object.assign(summary,{listings_checked_24h:checkedLast24h,listings_retired_24h:retiredLast24h,listings_retired_total:retiredTotal,listings_followed:activeListings});
    const cs=await db.from("rental_collector_candidates").select("review_status").limit(600);
   if(cs.error)return json({error:cs.error.message},500);
   const ss=cs.data||[];
   Object.assign(summary,{
    candidate_individual_links:ss.filter(x=>x.review_status==="link_verified").length,
    candidate_blocked:ss.filter(x=>x.review_status==="verification_blocked").length,
    candidate_ambiguous:ss.filter(x=>x.review_status==="needs_manual_url_review").length,
    candidate_dead:ss.filter(x=>["link_gone","unavailable_confirmed"].includes(x.review_status)).length,
    candidate_nonlisting:ss.filter(x=>x.review_status==="not_individual_listing").length,
    candidate_outside_area:ss.filter(x=>x.review_status==="discarded_out_of_area").length,
    candidate_over_budget:ss.filter(x=>x.review_status==="discarded_out_of_budget").length
   });
   const bykey=new Map(rows.map(z=>[z.source_key,z]));
   const sites=sources.map(z=>{const c:any=bykey.get(z.source_key);return {name:z.name,outcome:c?.outcome||"not_attempted",listing_pages_inspected:c?.listing_pages_inspected||0,html_pages:c?.html_pages||0};});
   return json({health,summary,sites,run_predates_configuration:runPredatesConfiguration,latest_listing_created_at:l.data?.[0]?.created_at||null,generated_at:new Date().toISOString()});
  }
  return json({error:"Mode inconnu"},400);
 }catch(e){return json({error:"Surveillance indisponible",detail:String(e).slice(0,100)},503);}
});