// Technical upload metadata; source and ownership are outside this scope.
export function uploadDeclaration(encoded, actor) {
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 let value;
 try {if(encoded&&encoded.length>6000)throw Error();value=encoded?JSON.parse(decodeURIComponent(encoded)):{};if(!value||typeof value!=='object'||Array.isArray(value))throw Error();}catch{fail('上传文件信息无效');}
 const text=(key,max)=>{const s=value[key]??'';if(typeof s!=='string'||s.length>max||/[\x00-\x1f\x7f]/.test(s))fail('上传文件信息无效');return s.trim();};
 const originalName=text('originalName',240);
 if(value.originalSha256!=null&&!/^[a-f0-9]{64}$/.test(value.originalSha256||''))fail('缺少原文件指纹，请重新选择文件');
 return {policyVersion:2,originalName,originalSha256:value.originalSha256??null,originalHashStatus:value.originalSha256?'client-declared':'unavailable',profile:value.profile==='main'?'main':'detail',uploadedBy:actor,uploadedAt:new Date().toISOString()};
}
export const digestHex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
