// Sync and verify accessory recommendations without rebuilding customized pages.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = resolve(process.argv[2] || '.');
const catalog = JSON.parse(readFileSync(resolve(root, 'public/data/products.json'), 'utf8'));
const context = vm.createContext({document:{addEventListener(){}},console,URLSearchParams,catalog});
vm.runInContext(readFileSync(resolve(root,'public/js/main.js'),'utf8'),context);
vm.runInContext('products = catalog',context);
function bounds(html, start) {
  const tags = /<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
  tags.lastIndex=start;
  let depth=0;
  for(let m; (m=tags.exec(html));) {
    if(/^<div\b/i.test(m[0])) depth++;
    if(/^<\/div\s*>/i.test(m[0]) && --depth===0) return {start,end:tags.lastIndex,close:m.index};
  }
  throw new Error('Unclosed product section');
}
let changed=0;
for(const product of catalog) {
  context.fixture=product;
  let output=vm.runInContext('renderCompatibleAccessories(fixture)',context);
  const expected={'bird-cages':'bird-accessories','bird-travel':'bird-accessories','hamster-cages':'hamster-accessories'}[product.category];
  const slugs=[...output.matchAll(/\/product\/([^']+)\.html/g)].map(m=>m[1]);
  for(const slug of slugs) {
    const acc=catalog.find(p=>p.slug===slug);
    assert.equal(acc.category,expected,`${product.slug}: wrong animal accessory`);
    if(acc.accessory_type==='dedicated') assert.ok(acc.compatible_with.includes(product.id));
  }
  if(expected) assert.ok(slugs.length,`${product.slug}: missing recommendations`);
  else assert.equal(output,'');
  // Keep event-handler markup well formed for static HTML.
  output=output.replace(/ onerror="[^"]*"/g,'');
  const file=resolve(root,`public/product/${product.slug}.html`);
  let html=readFileSync(file,'utf8');
  const original=html;
  const at=html.indexOf('<div class="compatible-accessories-section">');
  if(at>=0){const b=bounds(html,at);html=html.slice(0,b.start)+output+html.slice(b.end);}
  else if(output){const match=/<div\b[^>]*id="product-detail"[^>]*>/.exec(html);assert.ok(match);const b=bounds(html,match.index);html=html.slice(0,b.close)+output+html.slice(b.close);}
  html=html.replace(/js\/main.js\?v=19/g,'js/main.js?v=20');
  if(html!==original){writeFileSync(file,html);changed++;}
}
console.log(`Accessory categories verified for ${catalog.length} products; updated ${changed} pages.`);