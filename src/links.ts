export type SharedLinkInfo={
  type:'google_maps'|'web';
  originalUrl:string;
  resolvedUrl:string;
  placeName:string|null;
};

const URL_RE=/https?:\/\/[^\s<>"']+/gi;
const MAP_HOSTS=new Set(['maps.app.goo.gl','maps.google.com','www.google.com','google.com']);

function trimUrl(url:string){return url.replace(/[),.;!?，。；！？）」』】]+$/g,'');}
function decode(value:string){try{return decodeURIComponent(value.replace(/\+/g,' ')).trim()}catch{return value.replace(/\+/g,' ').trim()}}
function cleanPlace(value:string|null|undefined){
  const v=(value??'').replace(/\s+/g,' ').trim();
  if(!v||/^[-+]?\d{1,3}(?:\.\d+)?\s*,\s*[-+]?\d{1,3}(?:\.\d+)?$/.test(v)||/^Google Maps$/i.test(v))return null;
  return v.slice(0,180);
}

export function extractUrls(text:string):string[]{
  const found=(text.match(URL_RE)??[]).map(trimUrl).filter(Boolean);
  return [...new Set(found)].slice(0,8);
}

export function isGoogleMapsUrl(raw:string):boolean{
  try{
    const u=new URL(raw);
    const host=u.hostname.toLowerCase();
    return host==='maps.app.goo.gl'||host==='goo.gl'&&u.pathname.startsWith('/maps')||host==='maps.google.com'||((host==='google.com'||host.endsWith('.google.com'))&&u.pathname.includes('/maps'));
  }catch{return false}
}

export function placeNameFromGoogleMapsUrl(raw:string):string|null{
  try{
    const u=new URL(raw);
    const params=['query','q','destination','daddr'];
    for(const key of params){const v=cleanPlace(u.searchParams.get(key));if(v)return v}
    const m=u.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/i);
    if(m){const v=cleanPlace(decode(m[1]));if(v)return v}
    return null;
  }catch{return null}
}

function htmlEntityDecode(value:string){
  return value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

export function placeNameFromGoogleMapsHtml(html:string):string|null{
  const og=html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ??html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:title["']/i)?.[1];
  const title=og??html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]??null;
  if(!title)return null;
  const cleaned=htmlEntityDecode(title).replace(/\s*[-–—|]\s*Google Maps.*$/i,'').replace(/\s*-\s*Google 地圖.*$/i,'').trim();
  return cleanPlace(cleaned);
}

async function fetchWithTimeout(url:string,timeoutMs=4500){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{return await fetch(url,{method:'GET',redirect:'follow',signal:controller?.signal})}finally{if(timer)clearTimeout(timer)}
}

export async function resolveGoogleMapsLinks(text:string):Promise<SharedLinkInfo[]>{
  const urls=extractUrls(text).filter(isGoogleMapsUrl).slice(0,2);
  const out:SharedLinkInfo[]=[];
  for(const originalUrl of urls){
    let resolvedUrl=originalUrl,placeName=placeNameFromGoogleMapsUrl(originalUrl);
    try{
      const response=await fetchWithTimeout(originalUrl);
      if(response.url&&isGoogleMapsUrl(response.url))resolvedUrl=response.url;
      placeName=placeNameFromGoogleMapsUrl(resolvedUrl)??placeName;
      if(!placeName){
        const type=response.headers.get('content-type')??'';
        if(type.includes('text/html')){const html=(await response.text()).slice(0,250000);placeName=placeNameFromGoogleMapsHtml(html)}
      }
    }catch{}
    out.push({type:'google_maps',originalUrl,resolvedUrl,placeName});
  }
  return out;
}

export function firstGoogleMapsUrl(text:string):string|null{return extractUrls(text).find(isGoogleMapsUrl)??null}
export function googleMapsSearchUrl(location:string):string{return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
export function displayLocation(location:string|undefined):string|null{
  if(!location)return null;
  if(isGoogleMapsUrl(location))return placeNameFromGoogleMapsUrl(location)??'Google Maps 地點';
  return location;
}
export function linkHost(raw:string):string{try{return new URL(raw).hostname.replace(/^www\./,'')}catch{return '連結'}}
