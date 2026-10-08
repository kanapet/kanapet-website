// Local-only media backend. No dependencies, cloud accounts, or production writes.
import http from 'node:http';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,unlinkSync,statSync,createReadStream} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {networkInterfaces} from 'node:os';
const ROOT=resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const PUBLIC=resolve(ROOT,'public');
const STORE=resolve(process.env.KANAPET_MEDIA_STORE || resolve(ROOT,'.local-media'));
mkdirSync(resolve(STORE,'assets'),{recursive:true});
const STATE=resolve(STORE,'state.json');
let state=existsSync(STATE)?JSON.parse(readFileSync(STATE,'utf8')):{users:[],products:{},assets:{},audit:[]};
const catalog=JSON.parse(readFileSync(resolve(PUBLIC,'data/products.json'),'utf8'));
const videos=JSON.parse(readFileSync(resolve(PUBLIC,'data/videos.json'),'utf8'));
const port=Number(process.env.KANAPET_MEDIA_PORT || 8766);
const lan=process.argv.includes('--lan');
const addresses=Object.values(networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>x.address);
const hosts=new Set(['localhost','127.0.0.1',...(lan?addresses:[])].map(h=>`${h}:${port}`));
const sessions=new Map();
function persist(){const temp=STATE+'.tmp';writeFileSync(temp,JSON.stringify(state,null,2));renameSync(temp,STATE);}
function audit(email,action,slug){state.audit.push({at:new Date().toISOString(),email,action,slug});state.audit=state.audit.slice(-500);}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function fail(status,message){throw Object.assign(new Error(message),{status});}
function userSession(req){const id=(req.headers.cookie||'').match(/(?:^|;\s*)kanapet_session=([a-f0-9]{64})(?:;|$)/)?.[1];const session=sessions.get(id);if(!session || session.expires<Date.now()){if(id)sessions.delete(id);return null;}return session;}
function requireSession(req,write=false){const session=userSession(req);if(!session)fail(401,'请先登录');if(write && req.headers['x-csrf-token']!==session.csrf)fail(403,'会话校验失败，请刷新后重试');return session;}
async function body(req,limit=256*1024){let length=0;const parts=[];for await(const part of req){length+=part.length;if(length>limit)fail(413,'文件超过大小限制');parts.push(part);}return Buffer.concat(parts);}
async function payload(req){try{return JSON.parse((await body(req)).toString());}catch(e){if(e.status)throw e;fail(400,'请求格式错误');}}
function hash(password,salt){return scryptSync(password,salt,64).toString('hex');}
function newUser(email,password){email=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'请输入有效内部邮箱');if(typeof password!=='string'||password.length<12||password.length>128)fail(400,'密码须为12至128位');if(state.users.some(u=>u.email===email))fail(409,'账号已存在');const salt=randomBytes(16).toString('hex');return {email,salt,hash:hash(password,salt)};}
function product(slug){const p=catalog.find(p=>p.slug===slug);if(!p)fail(404,'产品型号不存在');return p;}
function baseline(slug){const p=product(slug);const imgs=[p.image,...(p.gallery||[])].filter((x,i,a)=>x&&a.indexOf(x)===i);const items=imgs.map((src,i)=>({id:`existing-${i}`,type:'image',src:'/'+src,title:p.name}));if(videos.products[slug]?.src)items.splice(1,0,{id:'existing-video',type:'video',...videos.products[slug]});return {revision:0,items};}
function record(slug){product(slug);return state.products[slug] || {draft:baseline(slug),published:null};}
function validSource(src,type){if(typeof src!=='string'||src.length>2048)return false;if(src.startsWith('/media-assets/'))return Boolean(state.assets[src.slice(14)]);
 if(src.startsWith('/images/'))return type==='image'&&!src.includes('..')&&existsSync(resolve(PUBLIC,src.slice(1)));
 try{const u=new URL(src);return u.protocol==='https:'&&type==='video'&&['youtube.com','www.youtube.com','youtu.be','www.youtube-nocookie.com','vimeo.com','www.vimeo.com','player.vimeo.com','facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname)&&!u.username&&!u.password;}catch{return false;}}
function validateItems(items){if(!Array.isArray(items)||items.length>80)fail(400,'每款产品最多80项素材');const ids=new Set();return items.map(item=>{
 if(!item||typeof item.id!=='string'||ids.has(item.id)||!['image','video'].includes(item.type)||!validSource(item.src,item.type))fail(400,'素材数据无效');ids.add(item.id);
 if(item.src.startsWith('/media-assets/')&&state.assets[item.src.slice(14)].type!==item.type)fail(400,'素材类型不匹配');
 const result={id:item.id,type:item.type,src:item.src,title:String(item.title||'').slice(0,120)};
 if(item.poster){if(!validSource(item.poster,'image'))fail(400,'视频封面无效');if(item.poster.startsWith('/media-assets/')&&state.assets[item.poster.slice(14)].type!=='image')fail(400,'封面必须是图片');result.poster=item.poster;}
 if(item.aspectRatio){const dims=String(item.aspectRatio).split('/').map(Number);if(dims.length!==2||!dims.every(n=>Number.isFinite(n)&&n>0&&n<100000))fail(400,'视频比例无效');result.aspectRatio=dims.join(' / ');}
 return result;
 });}
function expectedRevision(req,r){if(req.headers['if-match']!==String(r.draft.revision))fail(409,'素材被其他操作更新，请重新加载后再保存');}
function sniff(buf){if(buf.length<12)fail(415,'无法识别文件');if(buf[0]===255&&buf[1]===216&&buf[2]===255)return {type:'image',mime:'image/jpeg',ext:'.jpg'};
 if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {type:'image',mime:'image/png',ext:'.png'};
 if(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return {type:'image',mime:'image/webp',ext:'.webp'};
 if(buf.toString('ascii',4,8)==='ftyp'){const brand=buf.toString('ascii',8,12);if(['heic','heix','mif1','avif'].includes(brand))fail(415,'请先把 HEIC/AVIF 图片导出为 JPG');return {type:'video',mime:brand==='qt  '?'video/quicktime':'video/mp4',ext:brand==='qt  '?'.mov':'.mp4'};}
 if(buf.subarray(0,4).equals(Buffer.from([26,69,223,163])))return {type:'video',mime:'video/webm',ext:'.webm'};fail(415,'仅支持 JPG、PNG、WebP、MP4、WebM 或 MOV');}
function referenced(id,publishedOnly=false){const src='/media-assets/'+id;return Object.values(state.products).some(r=>(publishedOnly?[r.published]:[r.draft,r.published]).some(v=>v?.items.some(i=>i.src===src||i.poster===src)));}
function cleanup(){for(const [id,a]of Object.entries(state.assets)){if(!referenced(id)){try{unlinkSync(resolve(STORE,'assets',a.file));}catch{}delete state.assets[id];}}}
const loginAttempts=new Map();
async function handle(req,res){
 const remote=(req.socket.remoteAddress || '').replace(/^::ffff:/,'');
 if(!['127.0.0.1','::1'].includes(remote) && !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(remote))fail(403,'仅允许本机及局域网访问');
 if(!hosts.has(req.headers.host))fail(403,'Host not allowed');
 const url=new URL(req.url,`http://${req.headers.host}`);const path=url.pathname;
 if(!['GET','HEAD'].includes(req.method)){if(req.headers.origin!==url.origin)fail(403,'请求来源无效');}
 if(path==='/api/admin/session'&&req.method==='GET'){const session=userSession(req);return json(res,200,{authenticated:Boolean(session),setup:state.users.length===0,email:session?.email,csrf:session?.csrf});}
 if(path==='/api/admin/setup'&&req.method==='POST'){
   if(state.users.length)fail(403,'初始账号已创建');if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail(403,'请先在电脑本机创建内部管理员');
   const data=await payload(req);if(state.users.length)fail(403,'初始账号已创建');state.users.push(newUser(data.email,data.password));persist();return json(res,201,{ok:true});
 }
 if(path==='/api/admin/login'&&req.method==='POST'){
   const key=req.socket.remoteAddress;const recent=(loginAttempts.get(key)||[]).filter(t=>t>Date.now()-600000);if(recent.length>=10)fail(429,'尝试次数过多，请10分钟后再试');recent.push(Date.now());loginAttempts.set(key,recent);
   const data=await payload(req);const u=state.users.find(u=>u.email===String(data.email||'').trim().toLowerCase());const candidate=hash(String(data.password||'').slice(0,128),u?.salt||'invalid-user');
   if(!u||!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(u.hash,'hex')))fail(401,'邮箱或密码不正确');loginAttempts.delete(key);
   const id=randomBytes(32).toString('hex');const session={email:u.email,csrf:randomBytes(24).toString('hex'),expires:Date.now()+8*3600000};sessions.set(id,session);
   res.setHeader('Set-Cookie',`kanapet_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return json(res,200,{email:u.email,csrf:session.csrf});
 }
 if(path.startsWith('/api/admin/')){
   const actor=requireSession(req,!['GET','HEAD'].includes(req.method));
   if(path==='/api/admin/logout'&&req.method==='POST'){for(const[id,s]of sessions)if(s===actor)sessions.delete(id);res.setHeader('Set-Cookie','kanapet_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
   if(path==='/api/admin/users'&&req.method==='POST'){const data=await payload(req);state.users.push(newUser(data.email,data.password));audit(actor.email,'add-user','');persist();return json(res,201,{ok:true});}
   if(path==='/api/admin/products'&&req.method==='GET')return json(res,200,{products:catalog.map(p=>({slug:p.slug,name:p.name,category:p.category,image:'/'+p.image,draftCount:record(p.slug).draft.items.length,published:Boolean(record(p.slug).published)}))});
   const match=path.match(/^\/api\/admin\/products\/([a-z0-9-]+)(?:\/(upload|publish))?$/);
   if(match){const slug=match[1];const action=match[2];const r=record(slug);
     if(!action&&req.method==='GET')return json(res,200,r);
     if(!action&&req.method==='PUT'){const data=await payload(req);const latest=record(slug);expectedRevision(req,latest);const items=validateItems(data.items);state.products[slug]={...latest,draft:{revision:latest.draft.revision+1,items}};audit(actor.email,'save-draft',slug);persist();return json(res,200,state.products[slug]);}
     if(action==='upload'&&req.method==='POST'){
       const bytes=await body(req,100*1024*1024);const detected=sniff(bytes);if(detected.type==='image'&&bytes.length>10*1024*1024)fail(413,'单张图片最多10MB');
       // Check after the upload body is read to avoid concurrent writes losing items.
       const latest=record(slug);expectedRevision(req,latest);if(latest.draft.items.length>=80)fail(400,'每款产品最多80项素材');
       const id=randomUUID();const file=id+detected.ext;writeFileSync(resolve(STORE,'assets',file),bytes);
       state.assets[id]={...detected,file,slug,name:String(url.searchParams.get('name')||file).slice(0,120),size:bytes.length};
       const item={id,type:detected.type,src:'/media-assets/'+id,title:state.assets[id].name};
       state.products[slug]={...latest,draft:{revision:latest.draft.revision+1,items:[...latest.draft.items,item]}};audit(actor.email,'upload',slug);persist();return json(res,201,state.products[slug]);
     }
     if(action==='publish'&&req.method==='POST'){expectedRevision(req,r);const items=validateItems(r.draft.items);if(!items.some(i=>i.type==='image'))fail(400,'至少保留一张产品图片');state.products[slug]={...r,published:{items,at:new Date().toISOString(),by:actor.email}};audit(actor.email,'publish',slug);cleanup();persist();return json(res,200,state.products[slug]);}
   }
   fail(404,'接口不存在');
 }
 const media=path.match(/^\/api\/media\/([a-z0-9-]+)$/);
 if(media&&req.method==='GET'){const r=record(media[1]);return json(res,200,{items:r.published?.items||baseline(media[1]).items});}
 const asset=path.match(/^\/media-assets\/([a-f0-9-]{36})$/);
 if(asset){if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed');const a=state.assets[asset[1]];if(!a||(!referenced(asset[1],true)&&!userSession(req)))fail(404,'素材不存在');
   const file=resolve(STORE,'assets',a.file);const size=statSync(file).size;let start=0,end=size-1;let status=200;
   if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2]))fail(416,'Invalid range');if(!m[1])start=Math.max(0,size-Number(m[2]));else {start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}if(start>end||start>=size)fail(416,'Invalid range');status=206;}
   const headers={'Content-Type':a.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;res.writeHead(status,headers);if(req.method==='HEAD')return res.end();return createReadStream(file,{start,end}).pipe(res);
 }
 if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed');
 let relative;try{relative=decodeURIComponent(path);}catch{fail(400,'Invalid path');}if(relative.endsWith('/'))relative+='index.html';const file=resolve(PUBLIC,'.'+relative);if(!file.startsWith(PUBLIC+sep))fail(403,'Forbidden');if(!existsSync(file)||!statSync(file).isFile())fail(404,'Not found');
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
}
const server=http.createServer((req,res)=>handle(req,res).catch(e=>{if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'服务暂时不可用'});else res.destroy();}));
server.listen(port,lan?'0.0.0.0':'127.0.0.1',()=>{console.log(`Media admin: http://127.0.0.1:${port}/admin/`);if(lan)for(const address of addresses)console.log(`Phone on same Wi-Fi: http://${address}:${port}/admin/`);});