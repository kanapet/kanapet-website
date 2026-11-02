import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,webcrypto} from 'node:crypto';
import worker from '../worker/index.js';
const originalFetch=globalThis.fetch;
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';
globalThis.fetch=async url=>{assert.equal(String(url),'https://test-team.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function token(overrides={}){const now=Math.floor(Date.now()/1000);const content=encode({alg:'RS256',kid:'test-key'})+'.'+encode({iss:'https://test-team.cloudflareaccess.com',aud:['test-aud'],email:'admin@example.invalid',iat:now,exp:now+600,...overrides});return content+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(content))).toString('base64url');}
const jwt=await token();const csrf=jwt.split('.')[2].slice(-32);
class Bucket{
 objects=new Map();
 async put(key,value,options={}){const previous=this.objects.get(key);if(options.onlyIf?.etagMatches&&previous?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&previous)return null;const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);const obj={bytes,etag:randomUUID(),httpMetadata:options.httpMetadata,customMetadata:options.customMetadata,size:bytes.length};this.objects.set(key,obj);return obj;}
 async head(key){return this.objects.get(key)||null;}
 async get(key,options={}){const obj=this.objects.get(key);if(!obj)return null;let bytes=obj.bytes;let range;if(options.range){const offset=options.range.offset??Math.max(0,obj.size-options.range.suffix);const length=options.range.length??obj.size-offset;bytes=bytes.subarray(offset,offset+length);range={offset,length:bytes.length};}return {...obj,body:new Response(bytes).body,range,json:async()=>JSON.parse(obj.bytes.toString())};}
 async delete(key){this.objects.delete(key);}
 async list({prefix}){return {objects:[...this.objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key,...this.objects.get(key)})),truncated:false};}
}
const env={MEDIA_BUCKET:new Bucket(),MEDIA_ACCESS_ISSUER:'https://test-team.cloudflareaccess.com',MEDIA_ACCESS_AUD:'test-aud',MEDIA_ADMIN_EMAILS:'admin@example.invalid',ASSETS:{fetch:async()=>new Response('asset')}};
const origin='https://www.kanapet.com';
const declaration=encodeURIComponent(JSON.stringify({originalName:'test.png',originalSha256:'a'.repeat(64),profile:'detail'}));
async function req(path,{method='GET',data,raw,headers={},auth=true}={}){return worker.fetch(new Request(origin+path,{method,headers:{...(auth?{'Cf-Access-Jwt-Assertion':jwt}:{}),...(method!=='GET'?{'Origin':origin,'X-CSRF-Token':csrf}:{}),...(data?{'Content-Type':'application/json'}:{}),...(path.includes('/upload')?{'X-Media-Declaration':declaration}:{}),...headers},body:data?JSON.stringify(data):raw}),env);}
try{
 let r=await req('/api/admin/products',{auth:false});assert.equal(r.status,401);
 r=await req('/admin/',{auth:false});assert.equal(r.status,401);
 r=await req('/admin/');assert.equal(r.status,200);assert.ok((await r.text()).includes('内部素材管理'));
 r=await req('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':await token({email:'outsider@example.invalid'})}});assert.equal(r.status,403);
 r=await req('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':await token({exp:1})}});assert.equal(r.status,401);
 r=await req('/api/admin/session',{headers:{'Cf-Access-Jwt-Assertion':await token({aud:['wrong']})}});assert.equal(r.status,401);
 r=await req('/api/admin/session');assert.equal((await r.json()).cloud,true);
 const endpoint='/api/admin/products/bird-650-pet-door';
 r=await req(endpoint);let record=await r.json();const baseline=record.draft.items;
 const png=readFileSync(new URL('../public/favicon-32.png',import.meta.url));
 const oversized=Buffer.from(png);oversized.writeUInt32BE(2000,16);
 r=await req(endpoint+'/upload',{method:'POST',headers:{'If-Match':'0'},raw:oversized});assert.equal(r.status,413,'Reject unprocessed dimensions');
 const tooLarge=Buffer.alloc(512001);png.copy(tooLarge);
 r=await req(endpoint+'/upload',{method:'POST',headers:{'If-Match':'0'},raw:tooLarge});assert.equal(r.status,413,'Reject photos over 500KB');
 r=await req(endpoint+'/upload?name=phone.png',{method:'POST',headers:{'If-Match':'0'},raw:png});assert.equal(r.status,201);record=await r.json();const item=record.draft.items.at(-1);assert.match(item.fileName,/^bird-650-pet-door-image-\d+-[a-f0-9]+\.png$/);assert.equal(item.width,32);assert.equal(item.height,32);
 r=await req('/api/media/bird-650-pet-door',{auth:false});assert.ok(!(await r.json()).items.some(i=>i.id===item.id),'Unpublished draft must remain private');
 r=await req(item.src,{auth:false});assert.equal(r.status,401);
 r=await req(item.src,{auth:false,headers:{Cookie:'CF_Authorization='+jwt}});assert.equal(r.status,200,'Authenticated cookie must allow draft preview');
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':'0'},data:{items:baseline}});assert.equal(r.status,409);
 r=await req(endpoint+'/publish',{method:'POST',headers:{'If-Match':'1'},data:{}});assert.equal(r.status,200);assert.equal((await r.json()).draft.revision,2);
 r=await req('/api/media/bird-650-pet-door',{auth:false});assert.ok((await r.json()).items.some(i=>i.id===item.id));
 r=await req(item.src,{auth:false,headers:{Range:'bytes=0-7'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,8);
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':'2'},data:{items:baseline}});assert.equal(r.status,200);
 r=await req(item.src,{auth:false});assert.equal(r.status,200,'Draft removal must not affect public version');
 r=await req(endpoint+'/publish',{method:'POST',headers:{'If-Match':'3'},data:{}});assert.equal(r.status,200);
 r=await req(item.src,{auth:false});assert.equal(r.status,401,'Published deletion must remove anonymous access');
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':'4',Origin:'https://evil.invalid'},data:{items:baseline}});assert.equal(r.status,403);
 const current=(await (await req(endpoint)).json()).draft;
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':String(current.revision)},data:{items:[...baseline,item],coverId:item.id}});assert.equal(r.status,200);
 const chosen=(await r.json()).draft;
 r=await req(endpoint+'/publish',{method:'POST',headers:{'If-Match':String(chosen.revision)},data:{}});assert.equal(r.status,200);
 const published=(await r.json()).draft;
 r=await req('/api/media/covers',{auth:false});assert.equal((await r.json()).covers['bird-650-pet-door'].src,item.src,'Cover must propagate independently of gallery order');
 r=await req('/api/media/bird-650-pet-door',{auth:false});assert.equal((await r.json()).items[0].id,item.id);
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':String(published.revision)},data:{items:baseline}});assert.equal(r.status,400,'Deleting cover requires explicit replacement');
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':String(published.revision)},data:{items:baseline,coverId:baseline[0].id}});assert.equal(r.status,200);
 // Private upload metadata is persisted and cannot be forged through draft fields.
 let privateRecord=await (await req(endpoint)).json();
 assert.equal(privateRecord.declarations[item.id].sourceType,undefined);
 assert.match(privateRecord.declarations[item.id].processedSha256,/^[a-f0-9]{64}$/);
 r=await req('/api/media/bird-650-pet-door',{auth:false});assert.equal((await r.json()).declarations,undefined);
 r=await req(endpoint+'/cleanup',{auth:false});assert.equal(r.status,401);
 r=await req(endpoint+'/cleanup',{method:'DELETE',headers:{'If-Match':String(privateRecord.draft.revision)},data:{id:item.id,confirmation:'永久删除'}});assert.equal(r.status,409,'Published references protect bytes');
 r=await req(endpoint+'/publish',{method:'POST',headers:{'If-Match':String(privateRecord.draft.revision)},data:{}});assert.equal(r.status,200);privateRecord=await r.json();
 r=await req(endpoint+'/cleanup');assert.ok((await r.json()).assets.some(a=>a.id===item.id));
 r=await req(endpoint+'/cleanup',{method:'DELETE',headers:{'If-Match':'0'},data:{id:item.id,confirmation:'永久删除'}});assert.equal(r.status,409);
 r=await req(endpoint+'/cleanup',{method:'DELETE',headers:{'If-Match':String(privateRecord.draft.revision)},data:{id:item.id,confirmation:'删除'}});assert.equal(r.status,400);
 // A storage failure must retain a retryable record and prohibit resurrection.
 const bucketDelete=env.MEDIA_BUCKET.delete.bind(env.MEDIA_BUCKET);env.MEDIA_BUCKET.delete=async()=>{throw Error('simulated storage failure')};
 r=await req(endpoint+'/cleanup',{method:'DELETE',headers:{'If-Match':String(privateRecord.draft.revision)},data:{id:item.id,confirmation:'永久删除'}});assert.equal(r.status,503);
 privateRecord=await (await req(endpoint)).json();
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':String(privateRecord.draft.revision)},data:{items:[...baseline,item],coverId:baseline[0].id}});assert.equal(r.status,400,'Tombstone blocks resurrection even before byte deletion');
 env.MEDIA_BUCKET.delete=bucketDelete;
 r=await req(endpoint+'/cleanup',{method:'DELETE',headers:{'If-Match':String(privateRecord.draft.revision)},data:{id:item.id,confirmation:'永久删除'}});assert.equal(r.status,200);
 assert.equal(await env.MEDIA_BUCKET.head('assets/'+item.id),null,'Permanent delete must remove bytes');
 r=await req(item.src);assert.equal(r.status,404);
 privateRecord=await (await req(endpoint)).json();
 r=await req(endpoint+'/upload',{method:'POST',headers:{'If-Match':String(privateRecord.draft.revision),'X-Media-Declaration':''},raw:png});assert.equal(r.status,201,'Upload requires no source declarations');privateRecord=await r.json();
 r=await req(endpoint+'/upload',{method:'POST',headers:{'If-Match':String(privateRecord.draft.revision)},raw:png});assert.equal(r.status,409,'Exact duplicates in active draft are rejected');
 const nextItem=privateRecord.draft.items.at(-1);
 const posterVideo={...baseline.find(i=>i.type==='video'),id:'poster-reference',poster:nextItem.src};
 r=await req(endpoint,{method:'PUT',headers:{'If-Match':String(privateRecord.draft.revision)},data:{items:[...baseline,posterVideo],coverId:baseline[0].id}});assert.equal(r.status,200);privateRecord=await r.json();
 r=await req(endpoint+'/cleanup',{method:'DELETE',headers:{'If-Match':String(privateRecord.draft.revision)},data:{id:nextItem.id,confirmation:'永久删除'}});assert.equal(r.status,409,'Video-poster-only reference protects object');

 const colorEndpoint='/api/admin/products/bird-travel-42';
 r=await req(colorEndpoint);let colorRecord=await r.json();
 assert.ok(colorRecord.colors.includes('Pink'));
 assert.ok(colorRecord.draft.items.some(i=>i.colors?.includes('Pink')&&i.src.endsWith(JSON.parse(readFileSync(new URL('../public/data/products.json',import.meta.url),'utf8')).find(p=>p.id==='bird-travel-42').color_images.Pink)),'Existing catalog color photos are visible');
 const colorItems=colorRecord.draft.items.map(i=>({...i,colors:(i.colors||[]).filter(c=>c!=='Pink')}));
 colorItems[0].colors.push('Pink');
 r=await req(colorEndpoint,{method:'PUT',headers:{'If-Match':String(colorRecord.draft.revision)},data:{items:colorItems}});assert.equal(r.status,200);colorRecord=await r.json();
 r=await req(colorEndpoint+'/publish',{method:'POST',headers:{'If-Match':String(colorRecord.draft.revision)},data:{}});assert.equal(r.status,200);
 r=await req('/api/media/bird-travel-42',{auth:false});const colorFeed=await r.json();assert.equal(colorFeed.items.find(i=>i.colors?.includes('Pink')).src,colorItems[0].src,'Published color replacement reaches storefront');
 r=await req(colorEndpoint);colorRecord=await r.json();const invalidColors=colorRecord.draft.items.map(i=>({...i}));invalidColors[0].colors=['Invented Color'];
 r=await req(colorEndpoint,{method:'PUT',headers:{'If-Match':String(colorRecord.draft.revision)},data:{items:invalidColors}});assert.equal(r.status,400,'Cannot invent catalog colors');
 const duplicateColors=colorRecord.draft.items.map(i=>({...i}));duplicateColors[0].colors=['Pink'];duplicateColors[1].colors=['Pink'];
 r=await req(colorEndpoint,{method:'PUT',headers:{'If-Match':String(colorRecord.draft.revision)},data:{items:duplicateColors}});assert.equal(r.status,400,'One color cannot have conflicting image bindings');
 const clearColors=colorRecord.draft.items.map(i=>({...i,colors:(i.colors||[]).filter(c=>c!=='Pink')}));
 r=await req(colorEndpoint,{method:'PUT',headers:{'If-Match':String(colorRecord.draft.revision)},data:{items:clearColors}});assert.equal(r.status,200);
 r=await req(colorEndpoint);assert.ok(!(await r.json()).draft.items.some(i=>i.colors?.includes('Pink')),'Cleared binding is not resurrected during reload');
 console.log('Cloud media checks passed: technical metadata privacy, duplicate rejection, reference guards, permanent byte deletion, stale revisions, failed-delete retry and tombstones.');
}finally{globalThis.fetch=originalFetch;}
