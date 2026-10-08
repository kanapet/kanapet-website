// Unified product gallery. Product facts and inquiry UI remain server-rendered.
(async function () {
  const detail = document.getElementById('product-detail');
  if (!detail) return;
  const slug = location.pathname.match(/\/product\/([^/]+)\.html$/)?.[1]
    || new URLSearchParams(location.search).get('slug');
  const gallery = detail.querySelector('.product-gallery');
  const wrap = gallery?.querySelector('.product-main-image-wrap');
  const image = wrap?.querySelector('#product-main-image');
  if (!slug || !image) return;
  const safeURL = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { const u = new URL(value, location.origin); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; }
    catch { return null; }
  };
  function embedURL(src) {
    const u = new URL(src);
    if (['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(u.hostname)) {
      const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return /^[\w-]{11}$/.test(id || '') ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname) && (/^\/reel\/\d+\/?$/.test(u.pathname) || /^\/[^/]+\/videos\/\d+\/?$/.test(u.pathname) || (u.pathname === '/watch/' && /^\d+$/.test(u.searchParams.get('v') || '')))) {
      return 'https://www.facebook.com/plugins/video.php?' + new URLSearchParams({href:u.href,show_text:'false'});
    }
    if (['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)) {
      const id = u.pathname.match(/\/(?:video\/)?(\d+)$/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}${u.searchParams.has('h') ? '?h='+encodeURIComponent(u.searchParams.get('h')) : ''}` : null;
    }
    return null;
  }
  let items = [];
  try {
    const preview = new URLSearchParams(location.search).get('media-preview') === 'draft';
    const res = await fetch(preview ? `/api/admin/products/${slug}` : `/api/media/${slug}`, {cache:'no-store'});
    if (res.ok) { const data = await res.json(); items = preview ? data.draft.items : data.items; }
  } catch {}
  if (!Array.isArray(items) || !items.length) {
    items = [{type:'image',src:image.src,title:image.alt}];
    gallery.querySelectorAll('.product-thumb img').forEach(img => {
      if (!items.some(item=>safeURL(item.src)===img.src)) items.push({type:'image',src:img.src,title:img.alt});
    });
    try {
      const res = await fetch('/data/videos.json');
      const video = res.ok ? (await res.json()).products?.[slug] : null;
      if (video?.src) items.splice(1,0,{type:'video',...video});
    } catch {}
  }
  items = items.filter(item => item && ['image','video'].includes(item.type) && safeURL(item.src))
    .map(item=>({...item,src:safeURL(item.src)}))
    .filter(item=>item.type==='image' || (/\.(mp4|webm|mov)$/i.test(new URL(item.src).pathname) || new URL(item.src).pathname.startsWith('/media-assets/')) || embedURL(item.src));
  if (!items.length) return;
  gallery.querySelector('.product-thumbnails')?.remove();
  const thumbs = document.createElement('div');
  thumbs.className = 'product-thumbnails';
  thumbs.setAttribute('aria-label','Product photos and videos');
  wrap.after(thumbs);
  const stage = document.createElement('div');
  stage.className = 'video-showcase gallery-video';
  stage.hidden = true;
  wrap.appendChild(stage);
  const fallback = document.createElement('a');
  fallback.className = 'media-external-link';
  fallback.textContent = 'Watch original video';
  fallback.target = '_blank'; fallback.rel = 'noopener noreferrer'; fallback.hidden = true;
  wrap.after(fallback);
  let player = null;
  let active = 0;
  function stop() { if (player?.tagName === 'VIDEO') player.pause(); stage.replaceChildren(); player=null; }
  function ratio(value) {
    const parts = String(value || '16 / 9').split('/').map(Number);
    const r = parts.length===2 && parts.every(n=>Number.isFinite(n)&&n>0) ? parts[0]/parts[1] : 16/9;
    stage.style.aspectRatio = String(r); stage.style.maxWidth = `${400*r}px`;
  }
  function select(index) {
    stop(); active=index; const item=items[index];
    thumbs.querySelectorAll('button').forEach((button,i)=>{button.classList.toggle('active',i===index);button.setAttribute('aria-pressed',String(i===index));});
    wrap.querySelector('.placeholder')?.setAttribute('style','display:none');
    fallback.hidden=true;
    if(item.type==='image') { stage.hidden=true; image.style.display=''; image.src=item.src; image.alt=item.title || 'Product photo'; return; }
    image.style.display='none'; stage.hidden=false; ratio(item.aspectRatio);
    const embed=embedURL(item.src);
    player=document.createElement(embed?'iframe':'video');
    player.src=embed || item.src;
    if(embed) {
      player.title=item.title || 'Product video'; player.allow='fullscreen; picture-in-picture; encrypted-media'; player.allowFullscreen=true;
      player.referrerPolicy='strict-origin-when-cross-origin'; fallback.href=item.src; fallback.hidden=false;
    } else {
      player.controls=true; player.playsInline=true; player.preload='metadata';
      if(safeURL(item.poster)) player.poster=safeURL(item.poster);
      const current=player;
      player.addEventListener('loadedmetadata',()=>{if(player===current && current.videoWidth && current.videoHeight) ratio(`${current.videoWidth}/${current.videoHeight}`);});
      player.addEventListener('error',()=>{const p=document.createElement('p');p.className='video-error';p.textContent='Video unavailable. Please contact us for a demonstration.';stage.replaceChildren(p);});
    }
    stage.appendChild(player);
  }
  items.forEach((item,index)=>{
    const button=document.createElement('button');button.type='button';button.className='product-thumb';
    button.setAttribute('aria-label',`${item.type==='video'?'Video':'Photo'} ${index+1}: ${item.title || ''}`);
    if(item.type==='image' || safeURL(item.poster)) {
      const img=document.createElement('img');img.src=item.type==='image'?item.src:safeURL(item.poster);img.alt='';img.loading='lazy';button.appendChild(img);
    }
    if(item.type==='video') {button.classList.add('product-video-thumb');const badge=document.createElement('span');badge.className='media-play-badge';badge.textContent='▶';button.appendChild(badge);if(!item.poster) button.append(' Video');}
    button.addEventListener('click',()=>select(index));
    button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=(active+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;select(next);thumbs.children[next].focus();});
    thumbs.appendChild(button);
  });
  detail.addEventListener('click',event=>{
    if(event.target.closest('.color-swatch,.color-btn,.material-btn')) {stop();stage.hidden=true;image.style.display='';fallback.hidden=true;thumbs.querySelectorAll('button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});}
  },true);
  select(0);
})();