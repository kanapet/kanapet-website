// Video configuration is separate from the product catalog.
(async function () {
  const detail = document.getElementById('product-detail');
  const home = document.getElementById('factory-video-section');
  if (!detail && !home) return;
  try {
    const response = await fetch('/data/videos.json');
    if (!response.ok) return;
    const config = await response.json();
    const slug = location.pathname.match(/\/product\/([^/]+)\.html$/)?.[1]
      || new URLSearchParams(location.search).get('slug');
    const entry = detail ? config.products?.[slug] : config.factory;
    if (!entry?.src) return;
    const url = new URL(entry.src, location.origin);
    if (!['https:', 'http:'].includes(url.protocol)) return;
    let embed = null;
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      const id = url.hostname === 'youtu.be' ? url.pathname.slice(1)
        : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      if (!/^[\w-]{11}$/.test(id || '')) return;
      embed = `https://www.youtube-nocookie.com/embed/${id}`;
    } else if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) {
      const id = url.pathname.match(/\/(?:video\/)?(\d+)$/)?.[1];
      if (!id) return;
      embed = `https://player.vimeo.com/video/${id}${url.searchParams.has('h') ? '?h=' + encodeURIComponent(url.searchParams.get('h')) : ''}`;
    } else if (['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname)) {
      // Use the original public video URL, rather than a share redirect.
      if (!/^\/reel\/\d+\/?$/.test(url.pathname)
        && !/^\/[^/]+\/videos\/\d+\/?$/.test(url.pathname)
        && !(url.pathname === '/watch/' && /^\d+$/.test(url.searchParams.get('v') || ''))) return;
      embed = 'https://www.facebook.com/plugins/video.php?' + new URLSearchParams({
        href: url.href, show_text: 'false', width: '960'
      });
    } else if (!/\.(mp4|webm)$/i.test(url.pathname)) return;
    const gallery = detail?.querySelector('.product-gallery');
    const imageWrap = gallery?.querySelector('.product-main-image-wrap');
    if (detail && !imageWrap) return;
    const container = detail ? imageWrap : home.querySelector('.container');
    const frame = document.createElement('div');
    frame.className = 'video-showcase';
    // Embedded players cannot expose cross-origin video dimensions.
    // Store their source ratio explicitly; local videos use loadedmetadata.
    const ratio = entry.aspectRatio;
    if (typeof ratio === 'string' && /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(ratio)) {
      const [width, height] = ratio.split('/').map(Number);
      if (width > 0 && height > 0) {
        frame.style.aspectRatio = `${width} / ${height}`;
        if (detail) frame.style.maxWidth = `${400 * width / height}px`;
      }
    }
    const player = document.createElement(embed ? 'iframe' : 'video');
    if (embed) {
      if (!detail) player.src = embed;
      player.title = entry.title || (detail ? 'Product demonstration video' : 'Kanapet factory tour');
      player.loading = 'lazy';
      player.allow = 'fullscreen; picture-in-picture; encrypted-media';
      player.allowFullscreen = true;
      player.referrerPolicy = 'strict-origin-when-cross-origin';
    } else {
      player.src = url.href;
      player.controls = true;
      player.addEventListener('loadedmetadata', () => {
        if (player.videoWidth && player.videoHeight) {
          frame.style.aspectRatio = `${player.videoWidth} / ${player.videoHeight}`;
          if (detail) frame.style.maxWidth = `${400 * player.videoWidth / player.videoHeight}px`;
        }
      });
      player.preload = 'none';
      player.playsInline = true;
      player.setAttribute('aria-label', entry.title || 'Video');
      if (entry.poster) {
        const poster = new URL(entry.poster, location.origin);
        if (['https:', 'http:'].includes(poster.protocol)) player.poster = poster.href;
      }
      player.addEventListener('error', () => {
        const message = document.createElement('p');
        message.className = 'video-error';
        message.textContent = 'This video is currently unavailable. Please contact us for a product demonstration.';
        frame.replaceChildren(message);
      });
    }
    frame.appendChild(player);
    container.appendChild(frame);
    if (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com')) {
      const fallback = document.createElement('a');
      fallback.href = url.href;
      fallback.target = '_blank';
      fallback.rel = 'noopener noreferrer';
      fallback.textContent = 'Watch on Facebook';
      fallback.className = 'btn btn-ghost';
      fallback.style.marginTop = '16px';
      container.appendChild(fallback);
    }
    if (detail) {
      frame.classList.add('gallery-video');
      frame.hidden = true;
      const image = imageWrap.querySelector('#product-main-image');
      const placeholder = imageWrap.querySelector('.placeholder');
      let thumbnails = gallery.querySelector('.product-thumbnails');
      function showImage() {
        frame.hidden = true;
        if (embed) player.removeAttribute('src'); else player.pause();
        image.style.display = '';
        if (placeholder) placeholder.style.display = 'none';
        videoThumb.classList.remove('active');
      }
      if (!thumbnails) {
        thumbnails = document.createElement('div');
        thumbnails.className = 'product-thumbnails';
        imageWrap.after(thumbnails);
        const first = document.createElement('button');
        first.type = 'button';
        first.className = 'product-thumb active';
        first.setAttribute('aria-label', 'View product main image');
        const preview = document.createElement('img');
        preview.src = image.src;
        preview.alt = 'Product main image';
        first.appendChild(preview);
        first.addEventListener('click', () => { showImage(); first.classList.add('active'); });
        thumbnails.appendChild(first);
      }
      const videoThumb = document.createElement('button');
      videoThumb.type = 'button';
      videoThumb.className = 'product-thumb product-video-thumb';
      videoThumb.setAttribute('aria-label', 'View product video');
      videoThumb.textContent = '▶ Video';
      thumbnails.children[0].after(videoThumb);
      videoThumb.addEventListener('click', () => {
        image.style.display = 'none';
        if (placeholder) placeholder.style.display = 'none';
        frame.hidden = false;
        if (embed && !player.hasAttribute('src')) player.src = embed;
        thumbnails.querySelectorAll('.product-thumb').forEach(item => item.classList.remove('active'));
        videoThumb.classList.add('active');
      });
      detail.addEventListener('click', event => {
        if (event.target.closest('.product-video-thumb')) return;
        if (event.target.closest('.product-thumb, .color-swatch, .material-option')) showImage();
      }, true);
    } else home.hidden = false;
  } catch (error) {
    console.warn('Video configuration unavailable:', error.message);
  }
})();
