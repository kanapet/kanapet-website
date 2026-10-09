import catalog from '../public/data/products.json' with { type: 'json' };
import videos from '../public/data/videos.json' with { type: 'json' };
const keysCache=new Map();
const uuid=/^[a-f0-9-]{36}$/;
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function fail(status,message){throw Object.assign(new Error(message),{status});}
function decode(value){const s=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export async function authenticate(request,env){
 const issuer=env.MEDIA_ACCESS_ISSUER;const aud=env.MEDIA_ACCESS_AUD;
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!aud)fail(503,'云端登录尚未配置');
 const token=request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];if(!token||token.length>16000)fail(401,'请使用内部邮箱登录');
 try{
  const parts=token.split('.');if(parts.length!==3)throw new Error('JWT');const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('Algorithm');
  const now=Math.floor(Date.now()/1000);if(claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(aud)||!Number.isFinite(claims.exp)||claims.exp<=now||(claims.nbf&&claims.nbf>now)||!Number.isFinite(claims.iat)||claims.iat>now+60)throw new Error('Claims');
  let cached=keysCache.get(issuer);if(!cached||cached.until<Date.now()||!cached.keys.some(k=>k.kid===header.kid)){
   const res=await fetch(issuer+'/cdn-cgi/access/certs');if(!res.ok)throw new Error('JWKS');const jwks=await res.json();cached={keys:jwks.keys||[],until:Date.now()+300000};keysCache.set(issuer,cached);
  }
  const jwk=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw new Error('Key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw new Error('Signature');
  const email=String(claims.email||'').toLowerCase();const allow=String(env.MEDIA_ADMIN_EMAILS||'').split(',').map(e=>e.trim().toLowerCase());if(!email||!allow.includes(email))fail(403,'此邮箱无后台操作权限');
  return {email,csrf:parts[2].slice(-32)};
 }catch(error){if(error.status)throw error;fail(401,'登录已过期或校验失败');}
}
function product(slug){const p=catalog.find(p=>p.slug===slug);if(!p)fail(404,'产品型号不存在');return p;}
function baseline(slug){const p=product(slug);const imgs=[p.image,...(p.gallery||[])].filter((s,i,a)=>s&&a.indexOf(s)===i);const items=imgs.map((src,i)=>({id:'existing-'+i,type:'image',src:'/'+src,title:p.name}));if(videos.products[slug]?.src)items.splice(1,0,{id:'existing-video',type:'video',...videos.products[slug]});return {draft:{revision:0,items},published:null};}
async function record(env,slug){product(slug);const object=await env.MEDIA_BUCKET.get(`products/${slug}.json`);return {value:object?await object.json():baseline(slug),etag:object?.etag};}
async function store(env,slug,record,next){const condition=record.etag?{etagMatches:record.etag}:{etagDoesNotMatch:'*'};const result=await env.MEDIA_BUCKET.put(`products/${slug}.json`,JSON.stringify(next),{onlyIf:condition,httpMetadata:{contentType:'application/json'}});if(!result)fail(409,'素材被其他操作更新，请重新加载');return next;}
function revision(request,r){if(request.headers.get('If-Match')!==String(r.value.draft.revision))fail(409,'素材版本已更新，请重新加载后再保存');}
async function body(request,limit){const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let total=0;while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();fail(413,'文件超过大小限制');}chunks.push(value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
async function payload(request){try{return JSON.parse(new TextDecoder().decode(await body(request,256*1024)));}catch(error){if(error.status)throw error;fail(400,'请求格式错误');}}
function sniff(b){const ascii=(start,end)=>String.fromCharCode(...b.slice(start,end));if(b.length<12)fail(415,'文件无效');if(b[0]===255&&b[1]===216&&b[2]===255)return {type:'image',mime:'image/jpeg'};if([137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return {type:'image',mime:'image/png'};if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return {type:'image',mime:'image/webp'};if(ascii(4,8)==='ftyp'){const brand=ascii(8,12);if(['heic','heix','mif1','avif'].includes(brand))fail(415,'HEIC 图片请先转换为 JPG');return {type:'video',mime:brand==='qt  '?'video/quicktime':'video/mp4'};}if([26,69,223,163].every((n,i)=>b[i]===n))return {type:'video',mime:'video/webm'};fail(415,'不支持此文件格式');}
async function validate(env,slug,items){if(!Array.isArray(items)||items.length>80)fail(400,'最多80项素材');const seen=new Set();const checked=[];for(const item of items){
 if(!item||typeof item.id!=='string'||seen.has(item.id)||!['image','video'].includes(item.type))fail(400,'素材数据无效');seen.add(item.id);
 async function source(src,type){if(typeof src!=='string'||src.length>2048)fail(400,'素材地址无效');
  if(src.startsWith('/media-assets/')){const id=src.slice(14);if(!uuid.test(id))fail(400,'素材地址无效');const obj=await env.MEDIA_BUCKET.head('assets/'+id);if(!obj||obj.customMetadata?.slug!==slug||obj.customMetadata?.type!==type)fail(400,'素材未找到或不属于此型号');return;}
  if(type==='image'&&src.startsWith('/images/')&&!src.includes('..')){const res=await env.ASSETS.fetch(new Request('https://www.kanapet.com'+src,{method:'HEAD'}));if(res.ok)return;}
  if(type==='video'){try{const u=new URL(src);if(u.protocol==='https:'&&!u.username&&!u.password&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com','facebook.com','www.facebook.com','m.facebook.com','vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname))return;}catch{}}
  fail(400,'素材来源无效');
 }
 await source(item.src,item.type);const clean={id:item.id,type:item.type,src:item.src,title:String(item.title||'').slice(0,120)};
 if(item.poster){await source(item.poster,'image');clean.poster=item.poster;}
 if(item.aspectRatio){const n=String(item.aspectRatio).split('/').map(Number);if(n.length!==2||!n.every(v=>Number.isFinite(v)&&v>0&&v<100000))fail(400,'比例无效');clean.aspectRatio=n.join(' / ');}
 checked.push(clean);
 }return checked;}
const references=(r,src)=>r?.items.some(i=>i.src===src||i.poster===src);
export async function handleMedia(request,env){
 try{
 const url=new URL(request.url),path=url.pathname;
 if(!env.MEDIA_BUCKET)fail(503,'云端素材存储尚未启用');
 const publicMatch=path.match(/^\/api\/media\/([a-z0-9-]+)$/);
 if(publicMatch&&request.method==='GET'){const r=await record(env,publicMatch[1]);return response({items:r.value.published?.items||baseline(publicMatch[1]).draft.items});}
 const asset=path.match(/^\/media-assets\/([a-f0-9-]{36})$/);
 if(asset){if(!['GET','HEAD'].includes(request.method))fail(405,'Method not allowed');const meta=await env.MEDIA_BUCKET.head('assets/'+asset[1]);if(!meta)fail(404,'素材不存在');const slug=meta.customMetadata?.slug;if(!slug)fail(404,'素材不存在');const r=await record(env,slug);
  if(!references(r.value.published,'/media-assets/'+asset[1])){await authenticate(request,env);if(!references(r.value.draft,'/media-assets/'+asset[1]))fail(404,'素材不存在');}
  let range;if(request.headers.has('Range')){const m=/^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range'));if(!m||(!m[1]&&!m[2]))fail(416,'Invalid range');if(!m[1])range={suffix:Number(m[2])};else{const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),meta.size-1):meta.size-1;if(start>end||start>=meta.size)fail(416,'Invalid range');range={offset:start,length:end-start+1};}}
  const object=await env.MEDIA_BUCKET.get('assets/'+asset[1],range?{range}:undefined);if(!object)fail(404,'素材不存在');const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Type':meta.httpMetadata?.contentType||'application/octet-stream'});let status=200;
  if(object.range){const {offset,length}=object.range;headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${meta.size}`);headers.set('Content-Length',String(length));status=206;}else headers.set('Content-Length',String(meta.size));return new Response(request.method==='HEAD'?null:object.body,{status,headers});
 }
 const actor=await authenticate(request,env);
 if(!['GET','HEAD'].includes(request.method)){
  if(request.headers.get('Origin')!==url.origin||request.headers.get('X-CSRF-Token')!==actor.csrf)fail(403,'请求来源或会话校验失败');
 }
 if(path==='/api/admin/session'&&request.method==='GET')return response({authenticated:true,setup:false,cloud:true,email:actor.email,csrf:actor.csrf});
 if(path==='/api/admin/logout'&&request.method==='POST')return response({ok:true,logout:'/cdn-cgi/access/logout'});
 if(path==='/api/admin/products'&&request.method==='GET')return response({products:catalog.map(p=>({slug:p.slug,name:p.name,category:p.category,image:'/'+p.image}))});
 const match=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)(?:\/(upload|publish))?$/);
 if(match){const slug=match[1],action=match[2];
  if(!action&&request.method==='GET')return response((await record(env,slug)).value);
  if(!action&&request.method==='PUT'){const data=await payload(request);const items=await validate(env,slug,data.items);const r=await record(env,slug);revision(request,r);return response(await store(env,slug,r,{...r.value,draft:{revision:r.value.draft.revision+1,items},updatedBy:actor.email}));}
  if(action==='upload'&&request.method==='POST'){
   product(slug);const bytes=await body(request,40*1024*1024);const kind=sniff(bytes);if(kind.type==='image'&&bytes.length>10*1024*1024)fail(413,'单张图片最多10MB');const r=await record(env,slug);revision(request,r);if(r.value.draft.items.length>=80)fail(400,'最多80项素材');const id=crypto.randomUUID();const item={id,type:kind.type,src:'/media-assets/'+id,title:String(url.searchParams.get('name')||'Product media').slice(0,120)};
   await env.MEDIA_BUCKET.put('assets/'+id,bytes,{httpMetadata:{contentType:kind.mime},customMetadata:{slug,type:kind.type,uploadedBy:actor.email}});
   try{return response(await store(env,slug,r,{...r.value,draft:{revision:r.value.draft.revision+1,items:[...r.value.draft.items,item]},updatedBy:actor.email}),201);}catch(error){await env.MEDIA_BUCKET.delete('assets/'+id);throw error;}
  }
  if(action==='publish'&&request.method==='POST'){const r=await record(env,slug);revision(request,r);const items=await validate(env,slug,r.value.draft.items);if(!items.some(i=>i.type==='image'))fail(400,'请至少保留一张产品图片');return response(await store(env,slug,r,{...r.value,published:{items,at:new Date().toISOString(),by:actor.email},draft:{...r.value.draft,revision:r.value.draft.revision+1}}));}
 }
 fail(404,'接口不存在');
 }catch(error){return response({error:error.status?error.message:'素材服务暂时不可用'},error.status||500);}
}