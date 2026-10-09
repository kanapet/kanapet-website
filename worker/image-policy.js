// Shared upload gate for local and cloud media services.
export function inspectImage(bytes,mime){
 const bad=message=>{throw Object.assign(new Error(message),{status:415});};
 const b=bytes,v=new DataView(b.buffer,b.byteOffset,b.byteLength),text=(a,z)=>String.fromCharCode(...b.slice(a,z));let width,height;
 try{
  if(mime==='image/png'){if(b.length<33||text(12,16)!=='IHDR')bad('PNG图片损坏');width=v.getUint32(16);height=v.getUint32(20);}
  else if(mime==='image/webp'){
   for(let p=12;p+8<=b.length;){const kind=text(p,p+4),size=v.getUint32(p+4,true),a=p+8;if(a+size>b.length)bad('WebP图片损坏');
    if(kind==='VP8X'&&size>=10){width=1+b[a+4]+(b[a+5]<<8)+(b[a+6]<<16);height=1+b[a+7]+(b[a+8]<<8)+(b[a+9]<<16);break;}
    if(kind==='VP8 '&&size>=10&&b[a+3]===157&&b[a+4]===1&&b[a+5]===42){width=v.getUint16(a+6,true)&16383;height=v.getUint16(a+8,true)&16383;break;}
    if(kind==='VP8L'&&size>=5&&b[a]===47){const bits=v.getUint32(a+1,true);width=1+(bits&16383);height=1+((bits>>>14)&16383);break;}p=a+size+(size%2);
   }
  }else if(mime==='image/jpeg'){
   let p=2;while(p+4<=b.length){if(b[p++]!==255)bad('JPEG图片损坏');while(b[p]===255)p++;const marker=b[p++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const len=v.getUint16(p);if(len<2||p+len>b.length)bad('JPEG图片损坏');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(len<8)bad('JPEG图片损坏');height=v.getUint16(p+3);width=v.getUint16(p+5);break;}p+=len;}
  }
 }catch(error){if(error.status)throw error;bad('图片损坏或不完整');}
 if(!width||!height)bad('无法读取图片尺寸，请重新导出');
 if(b.length>500*1024||Math.max(width,height)>1600)throw Object.assign(new Error('照片未按规范处理，请刷新后台重新上传（最长边1600像素、500KB以内）'),{status:413});
 return {width,height};
}
export function mediaFileName(slug,type,index,id,mime){const ext={'image/webp':'webp','image/jpeg':'jpg','image/png':'png','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'}[mime];return `${slug}-${type}-${String(index).padStart(3,'0')}-${id.slice(0,8)}.${ext}`;}
