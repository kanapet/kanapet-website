function confirmAction(message){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='confirm-dialog';
 const text=document.createElement('p');text.textContent=message;
 const actions=document.createElement('div');actions.className='media-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
 const accept=document.createElement('button');accept.type='button';accept.textContent='确认';accept.className='primary';
 function done(value){dialog.close();dialog.remove();resolve(value);}
 cancel.addEventListener('click',()=>done(false));accept.addEventListener('click',()=>done(true));
 dialog.addEventListener('cancel',event=>{event.preventDefault();done(false);});
 actions.append(cancel,accept);dialog.append(text,actions);document.body.appendChild(dialog);dialog.showModal();
});}
const $=id=>document.getElementById(id);
let csrf='',setup=false,products=[],current='',draft=null,busy=false,dirty=false;
function status(message){$('status').textContent=message;}
async function api(path,{method='GET',data,headers={},body}={}){
 const response=await fetch(path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':csrf}:{}),...headers},body:data?JSON.stringify(data):body});
 const result=await response.json();if(!response.ok){if(response.status===401)status('登录已过期，请重新登录');throw new Error(result.error||'操作失败');}return result;
}
function setBusy(value){busy=value;document.querySelectorAll('#workspace button,#workspace select,#workspace input').forEach(e=>e.disabled=value);$('progress').hidden=!value;}
function markDirty(){dirty=true;$('publish-state').textContent='有未保存的修改';}
async function save(){const result=await api(`/api/admin/products/${current}`,{method:'PUT',headers:{'If-Match':String(draft.revision)},data:{items:draft.items}});draft=result.draft;dirty=false;$('publish-state').textContent='草稿已保存';return result;}
function render(){
 const list=$('media-list');list.replaceChildren();$('empty').hidden=Boolean(draft.items.length);
 draft.items.forEach((item,index)=>{
  const card=document.createElement('article');card.className='media-card';
  const media=document.createElement('div');media.className='media-preview';
  if(item.type==='image'){const img=document.createElement('img');img.src=item.src;img.alt=item.title||'产品照片';img.loading='lazy';media.appendChild(img);}
  else if(item.src.startsWith('/media-assets/')){const video=document.createElement('video');video.src=item.src;video.controls=true;video.playsInline=true;video.preload='metadata';if(item.poster)video.poster=item.poster;media.appendChild(video);}
  else{media.textContent='▶ 外部视频';}
  const meta=document.createElement('div');meta.className='media-meta';
  const label=document.createElement('label');label.textContent=`${index+1}. ${item.type==='image'?'照片':'视频'}${index===0?' · 默认展示':''}`;
  const title=document.createElement('input');title.value=item.title||'';title.maxLength=120;title.setAttribute('aria-label','素材描述');title.addEventListener('input',()=>{item.title=title.value;markDirty();});label.appendChild(title);meta.appendChild(label);
  if(item.type==='video'){
   const posterLabel=document.createElement('label');posterLabel.textContent='视频封面';const select=document.createElement('select');select.appendChild(new Option('不设置封面',''));
   draft.items.filter(i=>i.type==='image').forEach(i=>select.appendChild(new Option(i.title||'产品照片',i.src)));select.value=item.poster||'';select.addEventListener('change',()=>{item.poster=select.value;markDirty();});posterLabel.appendChild(select);meta.appendChild(posterLabel);
  }
  const actions=document.createElement('div');actions.className='media-actions';
  for(const [text,move]of [['上移',-1],['下移',1]]){const button=document.createElement('button');button.textContent=text;button.disabled=index+move<0||index+move>=draft.items.length;button.addEventListener('click',()=>{[draft.items[index],draft.items[index+move]]=[draft.items[index+move],draft.items[index]];markDirty();render();});actions.appendChild(button);}
  const remove=document.createElement('button');remove.textContent='删除';remove.className='danger';remove.addEventListener('click',async()=>{if(!await confirmAction('从草稿移除此素材？保存并发布后才会从产品展示中移除。'))return;draft.items.splice(index,1);for(const i of draft.items)if(i.poster===item.src)delete i.poster;markDirty();render();});actions.appendChild(remove);meta.appendChild(actions);card.append(media,meta);list.appendChild(card);
 });
}
async function loadProduct(slug){const result=await api(`/api/admin/products/${slug}`);current=slug;draft=result.draft;dirty=false;$('editor').hidden=false;$('product-title').textContent=products.find(p=>p.slug===slug).name;$('publish-state').textContent=result.published?'已有本地发布版本':'当前为官网原有素材';$('preview').href=`/product/${slug}.html?media-preview=draft`;render();}
function options(){const search=$('search').value.toLowerCase();const select=$('product-select');select.replaceChildren(new Option('请选择产品',''));products.filter(p=>(p.name+' '+p.slug).toLowerCase().includes(search)).forEach(p=>select.appendChild(new Option(`${p.name} · ${p.slug}`,p.slug)));select.value=current;}
async function workspace(){const result=await api('/api/admin/products');products=result.products;$('login-panel').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;options();}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();try{$('login-submit').disabled=true;const data={email:$('email').value,password:$('password').value};if(setup)await api('/api/admin/setup',{method:'POST',data});const result=await api('/api/admin/login',{method:'POST',data});csrf=result.csrf;$('account').textContent=result.email;$('password').value='';setup=false;status('');await workspace();}catch(error){status(error.message);}finally{$('login-submit').disabled=false;}});
$('search').addEventListener('input',options);
$('product-select').addEventListener('change',async()=>{const slug=$('product-select').value;if(!slug)return;if(dirty&&!await confirmAction('有未保存的修改，是否放弃并切换产品？')){$('product-select').value=current;return;}try{await loadProduct(slug);status('');}catch(error){status(error.message);}});
async function metadata(file){const url=URL.createObjectURL(file);try{return await new Promise(resolve=>{const video=file.type.startsWith('video/');const element=document.createElement(video?'video':'img');const timer=setTimeout(()=>resolve(null),8000);const done=()=>{clearTimeout(timer);const w=video?element.videoWidth:element.naturalWidth,h=video?element.videoHeight:element.naturalHeight;resolve(w&&h?`${w} / ${h}`:null);};element.addEventListener(video?'loadedmetadata':'load',done,{once:true});element.addEventListener('error',()=>{clearTimeout(timer);resolve(null);},{once:true});element.src=url;});}finally{URL.revokeObjectURL(url);}}
function upload(file){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',`/api/admin/products/${current}/upload?name=${encodeURIComponent(file.name)}`);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.setRequestHeader('X-CSRF-Token',csrf);xhr.setRequestHeader('If-Match',String(draft.revision));xhr.upload.onprogress=event=>{if(event.lengthComputable)$('progress').value=100*event.loaded/event.total;};xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{return reject(new Error('上传服务异常'));}if(xhr.status<200||xhr.status>=300)return reject(new Error(result.error||'上传失败'));resolve(result);};xhr.onerror=()=>reject(new Error('网络中断，请检查手机与电脑是否在同一 Wi-Fi'));xhr.send(file);});}
for(const id of ['files','camera-photo','camera-video'])$(id).addEventListener('change',async event=>{
 const files=[...event.target.files];if(!files.length||!current)return;setBusy(true);let count=0;const errors=[];
 try{if(dirty)await save();for(const file of files){$('upload-status').textContent=`正在上传 ${count+1}/${files.length}：${file.name}`;try{const ratio=await metadata(file);const result=await upload(file);draft=result.draft;const item=draft.items.at(-1);if(ratio)item.aspectRatio=ratio;await save();count++;}catch(error){errors.push(`${file.name}：${error.message}`);}}render();status(errors.length?errors.join('；'):'上传完成，素材已保存为草稿');$('upload-status').textContent=`已上传 ${count}/${files.length} 项素材`;}catch(error){status(error.message);}finally{event.target.value='';setBusy(false);render();}
});
$('save').addEventListener('click',async()=>{try{setBusy(true);await save();status('草稿已保存');}catch(error){status(error.message);}finally{setBusy(false);render();}});
$('preview').addEventListener('click',event=>{if(dirty){event.preventDefault();status('请先保存草稿，再打开预览');}});
$('publish').addEventListener('click',async()=>{if(!await confirmAction('发布到本地预览？手机与电脑可看到更新，正式官网暂不改变。'))return;try{setBusy(true);if(dirty)await save();await api(`/api/admin/products/${current}/publish`,{method:'POST',headers:{'If-Match':String(draft.revision)},data:{}});$('publish-state').textContent='已发布到本地预览';status('本地发布成功');}catch(error){status(error.message);}finally{setBusy(false);render();}});
$('link-form').addEventListener('submit',async event=>{event.preventDefault();if(!draft)return;draft.items.push({id:crypto.randomUUID?crypto.randomUUID():`link-${Date.now()}-${Math.random().toString(36).slice(2)}`,type:'video',src:$('video-url').value,title:'Product video',aspectRatio:$('video-ratio').value});markDirty();render();try{await save();$('video-url').value='';status('视频链接已加入草稿');}catch(error){status(error.message);}});
$('user-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('/api/admin/users',{method:'POST',data:{email:$('user-email').value,password:$('user-password').value}});$('user-password').value='';status('内部账号已创建');}catch(error){status(error.message);}});
$('logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',data:{}});location.reload();}catch(error){status(error.message);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
(async()=>{try{const result=await api('/api/admin/session');if(result.authenticated){csrf=result.csrf;$('account').textContent=result.email;await workspace();}else{setup=result.setup;$('login-panel').hidden=false;if(setup){$('login-title').textContent='创建首个内部账号';$('login-description').textContent='首次请在电脑本机创建管理员，之后可在同 Wi-Fi 手机登录。密码至少12位。';$('password').minLength=12;$('password').autocomplete='new-password';$('login-submit').textContent='创建账号并登录';}}}catch{status('请先启动本地素材后台服务，再打开此页面。');}})();
// File inputs remain native so mobile browsers can offer camera or library.
document.querySelectorAll('.upload-actions label').forEach(label=>label.addEventListener('keydown',event=>{
 if(event.key==='Enter'||event.key===' '){event.preventDefault();label.querySelector('input').click();}
}));