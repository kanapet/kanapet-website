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
}
const env={MEDIA_BUCKET:new Bucket(),MEDIA_ACCESS_ISSUER:'https://test-team.cloudflareaccess.com',MEDIA_ACCESS_AUD:'test-aud',MEDIA_ADMIN_EMAILS:'admin@example.invalid',ASSETS:{fetch:async()=>new Response('asset')}};
const origin='https://www.kanapet.com';
async function req(path,{method='GET',data,raw,headers={},auth=true}={}){return worker.fetch(new Request(origin+path,{method,headers:{...(auth?{'Cf-Access-Jwt-Assertion':jwt}:{}),...(method!=='GET'?{'Origin':origin,'X-CSRF-Token':csrf}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):raw}),env);}
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
 r=await req(endpoint+'/upload?name=phone.png',{method:'POST',headers:{'If-Match':'0'},raw:png});assert.equal(r.status,201);record=await r.json();const item=record.draft.items.at(-1);
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
 console.log('Cloud media checks passed: signed JWT, email allowlist, expiry/audience, CSRF, R2 archive, private drafts, atomic publish, ranges, deletion.');
}finally{globalThis.fetch=originalFetch;}