import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const secrets=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
const db=createClient(Deno.env.get("SUPABASE_URL")||"",secrets.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
const landmarks=[
 [/notre[- ]dame[- ]des[- ]champs/i,"Notre-Dame-des-Champs","Rue Notre-Dame des Champs 75006 Paris",850],
 [/\bpern[eé]ty\b/i,"Pernety","Rue Pernety 75014 Paris",850],
 [/\bal[eé]sia\b/i,"Alésia","Rue d'Alésia 75014 Paris",1000],
 [/\bmontparnasse\b/i,"Montparnasse","Boulevard du Montparnasse 75014 Paris",950],
 [/\bpasteur\b/i,"Pasteur","Boulevard Pasteur 75015 Paris",950],
 [/\bfalgui[eè]re\b/i,"Falguière","Rue Falguière 75015 Paris",850],
 [/\bplaisance\b/i,"Plaisance","Rue de Plaisance 75014 Paris",950],
 [/edgar[- ]quinet/i,"Edgar-Quinet","Boulevard Edgar Quinet 75014 Paris",800],
 [/\bga[iî]t[eé]\b/i,"Gaîté","Rue de la Gaîté 75014 Paris",800],
 [/porte d['’]orl[eé]ans/i,"Porte d’Orléans","Avenue de la Porte d'Orléans 75014 Paris",1000],
 [/porte de versailles/i,"Porte de Versailles","Avenue de la Porte de Versailles 75015 Paris",1000],
 [/\bcambronne\b/i,"Cambronne","Rue Cambronne 75015 Paris",950],
 [/\bconvention\b/i,"Convention","Rue de la Convention 75015 Paris",1100],
 [/\bcommerce\b/i,"Commerce","Rue du Commerce 75015 Paris",850],
 [/saint[- ]placide/i,"Saint-Placide","Rue Saint Placide 75006 Paris",750]
];
function norm(t:string){return t.toLowerCase().replace(/[^a-z0-9à-ÿ]/g,"")}
function findLocation(c:any){
 const title=String(c.title||""),notes=String(c.extraction_note||"");
 const postal=(title+" "+notes.slice(0,400)).match(/750(?:0[5-9]|1[0-5])|Paris[\s-]+(?:5|6|7|8|9|10|11|12|13|14|15)(?:e|ème|eme)/i);
 const district=postal?postal[0].match(/750(\d{2})/)?.[1]||postal[0].match(/Paris[\s-]+(\d{1,2})/i)?.[1]:"";
 const code=district?"750"+String(Number(district)).padStart(2,"0"):"";
 const re=/\b((?:\d{1,3}\s+)?(?:rue|avenue|boulevard|place|passage|impasse|quai|square|all[eé]e)\s+(?:de la |du |des |de |d['’])?[A-ZÀ-ÿ][A-ZÀ-ÿ'-]*(?:[-\s][A-ZÀ-ÿ][A-ZÀ-ÿ'-]*){0,4})(?=,|\s+(?:Paris|750\d\d|secteur)|\s*[-—|]|$)/i;
 const m=title.match(re)||notes.slice(0,400).match(re);
 if(m){
  const name=m[1].trim(),exact=/^\d{1,3}\s/.test(name);
  return {label:name,query:name+" "+(code?code+" ":"")+"Paris",precision:exact?"exact":"street",radius:exact?100:650,source:"street_text"};
 }
 const landmark=landmarks.find(x=>(x[0] as RegExp).test(title+" "+notes.slice(0,200)));
 if(landmark)return {label:"Secteur "+landmark[1],query:landmark[2],precision:"neighborhood",radius:landmark[3],source:"landmark"};
 return null;
}
function inside(lon:number,lat:number,ring:number[][]){
 let found=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [x,y]=ring[i],[xx,yy]=ring[j];
  if((y>lat)!=(yy>lat)&&lon<(xx-x)*(lat-y)/(yy-y)+x)found=!found;
 }return found;
}
function distance(lon:number,lat:number,a:number[],b:number[]){
 const mx=111320*Math.cos(lat*Math.PI/180),my=111320;
 const x=(lon-a[0])*mx,y=(lat-a[1])*my,dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my;
 const t=Math.min(1,Math.max(0,(x*dx+y*dy)/Math.max(1e-9,dx*dx+dy*dy)));
 return Math.hypot(x-dx*t,y-dy*t);
}

async function originalMetadata(c:any){
 if(c.review_status!=="link_verified")return "";
 try{
  const u=new URL(c.candidate_url);
  const permitted=["superimmo.com","paruvendu.fr","lesiteimmo.com","century21.fr","cdc-habitat.fr","ladresse.com","123loger.com","pap.fr","ajp-immobilier.com"];
  if(u.protocol!=="https:"||!permitted.some(h=>u.hostname===h||u.hostname==="www."+h)||u.port)return "";
  const resp=await fetch(u.href,{headers:{"accept":"text/html","user-agent":"Mozilla/5.0 (compatible; RentalGeo/1.0)"},signal:AbortSignal.timeout(8500)});
  if(!resp.ok||!/html/i.test(resp.headers.get("content-type")||""))return "";
  const html=(await resp.text()).slice(0,150000);
  const descriptions=[...html.matchAll(/<meta\b[^>]*\b(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
  const reverse=[...html.matchAll(/<meta\b[^>]*\bcontent=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/gi)].map(m=>m[1]);
  return (descriptions[0]||reverse[0]||"").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&eacute;/g,"é").replace(/&amp;/g,"&").slice(0,1800);
 }catch{return ""}
}

async function process(c:any,settings:any,save:boolean){
 let found=findLocation(c);
 if(!found&&c.review_status==="link_verified"){
  const metadata=await originalMetadata(c);
  if(metadata){
   const extracted=findLocation({title:metadata,extraction_note:""});
   if(extracted)found={...extracted,source:"source_meta_description"};
  }
 }
 if(!found){
  if(save)await db.from("rental_collector_candidates").update({geo_checked_at:new Date().toISOString(),geo_evidence:"Aucune rue ni quartier assez spécifique identifié"}).eq("candidate_url",c.candidate_url);
  return {url:c.candidate_url,result:"no_location"};
 }
 let json:any;
 try{
  const params=new URLSearchParams({q:String(found.query),index:"address",limit:"3"});
  const r=await fetch("https://data.geopf.fr/geocodage/search?"+params,{signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error("geocoder "+r.status);
  json=await r.json();
 }catch(e){return {url:c.candidate_url,result:"geo_error",error:String(e)}}
 let item:any=null;
 for(const f of json.features||[]){
  const v=f.properties||{},a=f.geometry?.coordinates;
  if(!Array.isArray(a)||!/^Paris\b/i.test(String(v.city||""))||Number(v.score)<0.72)continue;
  if(found.precision==="exact"&&v.type!=="housenumber")continue;
  if(found.precision!=="exact"&&v.type!=="street")continue;
  if(!norm(String(v.name||"")).includes(norm(String(found.label).replace(/^Secteur /,"")).slice(-6)))continue;
  item=f;break;
 }
 if(!item)return {url:c.candidate_url,result:"no_geocode_match",query:found.query};
 const lon=Number(item.geometry.coordinates[0]),lat=Number(item.geometry.coordinates[1]);
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||lat<48.7||lat>49||lon<2.1||lon>2.6)return {url:c.candidate_url,result:"invalid_coords"};
 const ring=settings.preferred_polygon?.coordinates?.[0]||[];
 if(!Array.isArray(ring)||ring.length<4)return {url:c.candidate_url,result:"no_polygon"};
 let d=0;
 if(!inside(lon,lat,ring)){d=1e9;for(let i=0;i<ring.length-1;i++)d=Math.min(d,distance(lon,lat,ring[i],ring[i+1]));}
 const buffer=Number(settings.near_zone_buffer_m)||0;
 const rel=d===0?"inside":d<=buffer?"within_500m":d<=buffer+Number(found.radius)?"potential_overlap":"outside";
 const values={latitude_guess:lat,longitude_guess:lon,geo_label_guess:found.label,geo_precision:found.precision,geo_radius_m:found.radius,geo_relation:rel,geo_distance_m:Math.round(d),geo_source:found.source,geo_checked_at:new Date().toISOString(),geo_evidence:"Position indicative tirée de "+found.query+" (Géoplateforme, "+item.properties.score+"). Ne certifie ni adresse exacte ni zone de recherche du logement."};
 if(save){
  const r=await db.from("rental_collector_candidates").update(values).eq("candidate_url",c.candidate_url);
  if(r.error)return {url:c.candidate_url,result:"save_error",error:r.error.message};
 }
 return {url:c.candidate_url,result:"mapped",label:found.label,precision:found.precision,relation:rel,lat,lon,radius:found.radius};
}
function hash(s:string){let x=2166136261;for(let i=0;i<s.length;i++)x=Math.imul(x^s.charCodeAt(i),16777619);return (x>>>0)%4}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return Response.json({error:"POST required"},{status:405});
 const token=req.headers.get("x-rental-cron-token")||"";
 if(!/^[0-9a-f]{64}$/.test(token))return Response.json({error:"Unauthorized"},{status:401});
 const auth=await db.from("rental_collector_auth").select("token").eq("id",1).single();
 if(auth.error||auth.data?.token!==token)return Response.json({error:"Unauthorized"},{status:401});
 const input=await req.json();
 if(input.mode==="selftest"){
  const street=findLocation({title:"Rue Didot, Paris 14e — 2 pièces"});
  const arrondissement=findLocation({title:"Appartement 2 pièces Paris 15e"});
  const landmark=findLocation({title:"Pernety, Paris 14e — 2 pièces"});
  return Response.json({passed:street?.precision==="street"&&!arrondissement&&landmark?.precision==="neighborhood",street,arrondissement,landmark});
 }
 if(!["batch","probe"].includes(input.mode))return Response.json({error:"Invalid mode"},{status:400});
 const settings=await db.from("rental_search_settings").select("preferred_polygon,near_zone_buffer_m").eq("id","default").single();
 if(settings.error||!settings.data?.preferred_polygon)return Response.json({error:"Original polygon unavailable"},{status:409});
 let selected:any[]=[];
 if(input.mode==="probe"){
  const r=await db.from("rental_collector_candidates").select("candidate_url,title,extraction_note,review_status").eq("candidate_url",input.url).single();
  if(r.error)return Response.json({error:r.error.message},{status:404});
  selected=[r.data];
 }else{
  const batch=Number(input.batch);
  if(!Number.isInteger(batch)||batch<0||batch>3)return Response.json({error:"Invalid batch"},{status:400});
  const r=await db.from("rental_collector_candidates").select("candidate_url,title,extraction_note,review_status,latitude_guess,geo_checked_at").in("review_status",["link_verified","verification_blocked","needs_manual_url_review","unverified"]).order("observed_at",{ascending:false}).limit(800);
  if(r.error)return Response.json({error:r.error.message},{status:500});
  selected=(r.data||[]).filter(c=>hash(c.candidate_url)===batch&&(input.force===true||(!c.latitude_guess&&(!c.geo_checked_at||Date.now()-new Date(c.geo_checked_at).getTime()>14*86400000)))).slice(0,55);
 }
 const results:any[]=[];
 for(let i=0;i<selected.length;i+=3)results.push(...await Promise.all(selected.slice(i,i+3).map(x=>process(x,settings.data,input.mode==="batch"))));
 const tally:Record<string,number>={};for(const r of results)tally[r.result]=(tally[r.result]||0)+1;
 return Response.json({total:results.length,tally,results});
});