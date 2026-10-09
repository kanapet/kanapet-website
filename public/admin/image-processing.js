// Normalize on the uploading device; originals remain in the phone/computer library.
(function () {
 const MAX_BYTES=500*1024, MAX_EDGE=1600;
 const imageFile=file=>file.type.startsWith('image/')||/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name);
 const encode=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片转换失败')),type,quality));
 async function prepare(file,profile='detail') {
  if(!imageFile(file))return {file};
  if(file.size>40*1024*1024)throw new Error('原始照片超过40MB，请先导出较小的照片');
  let source,url;
  try {
   // Browser decoders apply EXIF orientation before drawing; canvas removes GPS/EXIF metadata.
   if(typeof createImageBitmap==='function')try{source=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}
   if(!source){url=URL.createObjectURL(file);source=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('照片无法读取。HEIC/HEIF 请导出 JPG，或将手机相机设为“兼容性最佳”'));img.src=url;});}
   const sw=source.width||source.naturalWidth,sh=source.height||source.naturalHeight;
   if(!sw||!sh||sw*sh>80000000)throw new Error('照片尺寸过大或无效，请导出普通分辨率');
   const scale=Math.min(1,MAX_EDGE/Math.max(sw,sh));let w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
   let content=document.createElement('canvas');content.width=w;content.height=h;let ctx=content.getContext('2d');ctx.drawImage(source,0,0,w,h);
   let sx=0,sy=0,cw=w,ch=h;
   if(profile==='main'){
    // Trim only white/transparent outer margin. Never guess or remove a photographic background.
    const pixels=ctx.getImageData(0,0,w,h).data;let left=w,top=h,right=-1,bottom=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(pixels[i+3]>16&&(pixels[i]<245||pixels[i+1]<245||pixels[i+2]<245)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
    if(right>=left){sx=left;sy=top;cw=right-left+1;ch=bottom-top+1;}
    const edge=Math.min(MAX_EDGE,Math.ceil(Math.max(cw,ch)/.82));w=edge;h=edge;
   }
   let canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;ctx=canvas.getContext('2d');
   if(profile==='main'){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);const factor=w*.82/Math.max(cw,ch),dw=cw*factor,dh=ch*factor;ctx.drawImage(content,sx,sy,cw,ch,(w-dw)/2,(h-dh)/2,dw,dh);}else ctx.drawImage(content,0,0);
   let blob,type='image/webp';
   for(let round=0;round<8;round++){
    for(const quality of [.9,.82,.74,.66,.58]){blob=await encode(canvas,type,quality);if(blob.type!==type){type='image/jpeg';ctx.fillStyle='#fff';ctx.globalCompositeOperation='destination-over';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';blob=await encode(canvas,type,quality);}if(blob.size<=MAX_BYTES)break;}
    if(blob.size<=MAX_BYTES)break;
    const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(canvas.width*.85));smaller.height=Math.max(1,Math.round(canvas.height*.85));smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas=smaller;
   }
   if(!blob||blob.size>MAX_BYTES)throw new Error('无法压缩到500KB，请换一张照片');
   const ext=blob.type==='image/webp'?'webp':'jpg';
   return {file:new File([blob],'processed.'+ext,{type:blob.type}),width:canvas.width,height:canvas.height,profile,originalBytes:file.size};
  } finally {source?.close?.();if(url)URL.revokeObjectURL(url);}
 }
 window.KanapetImages={prepare,MAX_BYTES,MAX_EDGE};
})();
