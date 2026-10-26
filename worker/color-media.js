// Color names remain catalog facts; media editing only changes their image bindings.
export function colorOptions(product) {
 return [...new Set([...(product.colors||[]),...Object.keys(product.color_images||{}),...(product.color_options||[]).map(o=>o.name)].filter(x=>typeof x==='string'&&x.trim()))];
}
export function colorDefaults(product) {
 const pairs=Object.entries(product.color_images||{});
 for(const o of product.color_options||[])if(o.image)pairs.push([o.name,o.image]);
 return pairs.filter(([name,src])=>colorOptions(product).includes(name)&&typeof src==='string').map(([name,src])=>[name,'/'+src.replace(/^\//,'')]);
}
export function withColorMedia(state,product) {
 if(!state||state.colorMediaVersion===1)return state;
 const items=(state.items||[]).map(i=>({...i,colors:[...(i.colors||[])]}));
 for(const [name,src] of colorDefaults(product)){
  let item=items.find(i=>i.type==='image'&&i.src===src);
  if(!item){item={id:'existing-color-'+encodeURIComponent(name),type:'image',src,title:product.name,colors:[]};items.push(item);}
  if(!items.some(i=>i.colors?.includes(name)))item.colors.push(name);
 }
 return {...state,items,colorMediaVersion:1};
}
export function checkedColors(items,product) {
 const allowed=new Set(colorOptions(product)),seen=new Set();
 for(const item of items){
  if(!item||typeof item!=='object')throw Object.assign(new Error('素材数据无效'),{status:400});
  if(item.colors===undefined)continue;
  if(!Array.isArray(item.colors)||item.colors.length>allowed.size||item.type!=='image'&&item.colors.length)throw Object.assign(new Error('颜色图片关联无效'),{status:400});
  for(const name of item.colors){if(!allowed.has(name)||seen.has(name))throw Object.assign(new Error('颜色不存在或重复指定图片'),{status:400});seen.add(name);}
 }
}
