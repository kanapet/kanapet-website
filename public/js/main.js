// Kanapet Website — Main JS
let products = [];
let categories = {};

// Color name to hex mapping
const COLOR_MAP = {
  'White': '#ffffff',
  'Black': '#1a1a1a',
  'Blue': '#4a90d9',
  'Pink': '#f8b4c4',
  'Green': '#7cb342',
  'Yellow': '#ffd54f',
  'Purple': '#9c27b0',
  'Gray': '#9e9e9e',
  'Red': '#e74c3c',
  'Orange': '#F8AC15',
  'Transparent': 'transparent',
  'Semi-Transparent': '#b0bec5',
  'Multi-color': 'multi',
  'White/Blue': '#4a90d9',
  'White/Pink': '#f8b4c4',
};

// Render color swatches HTML
function renderSwatches(colors, size = 'small', activeColor = null, productId = null) {
  if (!colors || colors.length === 0) return '';
  const sizeClass = size === 'large' ? '' : '';
  const swatches = colors.map((c, i) => {
    const colorVal = COLOR_MAP[c] || '#cccccc';
    const isTransparent = c === 'Transparent' || colorVal === 'transparent';
    const isMulti = c === 'Multi-color' || colorVal === 'multi';
    const cls = isTransparent ? 'color-swatch transparent' : (isMulti ? 'color-swatch multi' : 'color-swatch');
    const active = activeColor === c ? 'active' : '';
    const bg = isTransparent || isMulti ? '' : `background-color:${colorVal};`;
    const onclick = productId ? `onclick="switchProductColor('${productId}', '${c}')"` : '';
    return `<span class="${cls} ${active}" style="${bg};cursor:pointer;" title="${c}" data-color="${c}" ${onclick}></span>`;
  }).join('');
  const label = colors.length > 1 ? `<span class="color-swatch-label">${colors.length} colors</span>` : '';
  return `<div class="color-swatches">${swatches}${label}</div>`;
}

// Switch product image by color
function switchProductColor(productId, colorName) {
  const product = products.find(p => p.id === productId);
  if (!product || !product.color_images) return;
  
  const colorImg = product.color_images[colorName];
  if (!colorImg) return;
  
  // Update main image
  const mainImg = document.getElementById('product-main-image');
  if (mainImg) {
    mainImg.src = colorImg;
    mainImg.alt = `${product.name} - ${colorName}`;
  }
  
  // Update active swatch
  document.querySelectorAll('.product-colors .color-swatch').forEach(sw => {
    sw.classList.remove('active');
    if (sw.dataset.color === colorName) sw.classList.add('active');
  });
  
  // Update thumbnails active state
  document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
}

// Switch product image by material/configuration
function switchProductMaterial(productId, materialIndex) {
  const product = products.find(p => p.id === productId);
  if (!product || !product.material_options) return;
  
  const material = product.material_options[materialIndex];
  if (!material || !material.image) return;
  
  // Update main image
  const mainImg = document.getElementById('product-main-image');
  if (mainImg) {
    mainImg.src = material.image;
    mainImg.alt = `${product.name} - ${material.name}`;
  }
  
  // Update active material button
  document.querySelectorAll('.material-btn').forEach((btn, i) => {
    btn.classList.remove('active');
    if (i === materialIndex) btn.classList.add('active');
  });
  
  // Update thumbnails active state
  document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
}

// Load data (embedded first, fetch fallback)
async function loadData() {
  // Use embedded data if available (works with file:// protocol)
  if (window.KANAPET_PRODUCTS && window.KANAPET_CATEGORIES) {
    products = window.KANAPET_PRODUCTS;
    categories = window.KANAPET_CATEGORIES;
    return;
  }
  try {
    const [pRes, cRes] = await Promise.all([
      fetch('data/products.json'),
      fetch('data/categories.json')
    ]);
    products = await pRes.json();
    categories = await cRes.json();
  } catch (e) {
    console.error('Data load failed:', e);
    products = [];
    categories = {};
  }
}

// Format size: cm primary + inch conversion
function formatSize(size) {
  if (!size) return '';
  // Normalize non-string sizes: {w,d,h} objects (cm) -> "w*d*h cm", numbers -> string
  let s;
  if (typeof size === 'string') {
    s = size;
  } else if (typeof size === 'object') {
    const dims = ['w', 'd', 'h'].map(k => size[k]).filter(v => v !== undefined && v !== null && v !== '');
    if (dims.length) {
      s = dims.join('*') + ' cm';
    } else {
      const kv = Object.entries(size).filter(([, v]) => v !== undefined && v !== null && v !== '');
      if (!kv.length) return '';
      s = kv.map(([k, v]) => `${k}: ${v}`).join(', ');
    }
  } else {
    s = String(size);
  }

  // 替换分隔符 * 和 x 为 ×
  s = s.replace(/\*/g, ' × ').replace(/(\d)x(\d)/gi, '$1 × $2');
  
  // 中文括号转英文
  s = s.replace(/（/g, '(').replace(/）/g, ')');
  
  // 如果是 W×D×H 纯数字格式，添加单位和inch换算
  const dimMatch = s.match(/^([\d.]+)\s*×\s*([\d.]+)\s*×\s*([\d.]+)/);
  if (dimMatch) {
    const w = parseFloat(dimMatch[1]);
    const d = parseFloat(dimMatch[2]);
    const h = parseFloat(dimMatch[3]);
    const rest = s.substring(dimMatch[0].length).trim();
    const inchW = (w / 2.54).toFixed(1);
    const inchD = (d / 2.54).toFixed(1);
    const inchH = (h / 2.54).toFixed(1);
    return `${w} × ${d} × ${h} cm (${inchW} × ${inchD} × ${inchH} in)${rest ? ' ' + rest : ''}`;
  }
  
  // 直径格式 Φ17 或 Φ5.5-6
  const phiMatch = s.match(/^[Φφ]\s*([\d.]+)(?:-([\d.]+))?/);
  if (phiMatch) {
    const d1 = parseFloat(phiMatch[1]);
    const d2 = phiMatch[2] ? parseFloat(phiMatch[2]) : null;
    const inch1 = (d1 / 2.54).toFixed(1);
    if (d2) {
      const inch2 = (d2 / 2.54).toFixed(1);
      return `Φ${d1}-${d2} cm (Φ${inch1}-${inch2} in)`;
    }
    return `Φ${d1} cm (Φ${inch1} in)`;
  }
  
  // 单数字尺寸（如19.3）
  const singleMatch = s.match(/^([\d.]+)$/);
  if (singleMatch) {
    const v = parseFloat(singleMatch[1]);
    return `${v} cm (${(v / 2.54).toFixed(1)} in)`;
  }
  
  // 其他格式：如果没有cm单位，加上cm
  if (!/cm|inch|in\b/i.test(s)) {
    s = s + ' cm';
  }
  
  return s;
}

// Product card HTML
function productCard(p, variantCount = 1) {
  const catName = categories[p.category]?.name || p.category;
  return `
    <div class="product-card" data-cat="${p.category}">
      <a href="product.html?slug=${p.slug}" class="product-img-link">
        <div class="product-img">
          <img src="${p.image}" alt="${p.name}" width="800" height="800" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="placeholder" style="display:none;align-items:center;justify-content:center;width:100%;height:100%;font-size:48px;color:var(--primary-light);opacity:0.3;">📦</div>
        </div>
      </a>
      <div class="product-info">
        <a href="product.html?slug=${p.slug}" class="product-name-link"><h3>${p.name}</h3></a>
        <div class="product-meta">${formatSize(p.size)}</div>
        <div class="product-meta">${catName}</div>
        ${renderSwatches(p.colors)}
        <div class="product-moq">${p.moq ? `MOQ: ${p.moq} pcs` : 'Contact for MOQ'}</div>
        <a href="product.html?slug=${p.slug}" class="btn btn-primary">Request Quote</a>
      </div>
    </div>
  `;
}

// Featured products on homepage (one per series)
function renderFeatured(containerId, count = 8) {
  const el = document.getElementById(containerId);
  if (!el || !products.length) return;
  // Pick representative products across categories, one per series
  const featured = [];
  const seenSeries = new Set();
  const priority = ['650 Standard TI', '490 Standard TI', '75 Hamster Cage', '62 Hamster Cage', '43 Hamster Cage', '70 folding cage', 'WD42 Take out cage', 'Turtle Tank'];
  for (const name of priority) {
    const found = products.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
    if (found && !seenSeries.has(found.series)) {
      featured.push(found);
      seenSeries.add(found.series);
    }
  }
  // Fill remaining with one per series
  for (const p of products) {
    if (featured.length >= count) break;
    if (!seenSeries.has(p.series)) {
      featured.push(p);
      seenSeries.add(p.series);
    }
  }
  el.innerHTML = featured.slice(0, count).map(p => productCard(p, 1)).join('');
}

// All products on products page (each product shown individually)
function renderProducts(containerId, filterCat = null, filterColor = null) {
  const el = document.getElementById(containerId);
  if (!el || !products.length) return;
  let list = products;
  // Filter out dedicated accessories (only shown on their compatible cage's detail page)
  list = list.filter(p => p.accessory_type !== 'dedicated');
  if (filterCat) {
    list = list.filter(p => p.category === filterCat);
  }
  if (filterColor) {
    list = list.filter(p => p.colors && p.colors.some(c => c.toLowerCase() === filterColor.toLowerCase()));
  }
  if (list.length === 0) {
    el.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:40px;color:var(--text-light)">No products found.</p>';
    return;
  }
  // Show each product individually (no series grouping)
  el.innerHTML = list.map(p => productCard(p, 0)).join('');
}

// Product detail page
function renderProductDetail() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  if (!slug) return;
  const p = products.find(x => x.slug === slug);
  const el = document.getElementById('product-detail');
  if (!el || !p) {
    if (el) el.innerHTML = '<p style="text-align:center;padding:60px;">Product not found. <a href="products.html">Back to products</a></p>';
    return;
  }
  const catName = categories[p.category]?.name || '';
  
  // SEO: Optimized title with keywords
  document.title = `${p.name} | Wholesale ${catName} Manufacturer — Kanapet Since 1991`;
  
  // SEO: Optimized meta description with selling points
  const descParts = [
    `Buy ${p.name} wholesale from Kanapet — leading ${catName.toLowerCase()} manufacturer since 1991.`,
    p.size ? ` Product size: ${formatSize(p.size)}.` : '',
    p.moq ? ` MOQ from ${p.moq} pcs.` : '',
    ' OEM/ODM available, custom colors, logos and packaging. 20,000㎡ factory in Foshan, China. Request a quote today.'
  ];
  document.querySelector('meta[name="description"]')?.setAttribute('content', descParts.join(''));
  
  // SEO: Keywords meta tag
  let keywords = document.querySelector('meta[name="keywords"]');
  if (!keywords) {
    keywords = document.createElement('meta');
    keywords.name = 'keywords';
    document.head.appendChild(keywords);
  }
  keywords.content = `${p.name}, wholesale ${catName.toLowerCase()}, ${catName.toLowerCase()} manufacturer, OEM pet cage, custom bird cage, hamster cage factory, Kanapet`;
  
  // Add canonical link
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `https://www.kanapet.com/product.html?slug=${p.slug}`;
  
  // Add Product JSON-LD structured data
  let jsonLd = document.getElementById('product-jsonld');
  if (!jsonLd) {
    jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.id = 'product-jsonld';
    document.head.appendChild(jsonLd);
  }
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": p.name,
    "image": `https://www.kanapet.com/${p.image}`,
    "description": `${p.name} — ${catName}. OEM/ODM available from Kanapet, pet cage manufacturer since 1991.`,
    "brand": {
      "@type": "Brand",
      "name": "Kanapet"
    },
    "category": catName,
    "offers": {
      "@type": "AggregateOffer",
      "availability": "https://schema.org/InStock",
      "priceCurrency": "USD",
      "lowPrice": "Contact for pricing",
      "offerCount": "1"
    }
  };
  jsonLd.textContent = JSON.stringify(productJsonLd);
  
  // Update breadcrumb
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) {
    breadcrumb.innerHTML = `<a href="index.html" style="color:#fff;">Home</a> / <a href="products.html" style="color:#fff;">Products</a> / <a href="products.html?cat=${p.category}" style="color:#fff;">${catName}</a> / ${p.name}`;
  }
  
  // Generate product description based on category
  const isCage = p.category.includes('cages');
  const isAccessory = p.category.includes('accessories');
  const isBird = p.category.includes('bird');
  const isHamster = p.category.includes('hamster');
  
  let keyFeatures = [];
  if (isCage) {
    keyFeatures = [
      'Premium quality construction with durable materials',
      'Easy cleaning with removable tray and grille',
      'Multiple door designs for convenient access',
      'Compatible with range of accessories and add-ons',
      'OEM/ODM available — custom colors, logos and packaging'
    ];
  } else if (isAccessory) {
    keyFeatures = [
      'Made from food-grade, pet-safe materials',
      'Easy to install and clean',
      'Compatible with most standard cage models',
      'Available in multiple colors and sizes',
      'Bulk pricing available for wholesale orders'
    ];
  } else {
    keyFeatures = [
      'High-quality construction for long-lasting use',
      'Designed for pet safety and comfort',
      'Competitive wholesale pricing',
      'OEM/ODM customization available'
    ];
  }
  
  let materials = 'ABS + PET plastic, stainless steel / iron wire options';
  if (isHamster && isCage) materials = 'High transparency PET + ABS plastic, stainless steel wire';
  if (isBird && isCage) materials = 'Iron wire / stainless steel + ABS plastic base';
  if (isAccessory) materials = 'Food-grade ABS + PET plastic, safe for pets';
  
  let accessories = 'Contact us for complete accessory list';
  if (isCage) accessories = 'Feeding cups, perches/stands, water bottle (varies by model)';
  
  const descriptionHTML = `
    <div style="margin:20px 0;">
      <h3 style="font-size:16px;margin-bottom:10px;color:var(--text);">Key Features</h3>
      <ul style="padding-left:20px;margin:0;color:var(--text-light);font-size:14px;line-height:1.8;">
        ${keyFeatures.map(f => `<li>${f}</li>`).join('')}
      </ul>
    </div>
    <div style="margin:20px 0;">
      <h3 style="font-size:16px;margin-bottom:10px;color:var(--text);">Materials</h3>
      <p style="color:var(--text-light);font-size:14px;margin:0;">${materials}</p>
    </div>
    <div style="margin:20px 0;">
      <h3 style="font-size:16px;margin-bottom:10px;color:var(--text);">Included Accessories</h3>
      <p style="color:var(--text-light);font-size:14px;margin:0;">${accessories}</p>
    </div>
    <div style="margin:20px 0;">
      <h3 style="font-size:16px;margin-bottom:10px;color:var(--text);">Customization</h3>
      <p style="color:var(--text-light);font-size:14px;margin:0;">We offer OEM/ODM services including custom colors, logo printing, custom packaging and private label. Minimum order quantities apply — contact us for details.</p>
    </div>
  `;

  const specs = [];
  if (p.type) specs.push(['Type', p.type]);
  if (p.size) specs.push(['Product Size (W×D×H)', formatSize(p.size)]);
  if (p.meas) specs.push(['Carton Size (W×D×H)', formatSize(p.meas)]);
  if (p.net_weight) specs.push(['Net Weight', p.net_weight + ' kg']);
  if (p.gross_weight) specs.push(['Gross Weight', p.gross_weight + ' kg']);
  if (p.cbm) specs.push(['CBM', p.cbm + ' m³']);
  if (p.pcs_per_ctn) specs.push(['PCS per Carton', p.pcs_per_ctn]);
  if (p.color) specs.push(['Color', p.color]);
  if (p.accessories) specs.push(['Included Accessories', p.accessories]);
  if (p.moq) specs.push(['MOQ', p.moq + ' pcs']);
  if (p.notes) specs.push(['Notes', p.notes]);

  // Find all variants in same series
  const variants = products.filter(x => x.series === p.series);
  let variantsTable = '';
  if (variants.length > 1) {
    variantsTable = `
      <div style="margin:20px 0;">
        <h3 style="font-size:16px;margin-bottom:12px;color:var(--text);">Available Configurations (${variants.length} options)</h3>
        <div style="overflow-x:auto;">
          <table class="spec-table" style="font-size:13px;">
            <tr><th>Model</th><th>Size</th><th>MOQ</th><th></th></tr>
            ${variants.map(v => `
              <tr style="${v.id === p.id ? 'background:var(--bg-soft);font-weight:600;' : ''}">
                <td>${v.name}</td>
                <td>${formatSize(v.size) || '-'}</td>
                <td>${v.moq || 'Contact'}</td>
                <td><a href="product.html?slug=${v.slug}" style="color:var(--primary);font-size:12px;white-space:nowrap;">${v.id === p.id ? 'Current' : 'View'}</a></td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
  }

  // Build gallery images (main image + gallery array)
  // If product has color_images or material_options, use first option image as default main image
  let defaultMainImage = p.image;
  if (p.material_options && p.material_options.length > 0) {
    defaultMainImage = p.material_options[0].image || p.image;
  } else if (p.color_images && p.colors && p.colors.length > 0) {
    defaultMainImage = p.color_images[p.colors[0]] || p.image;
  }
  const galleryImages = [defaultMainImage];
  if (p.gallery && Array.isArray(p.gallery)) {
    p.gallery.forEach(g => {
      if (g && !galleryImages.includes(g)) galleryImages.push(g);
    });
  }
  
  const thumbnailsHTML = galleryImages.length > 1 ? `
    <div class="product-thumbnails">
      ${galleryImages.map((img, i) => `
        <div class="product-thumb ${i === 0 ? 'active' : ''}" onclick="switchProductImage(this, '${img}')">
          <img src="${img}" alt="${p.name} view ${i+1}" loading="lazy">
        </div>
      `).join('')}
    </div>
  ` : '';
  
  el.innerHTML = `
    <div class="product-gallery">
      <div class="product-main-image-wrap">
        <img id="product-main-image" src="${galleryImages[0]}" alt="${p.name}" class="zoomable" onclick="openLightbox(this.src)" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="placeholder" style="display:none;align-items:center;justify-content:center;width:100%;height:100%;">📦</div>
      </div>
      ${thumbnailsHTML}
      <div style="margin-top:8px;font-size:12px;color:var(--text-light);text-align:center;">🔍 Click image to zoom ${galleryImages.length > 1 ? '| Click thumbnails to switch' : ''}</div>
    </div>
    <div class="product-detail-info">
      <div style="font-size:13px;color:var(--primary);font-weight:600;margin-bottom:8px;">${catName}</div>
      <h1>${p.name}</h1>
      <div class="product-sku">SKU: ${p.id.toUpperCase()} | OEM/ODM Available</div>
      ${p.colors && p.colors.length > 1 ? `
      <div class="product-colors">
        <h3>Available Colors</h3>
        ${renderSwatches(p.colors, 'large', p.colors[0], p.id)}
      </div>` : ''}
      ${p.material_options && p.material_options.length > 1 ? `
      <div class="product-colors">
        <h3>Material / Configuration</h3>
        <div class="material-options">
          ${p.material_options.map((m, i) => `
            <button class="material-btn ${i === 0 ? 'active' : ''}" onclick="switchProductMaterial('${p.id}', ${i})">${m.name}</button>
          `).join('')}
        </div>
      </div>` : ''}
      <table class="spec-table">
        ${specs.map(([k,v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}
      </table>
      ${descriptionHTML}
      ${variantsTable}
      <div class="inquiry-box">
        <h3>Interested in this product?</h3>
        <p>Send us your quantity and requirements — we'll reply within one business day with a wholesale quote.</p>
        <a href="contact.html?product=${encodeURIComponent(p.name)}" class="btn btn-primary" style="width:100%;">Request a Quote</a>
        <div style="margin-top:12px;text-align:center;">
          <a href="https://wa.me/8615221878306?text=${encodeURIComponent('Hi Kanapet, I am interested in ' + p.name)}" target="_blank" rel="noopener" style="font-size:14px;font-weight:600;">💬 Or chat on WhatsApp</a>
        </div>
      </div>
    </div>
    ${renderCompatibleAccessories(p)}
  `;
  
  // Render related products
  renderRelatedProducts(p);
  
  // Add Product structured data (JSON-LD)
  const existingSchema = document.getElementById('product-schema');
  if (existingSchema) existingSchema.remove();
  const schema = document.createElement('script');
  schema.type = 'application/ld+json';
  schema.id = 'product-schema';
  schema.textContent = JSON.stringify({
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": p.name,
    "image": window.location.origin + '/' + p.image,
    "description": `${p.name} — ${catName}. ${p.size ? 'Size: ' + formatSize(p.size) + '. ' : ''}MOQ: ${p.moq || 'contact us'}. OEM/ODM available from Kanapet, manufacturer since 1991.`,
    "brand": { "@type": "Brand", "name": "Kanapet" },
    "manufacturer": { "@type": "Organization", "name": "Kanapet" },
    "offers": {
      "@type": "Offer",
      "availability": "https://schema.org/InStock",
      "priceCurrency": "USD",
      "price": "0",
      "priceValidUntil": "2027-12-31",
      "url": window.location.href
    }
  });
  document.head.appendChild(schema);
}

// Render related products (same category, excluding current product)
function renderRelatedProducts(product) {
  const section = document.getElementById('related-products-section');
  const grid = document.getElementById('related-products-grid');
  if (!section || !grid) return;
  
  let selected = [];
  
  // If product has custom related_products, use that order
  if (product.related_products && product.related_products.length > 0) {
    selected = product.related_products
      .map(id => products.find(p => p.id === id))
      .filter(p => p && p.id !== product.id);
  } else {
    // Find products in same category, excluding current product and dedicated accessories
    const related = products.filter(p => 
      p.category === product.category && 
      p.id !== product.id &&
      p.accessory_type !== 'dedicated'
    );
    selected = related;
  }
  
  if (selected.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  // Show up to 4 related products
  const showCount = Math.min(selected.length, 4);
  selected = selected.slice(0, showCount);
  
  grid.innerHTML = selected.map(p => `
    <div class="related-product-card" onclick="window.location.href='product.html?slug=${p.slug}'">
      <div class="related-product-image">
        <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'placeholder\\'>📦</div>'">
      </div>
      <div class="related-product-info">
        <h3>${p.name}</h3>
        ${p.size ? `<p class="related-product-size">${formatSize(p.size)}</p>` : ''}
        <span class="related-product-link">View Details →</span>
      </div>
    </div>
  `).join('');
  
  section.style.display = 'block';
}

// Render compatible accessories section for cage products
function renderCompatibleAccessories(product) {
  // Only show for cage products
  if (!product.category || !product.category.includes('cage')) return '';
  
  // Find dedicated accessories compatible with this product
  const compatible = products.filter(p => 
    p.accessory_type === 'dedicated' && 
    p.compatible_with && 
    p.compatible_with.includes(product.id)
  );
  
  // Also find recommended universal accessories (same category)
  const recommended = products.filter(p => 
    p.accessory_type === 'universal' && 
    p.category === 'hamster-accessories' &&
    !p.id.includes('shelf')
  ).slice(0, 4);
  
  if (compatible.length === 0 && recommended.length === 0) return '';
  
  let html = '<div class="compatible-accessories-section">';
  
  if (compatible.length > 0) {
    html += `
      <h3 style="margin-bottom:16px;color:var(--primary);">🔧 Compatible Accessories for This Cage</h3>
      <div class="accessory-grid">
        ${compatible.map(acc => `
          <div class="accessory-card" onclick="window.location.href='product.html?slug=${acc.slug}'">
            <div class="accessory-image">
              <img src="${acc.image}" alt="${acc.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'placeholder\\'>📦</div>'">
            </div>
            <div class="accessory-info">
              <h3>${acc.name}</h3>
              ${acc.size ? `<p class="accessory-size">${formatSize(acc.size)}</p>` : ''}
              <span class="dedicated-badge">Dedicated Fit</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  if (recommended.length > 0) {
    html += `
      <h3 style="margin:32px 0 16px;color:var(--primary);">⭐ Recommended Universal Accessories</h3>
      <div class="accessory-grid">
        ${recommended.map(acc => `
          <div class="accessory-card" onclick="window.location.href='product.html?slug=${acc.slug}'">
            <div class="accessory-image">
              <img src="${acc.image}" alt="${acc.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'placeholder\\'>📦</div>'">
            </div>
            <div class="accessory-info">
              <h3>${acc.name}</h3>
              ${acc.size ? `<p class="accessory-size">${formatSize(acc.size)}</p>` : ''}
              <span class="universal-badge">Universal Fit</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

// Category filter buttons on products page
function setupFilters() {
  const btns = document.querySelectorAll('.filter-btn');
  if (!btns.length) return;
  const params = new URLSearchParams(window.location.search);
  const activeCat = params.get('cat');
  let activeColor = null;
  
  // Build color filter
  const colorBar = document.getElementById('color-filter-bar');
  if (colorBar) {
    colorBar.style.display = 'flex';
    const allColors = new Set();
    products.forEach(p => {
      if (p.colors) p.colors.forEach(c => allColors.add(c));
    });
    if (allColors.size > 0) {
      colorBar.style.display = 'flex';
      allColors.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'color-filter-btn';
        btn.dataset.color = color;
        const colorVal = COLOR_MAP[color] || '#ccc';
        btn.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${colorVal};margin-right:6px;vertical-align:middle;border:1px solid #ddd;"></span>${color}`;
        btn.style.cssText = 'padding:6px 14px;border:1px solid var(--border);border-radius:20px;background:#fff;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;';
        btn.addEventListener('click', () => {
          document.querySelectorAll('.color-filter-btn').forEach(b => {
            b.style.background = '#fff';
            b.style.color = 'var(--text)';
          });
          btn.style.background = 'var(--primary)';
          btn.style.color = '#fff';
          activeColor = btn.dataset.color || null;
          const cat = document.querySelector('.filter-btn.active')?.dataset.cat || '';
          renderProducts('all-products', cat || null, activeColor);
        });
        colorBar.appendChild(btn);
      });
      // All colors button
      const allBtn = colorBar.querySelector('.color-filter-btn[data-color=""]');
      if (allBtn) {
        allBtn.addEventListener('click', () => {
          document.querySelectorAll('.color-filter-btn').forEach(b => {
            b.style.background = '#fff';
            b.style.color = 'var(--text)';
          });
          allBtn.style.background = 'var(--primary)';
          allBtn.style.color = '#fff';
          activeColor = null;
          const cat = document.querySelector('.filter-btn.active')?.dataset.cat || '';
          renderProducts('all-products', cat || null, null);
        });
      }
    }
  }
  
  btns.forEach(btn => {
    if (btn.dataset.cat === activeCat) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      renderProducts('all-products', cat || null, activeColor);
      const url = cat ? `products.html?cat=${cat}` : 'products.html';
      history.replaceState(null, '', url);
    });
  });
  renderProducts('all-products', activeCat || null, activeColor);
}

// Contact form — prefill product if coming from product page
function setupContactForm() {
  const form = document.getElementById('inquiry-form');
  if (!form) return;
  const params = new URLSearchParams(window.location.search);
  const product = params.get('product');
  if (product) {
    const productField = form.querySelector('[name="product"]');
    if (productField) productField.value = decodeURIComponent(product);
  }

  // 飞书机器人Webhook（安全设置：签名校验）
  const FEISHU_WEBHOOK_URL = 'https://open.feishu.cn/open-apis/bot/v2/hook/dff1917e-a319-4331-88b1-8b4074071c3d';
  const FEISHU_SECRET = 'E9nzLCx2VyL5Dd13luiqmb';

  // 飞书签名算法：以 "timestamp\nsecret" 为密钥对空串做 HMAC-SHA256，再 base64 编码
  async function feishuSign(timestamp, secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(timestamp + '\n' + secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new Uint8Array(0));
    return btoa(String.fromCharCode.apply(null, new Uint8Array(sig)));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    // 获取表单数据
    const formData = new FormData(form);
    const data = {
      name: formData.get('name'),
      company: formData.get('company') || '-',
      email: formData.get('email'),
      country: formData.get('country'),
      product: formData.get('product') || '-',
      message: formData.get('message'),
      time: new Date().toLocaleString('en-US', {timeZone: 'Asia/Shanghai'})
    };

    // 构建飞书消息内容
    const feishuMsg = {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: '🔔 新询盘 — Kanapet独立站'
          },
          template: 'blue'
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content:
                `**👤 姓名：** ${data.name}\n` +
                `**🏢 公司：** ${data.company}\n` +
                `**📧 邮箱：** ${data.email}\n` +
                `**🌍 国家：** ${data.country}\n` +
                `**📦 产品：** ${data.product}\n` +
                `**💬 留言：** ${data.message}\n` +
                `**⏰ 时间：** ${data.time}`
            }
          }
        ]
      }
    };

    // 提交到飞书（签名校验模式：需附带 timestamp 和 sign）
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = await feishuSign(timestamp, FEISHU_SECRET);
    fetch(FEISHU_WEBHOOK_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(Object.assign({}, feishuMsg, { timestamp: timestamp, sign: sign }))
    })
    .then(() => {
      form.innerHTML = `
        <div style="text-align:center;padding:40px 20px;">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <h3 style="font-size:22px;margin-bottom:10px;">Thank You!</h3>
          <p style="color:var(--text-light);margin-bottom:8px;">Your inquiry has been received.</p>
          <p style="color:var(--text-light);margin-bottom:20px;">We'll get back to you within one business day.</p>
          <a href="products.html" class="btn btn-ghost">Browse More Products</a>
        </div>
      `;
    })
    .catch((err) => {
      console.error('Error:', err);
      btn.textContent = 'Send Inquiry';
      btn.disabled = false;
      alert('Sorry, there was an error sending your inquiry. Please try again or email us directly at lena@kanapet.com');
    });
  });
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  // Auto-update "years since 1991" figures so they never go stale.
  // Usage: <span class="auto-years">35</span> → 35
  //        <span class="auto-years" data-suffix="+">35+</span> → 35+
  const yearsSinceFounding = new Date().getFullYear() - 1991;
  document.querySelectorAll('.auto-years').forEach(el => {
    el.textContent = el.dataset.suffix !== undefined
      ? yearsSinceFounding + el.dataset.suffix
      : String(yearsSinceFounding);
  });

  await loadData();
  renderFeatured('featured-products', 8);
  setupFilters();
  renderProductDetail();
  setupContactForm();
});

// Product image switch function
function switchProductImage(thumbEl, imgSrc) {
  const mainImg = document.getElementById('product-main-image');
  if (mainImg) {
    mainImg.src = imgSrc;
  }
  // Update active thumbnail
  document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
}

// Lightbox functions
function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (lb && img) {
    img.src = src;
    lb.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) {
    lb.classList.remove('active');
    document.body.style.overflow = '';
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});
