import catalog from '../public/data/products.json' with {type:'json'};
import {publishedCovers} from './media.js';

export async function applySiteMedia(response, request, env) {
 if(!response.ok || !response.headers.get('content-type')?.includes('text/html') || typeof HTMLRewriter==='undefined')return response;
 const covers=await publishedCovers(env);
 if(!Object.keys(covers).length)return response;
 const sourceBytes=await response.arrayBuffer();
 const sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',sourceBytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 response=new Response(sourceBytes,{status:response.status,headers:response.headers});
 const images=new Map();
 for(const p of catalog)if(covers[p.slug])images.set('/'+p.image.replace(/^\//,''),covers[p.slug].src);
 const replace=src=>{try{return images.get(new URL(src,request.url).pathname);}catch{return null;}};
 const rw=new HTMLRewriter().on('img',{element(el){const src=replace(el.getAttribute('src'));if(src){el.setAttribute('src',src);el.removeAttribute('srcset');}}})
 .on('meta[property="og:image"], meta[name="twitter:image"]',{element(el){const src=replace(el.getAttribute('content'));if(src)el.setAttribute('content',new URL(src,request.url).href);}})
 .on('body',{element(el){el.prepend('<script>window.KANAPET_MEDIA_COVERS='+JSON.stringify(covers).replace(/</g,'\\u003c')+';</script>',{html:true});}});
 for(const p of catalog)if(covers[p.slug])rw.on(`a[href="/product/${p.slug}.html"] img, a[href="product/${p.slug}.html"] img`,{element(el){el.setAttribute('src',covers[p.slug].src);el.removeAttribute('srcset');}});
 const transformed=rw.transform(response);
 const headers=new Headers(transformed.headers);headers.delete('etag');headers.delete('content-length');headers.set('Cache-Control','no-store');headers.set('X-Kanapet-Static-Hash',sourceHash);
 return new Response(transformed.body,{status:transformed.status,headers});
}
