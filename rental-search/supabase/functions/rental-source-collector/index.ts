// SMBG rental website coverage worker. Conservative detection; never promotes unverified listings.
const API = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/,"") + "/rest/v1/";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const HEADER = {apikey:KEY,Authorization:"Bearer "+KEY,Accept:"application/json"};
const UA="SMBG-Rental-Catalogue/1.1 (+public rental listing monitoring)";
const BUDGET_TOP=18;
const BUDGET_STANDARD=9;
const BUDGET_FALLBACK=4;
function pageBudget(source){
 const key=source.source_key||"";
 if(key.startsWith("rental-targeted-")||/superimmo|paruvendu|century-21|lesiteimmo|l-adresse|cdc-habitat|portails-d-annonces-immobilieres-pap/.test(key))return BUDGET_TOP;
 return source.priority===1?BUDGET_STANDARD:BUDGET_FALLBACK;
}
const BATCH_SIZE=20;
const TIMEOUT=6500;
function quote(s){return encodeURIComponent(s);}
async function db(path,method="GET",body){
  const headers={...HEADER};
  if(body!==undefined){headers["content-type"]="application/json";headers.Prefer="resolution=merge-duplicates,return=minimal";}
  for(let attempt=0;attempt<5;attempt++){
    let response;
    try {
      response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    } catch(e) {
      if(attempt===4)throw e;
      await new Promise(r=>setTimeout(r,600*(attempt+1)*(attempt+1)));
      continue;
    }
    if(response.ok)return method==="GET"?await response.json():null;
    const error=(await response.text()).slice(0,250);
    // PGRST303 can occur during temporary clock-skew / token propagation.
    if(attempt<4 && (response.status===429 || response.status>=500 ||
         (response.status===401 && /JWT issued at future|PGRST303/i.test(error)))) {
      await new Promise(r=>setTimeout(r,600*(attempt+1)*(attempt+1)));
      continue;
    }
    throw new Error("DB "+response.status+" "+error);
  }
  throw new Error("DB retry exhausted");
}
function plain(s){return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&euro;/gi,"€").replace(/&[a-z]{2,12};/gi," ").replace(/\s+/g," ").trim();}
function validUrl(raw){try{const u=new URL(raw);const host=u.hostname.toLowerCase();return (u.protocol==="https:"||u.protocol==="http:")&&!/^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|metadata\.)/.test(host)&&!host.endsWith(".local")&&!host.endsWith(".internal")?u:null;}catch{return null;}}
function money(s){
  // Locale-aware rent parsing. Keep candidates UNVERIFIED; never promote them.
  // Prevent a 1 900 € or 4 180 € amount being mistaken for 900/180 €.
  const re=/(?<!\d[ .\u00a0\u202f])(?<!\d)((?:1[ .\u00a0\u202f]?[0-7]\d{2}|1[ .\u00a0\u202f]?800|[7-9]\d{2})(?:[.,]\d{1,2})?)[ \t\u00a0\u202f]*(?:€|euros?|EUR)(?=$|[\s,.;:)/])/ig;
  let m;
  while((m=re.exec(s))){
    const value=Number(m[1].replace(/[ .\u00a0\u202f]/g,"").replace(",","."));
    if(value>=700&&value<=1800)return value;
  }
  return null;
}
function area(s){const m=s.match(/\b(\d{2,3}(?:[.,]\d{1,2})?)\s*m\s*(?:²|2)(?!\w)/i);if(!m)return null;const a=Number(m[1].replace(",","."));return a>=37&&a<=150?a:null;}
function listingUrl(path){
 return /(?:\/[0-9a-f]{8,}(?:\/|$)|\/\d{6,}[a-z0-9]*(?:\/|$)|\/annonces?\/[^/?]{12,}|\/detail[-/][^/?]{8,})/i.test(path);
}
function pageHints(url,markup){
 const parsed=new URL(url);
  const path=parsed.pathname.toLowerCase();
  if(/pap\.fr$/.test(parsed.hostname)&&/-g\d+(?:-\d+)?\/?$/.test(path))return false;
 const title=plain((markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
 const h1=plain((markup.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||"");
 const lead=(path+" "+title+" "+h1).slice(0,950);
 if(/(?:viager|vente|achat|acheter|annuaire|parking|maison|terrain|saisonni)/i.test(path))return false;
 if(/(?:viager|vente immobili[eè]re|[àa] vendre)/i.test(title+" "+h1))return false;
 return listingUrl(path)&&/\b(?:paris|montparnasse|pernety|750\d{2})\b/i.test(lead)
  &&/(?:appartement|studio|pi[eè]ces?|t[1-4]\b)/i.test(lead)
  &&/(?:location|louer|rent|\/annonces?\/|\/detail)/i.test(lead);
}
function linkCandidates(markup,base,host){
 const re=/<a\b[^>]*?\bhref\s*=\s*(?:"([^"<>]{1,900})"|'([^'<>]{1,900})')[^>]*>([\s\S]*?)<\/a>/gi;
 const out=new Map();let m,n=0;
 while((m=re.exec(markup))&&n++<2200){
  let u;try{u=validUrl(new URL((m[1]||m[2]).replace(/&amp;/gi,"&"),base).href);}catch{continue;}
  if(!u||u.hostname.toLowerCase()!==host)continue;
  u.hash="";
  for(const k of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid|msclkid)$/i.test(k))u.searchParams.delete(k);
  const label=plain(m[3]).slice(0,260),path=u.pathname+" "+label;
  if(/(?:viager|vente|achat|acheter|maison|terrain|parking|colocation|vacances|annuaire|estimation|mentions-legales|conditions-generales|privacy|contact|se-connecter|connexion|inscription|register|publicite)/i.test(path))continue;
  let score=0;
  if(/(?:\/location\/|\/louer\/|\/annonces?\/|\/appartement\/|\/fiches?\/|\/detail)/i.test(path))score+=12;
  if(/(?:paris[- /]?(?:14|15|6|7|13)|750(?:14|15|06|07|13)|75[\s-]?0(?:14|15)|montparnasse|pernety|volontaires|pasteur|vaugirard|raspail|al[eé]sia|plaisance)/i.test(path))score+=36;
  else if(/\bparis\b|75[0-9]{3}/i.test(path))score+=12;
  if(/(?:appartement|pi[eè]ces?|studio|non[- ]meubl[eé]|location vide)/i.test(path))score+=8;
  if(listingUrl(u.pathname))score+=28;
  if(/(?:[?&]page=|\/page\/\d+|\/p\/\d+)/i.test(u.href))score+=4;
  if(score<12)continue;
  const prev=out.get(u.href);if(!prev||prev.score<score)out.set(u.href,{url:u.href,score});
 }
 return [...out.values()].sort((a,b)=>b.score-a.score).slice(0,200);
}
function targetedSeeds(source){
 const host=validUrl(source.url)?.hostname||"";
 if(/123loger\.com$/i.test(host))return ["https://www.123loger.com/location/paris-75014/appartement/","https://www.123loger.com/location/paris-75015/appartement/"];
 if(/vizzit\.fr$/i.test(host))return ["https://www.vizzit.fr/louer/paris-14eme/immobilier","https://www.vizzit.fr/louer/paris-15eme/immobilier"];
 if(/paruvendu\.fr$/i.test(host))return ["https://www.paruvendu.fr/immobilier/recherche/location/appartement/paris-75/"];
 return [];
}
function likelyRent(txt,heading){
 const direct=money(heading);if(direct!==null)return direct;
 const re=/(?:\bloyer\b|charges comprises|\bpar mois\b|\/mois|\bmensuel\b)/gi;let m,count=0;
 while((m=re.exec(txt))&&count++<20){const p=money(txt.slice(m.index,Math.min(txt.length,m.index+130)));if(p!==null)return p;}
 return money(txt.slice(0,12000));
}

function propertyGeoJsonLd(markup){
 const rx=/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi;
 function traverse(node,depth){
  if(!node||typeof node!=="object"||depth>8)return null;
  if(Array.isArray(node)){for(const item of node){const r=traverse(item,depth+1);if(r)return r;}return null;}
  const types=(Array.isArray(node["@type"])?node["@type"]:[node["@type"]||""]).join(" ");
  const property=/\b(?:Apartment|Accommodation|Residence|RealEstateListing|SingleFamilyResidence)\b/i.test(types)
    ||(node.floorSize&&/appartement|logement|studio/i.test(String(node.name||"")));
  const candidate=node.geo||node.location?.geo;
  if(property&&candidate){
    const lat=Number(String(candidate.latitude??"").replace(",","."));
    const lon=Number(String(candidate.longitude??"").replace(",","."));
    const city=typeof node.address==="object"?String(node.address.addressLocality||""):String(node.address||"");
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>48.70&&lat<49.00&&lon>2.05&&lon<2.70&&(!city||/paris|75\d{3}/i.test(city))){
      return {latitude:lat,longitude:lon,precision:"property_jsonld_unverified"};
    }
  }
  for(const key of ["@graph","itemOffered","mainEntity","about","hasPart","offers","itemListElement"]){
    if(node[key]){const r=traverse(node[key],depth+1);if(r)return r;}
  }
  return null;
 }
 let m,count=0;while((m=rx.exec(markup))&&count++<20){try{const r=traverse(JSON.parse(m[1].trim()),0);if(r)return r;}catch{}}
 return null;
}
function geoPointInRing(lon,lat,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i],[xj,yj]=ring[j];
  if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside;
 }
 return inside;
}
function geoSegmentDistance(lon,lat,a,b){
 const mx=111320*Math.cos(lat*Math.PI/180),my=111320;
 const x=(lon-a[0])*mx,y=(lat-a[1])*my,vx=(b[0]-a[0])*mx,vy=(b[1]-a[1])*my;
 const t=Math.max(0,Math.min(1,(x*vx+y*vy)/Math.max(1e-12,vx*vx+vy*vy)));
 return Math.hypot(x-vx*t,y-vy*t);
}
function geoRelation(coord,settings){
 if(!coord)return {latitude_guess:null,longitude_guess:null,geo_precision:"unknown",geo_relation:"unknown",geo_distance_m:null};
 const base={latitude_guess:coord.latitude,longitude_guess:coord.longitude,geo_precision:coord.precision};
 const poly=settings?.preferred_polygon,ring=poly?.coordinates?.[0];
 if(poly?.type!=="Polygon"||!Array.isArray(ring)||ring.length<4||ring.some(v=>!Array.isArray(v)||v.length<2||!Number.isFinite(Number(v[0]))||!Number.isFinite(Number(v[1])))){
  return {...base,geo_relation:"unknown",geo_distance_m:null};
 }
 if(geoPointInRing(coord.longitude,coord.latitude,ring))return {...base,geo_relation:"inside",geo_distance_m:0};
 let closest=Infinity;
 for(let i=0;i<ring.length-1;i++)closest=Math.min(closest,geoSegmentDistance(coord.longitude,coord.latitude,ring[i],ring[i+1]));
 const max=Math.max(0,Math.min(2000,Number(settings.near_zone_buffer_m)||0));
 return {...base,geo_relation:closest<=max?"within_500m":"outside",geo_distance_m:Math.round(closest)};
}

function extractCandidate(url,markup,settings){
 if(!pageHints(url,markup))return null;
 const title=plain((markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
 const h1=plain((markup.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||"");
 const txt=plain(markup).slice(0,45000),heading=(h1+" "+title).slice(0,650);
 if(/(?:\bindisponible\b|annonce expir[eé]e|annonce n.est plus disponible|d[eé]j[àa] lou[eé])/i.test(h1+" "+txt.slice(0,1700)))return null;
 if(/(?:location meubl[eé]e|enti[eè]rement meubl[eé]|logement meubl[eé])/i.test(heading+" "+txt.slice(0,1300))
   &&!/(?:non[- ]meubl[eé]|location vide)/i.test(heading+" "+txt.slice(0,1300)))return null;
 const surface=area(heading)??area(txt.slice(0,7000));
 const price=likelyRent(txt,heading);
 if(surface===null||price===null||!/(?:\bloyer\b|\blocation\b|[àa] louer|\/mois)/i.test(heading+" "+txt.slice(0,9000)))return null;
 const furnished=/(?:non[- ]meubl[eé]|location vide|lou[eé] vide)/i.test(txt.slice(0,14000))?"unfurnished":"unknown";
 const canonical=new URL(url);canonical.hash="";
 const geo=geoRelation(propertyGeoJsonLd(markup),settings);
 for(const k of [...canonical.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid|msclkid)$/i.test(k))canonical.searchParams.delete(k);
 return {candidate_url:canonical.href,title:title.slice(0,190)||h1.slice(0,190),price_guess:price,surface_guess:surface,furnished_guess:furnished,...geo,
 extraction_note:"Collector v10: CANDIDAT NON VERIFIE; geo="+geo.geo_relation+" (coordonnees non certifiees). Loyer CC, surface, location vide, disponibilite, adresse a confirmer."};
}
async function fetchHtml(url){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),TIMEOUT);
 try{
  const res=await fetch(url,{headers:{"user-agent":UA,accept:"text/html,application/xhtml+xml"},redirect:"follow",signal:ctrl.signal});
  if(!res.ok)throw Object.assign(new Error("HTTP "+res.status),{status:res.status});
  if(!/html/i.test(res.headers.get("content-type")||""))throw new Error("Réponse non HTML");
  const html=(await res.text()).slice(0,480000);
  return {html,url:res.url||url};
 }finally{clearTimeout(timer);}
}
async function audit(source,rejectedUrls,settings){
 const start=validUrl(source.url);
 if(!start)return {outcome:"inaccessible",note:"URL invalide",candidates:[],pages:0,details:0};
 const seeds=targetedSeeds(source).map(url=>({url,score:200}));
 const todo=[...seeds,{url:start.href,score:seeds.length?0:100}];
 const seen=new Set(),candidates=[],candidateUrls=new Set();
  const budget=pageBudget(source);
 let pages=0,details=0,linksSeen=0,blocked=0,errors=[],firstStatus=null,pagination=false;
 while(todo.length&&pages<budget){
  todo.sort((a,b)=>b.score-a.score);const item=todo.shift();if(!item||seen.has(item.url))continue;seen.add(item.url);
  let result;
  try{result=await fetchHtml(item.url);}
  catch(e){blocked++;if(firstStatus===null)firstStatus=e.status||String(e.message).slice(0,50);errors.push(String(e.message).slice(0,70));continue;}
  pages++;
  let links=linkCandidates(result.html,result.url,start.hostname.toLowerCase());
   const arrondissement=source.source_key.match(/^rental-targeted-.*-paris(\d{2})$/)?.[1];
   if(arrondissement){
    links=links.map(l=>{
     const page=l.url.toLowerCase();
     const target=new RegExp("(?:paris[-_ ]?0?"+Number(arrondissement)+"(?:eme|e|\\b)|750"+arrondissement+")","i");
     const other=/paris[-_ ]?(?:0?[1-9]|1\d|20)(?:eme|e)\b|750(?:0[1-9]|1\d|20)/i.test(page);
     return {...l,score:l.score+(target.test(page)?80:other?-60:0)};
    }).sort((a,b)=>b.score-a.score);
   }
  linksSeen+=links.length;
  if(links.some(l=>/(?:[?&]page=|\/page\/\d+|\/p\/\d+)/i.test(l.url)))pagination=true;
  for(const link of links)if(!seen.has(link.url)&&!todo.some(x=>x.url===link.url)&&todo.length<230)todo.push(link);
  if(pageHints(result.url,result.html)){
   details++;const candidate=extractCandidate(result.url,result.html,settings);
   if(candidate&&!rejectedUrls.has(candidate.candidate_url)&&!candidateUrls.has(candidate.candidate_url)){
    candidateUrls.add(candidate.candidate_url);candidates.push({...candidate,source_key:source.source_key,last_seen:new Date().toISOString()});
   }
  }
 }
 const outcome=pages===0?(firstStatus===401?"login_required":"inaccessible"):"not_checked_technical_limit";
 const note=("budget="+budget+"; "+String(pages)+" pages HTML; "+details+" fiches presumes; "+linksSeen+" liens tries; "+candidates.length+" candidats NON VERIFIES; "+blocked+" erreurs. Catalogue NON certifie exhaustif."+(todo.length||pagination?" Navigation/pagination incomplete.":"")+(errors.length?" Erreurs: "+errors.slice(0,2).join("; "):"")).slice(0,700);
 return {outcome,note,candidates,attempted:seen.size>0,pages,details,linksSeen,blocked};
}
async function record(source,result,run){
 const entry={run_key:run,source_key:source.source_key,outcome:result.outcome,discovered_count:result.candidates.length,note:result.note,html_pages:result.pages??0,listing_pages_inspected:result.details??0,candidate_links_seen:result.linksSeen??0,catalogue_exhaustive:false};
 await db("rental_source_checks?on_conflict=run_key,source_key","POST",[entry]);
 if(result.attempted){
  await db("rental_search_sources?source_key=eq."+quote(source.source_key),"PATCH",{last_attempted_at:new Date().toISOString(),last_outcome:result.outcome});
 }
 if(result.candidates.length)for(const chunk of Array.from({length:Math.ceil(result.candidates.length/15)},(_,i)=>result.candidates.slice(i*15,i*15+15))){
  await db("rental_collector_candidates?on_conflict=candidate_url","POST",chunk);
 }
}
Deno.serve(async req=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 try{
  const provided=req.headers.get("x-rental-cron-token")||"";
  if(!/^[0-9a-f]{64}$/.test(provided))return new Response("Unauthorized",{status:401});
  const auth=await db("rental_collector_auth?id=eq.1&select=token");
  if(auth.length!==1||provided!==auth[0].token)return new Response("Unauthorized",{status:401});
  const input=await req.json();
  if(input.mode==="selftest"){
    const fixture='<title>Appartement 2 pièces à louer Paris 14</title><h1>Appartement 42 m² Paris 14</h1><div>Le loyer est de 1 300 € / mois cc. Location non meublée</div>';
    const url="https://www.123loger.com/location/paris-75014/appartement/4044e3b4/";
    const checks=[
     ["price",money("1 626 €")===1626&&money("4 180 €")===null],
     ["listing",pageHints(url,fixture)],
     ["candidate",extractCandidate(url,fixture)?.price_guess===1300&&extractCandidate(url,fixture)?.surface_guess===42],
     ["reject-viager",!pageHints("https://www.lesiteimmo.com/viager/appartement-3pieces/paris-9-75009/34057869","<title>Vente viager Paris</title>")],
     ["target-seeds",targetedSeeds({url:"https://www.123loger.com"}).length===2]
    ];
    return Response.json({version:10,passed:checks.filter(x=>x[1]).length,total:checks.length,checks});
  }
  const batch=input.batch;
  if(!Number.isInteger(batch)||batch<0||batch>49)return Response.json({error:"Invalid batch"},{status:400});
  const sources=await db("rental_search_sources?active=eq.true&select=source_key,name,category,url,priority,access_mode&order=priority.asc,category.asc,name.asc&limit=1000");
  const settings=await db("rental_search_settings?id=eq.default&select=near_zone_buffer_m,preferred_polygon");
  const actions=await db("rental_listing_user_actions?select=listing_id,action");
  const known=await db("rental_listings?select=id,source_url&limit=1000");
  if(settings.length!==1)throw new Error("Missing search perimeter");
  const rejectedIds=new Set(actions.filter(a=>a.action==="rejected").map(a=>a.listing_id));
  const rejects=new Set(known.filter(x=>rejectedIds.has(x.id)&&x.source_url).map(x=>{try{let u=new URL(x.source_url);u.hash="";return u.href;}catch{return x.source_url;}}));
  const slice=sources.slice(batch*BATCH_SIZE,(batch+1)*BATCH_SIZE);
   const run="edge-"+new Date().toISOString().slice(0,13)+"00";
  const results=await Promise.all(slice.map(async source=>{
    try{const result=await audit(source,rejects,settings[0]);await record(source,result,run);return {source:source.name,outcome:result.outcome,pages:result.pages??0,listing_pages:result.details??0,candidates:result.candidates.length};}
    catch(e){const note=("Worker error: "+String(e.message)).slice(0,180);try{await db("rental_source_checks?on_conflict=run_key,source_key","POST",[{run_key:run,source_key:source.source_key,outcome:"not_checked_technical_limit",discovered_count:0,note}]);}catch{}return {source:source.name,outcome:"not_checked_technical_limit",error:note};}
  }));
  return Response.json({run,batch,total_sources:sources.length,processed:results.length,results});
 }catch(e){return Response.json({error:String(e.message).slice(0,180)},{status:500});}
});
