// Exercise the real legacy detail renderer with a minimal DOM, without network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
const catalog = JSON.parse(readFileSync(new URL('../public/data/products.json', import.meta.url), 'utf8'));
const categories = JSON.parse(readFileSync(new URL('../public/data/categories.json', import.meta.url), 'utf8'));

function render(product) {
  const nodes = new Map([['product-detail', { innerHTML: '' }]]);
  const context = vm.createContext({
    URLSearchParams, console, fixture: product, fixtureCategories: categories,
    window: { location: { search: `?slug=${product.slug}`, origin: 'https://www.kanapet.com' } },
    document: {
      addEventListener() {},
      getElementById(id) { return nodes.get(id) || null; },
      querySelector() { return { setAttribute() {} }; },
      createElement() { return { setAttribute() {} }; },
      head: { appendChild(node) { if (node.id) nodes.set(node.id, node); } }
    }
  });
  vm.runInContext(source, context);
  vm.runInContext('products = [fixture]; categories = fixtureCategories; renderProductDetail();', context);
  return nodes;
}

for (const slug of ['bird-parrot-nest', 'bird-parrot-nest-large']) {
  const p = catalog.find(p => p.slug === slug);
  const nodes = render(p);
  assert.ok(nodes.get('product-detail').innerHTML.includes(`SKU: ${p.sku} |`));
  for (const id of ['product-jsonld', 'product-schema']) {
    assert.equal(JSON.parse(nodes.get(id).textContent).sku, p.sku);
  }
}

const cup = catalog.find(p => p.slug === 'bird-feeder-cup-no1');
const nodes = render(cup);
assert.ok(nodes.get('product-detail').innerHTML.includes(
  '<th>Carton Size (W×D×H)</th><td>56.5 × 37 × 35 cm (22.2 × 14.6 × 13.8 in)</td>'
));
assert.equal(JSON.parse(nodes.get('product-jsonld').textContent).sku, cup.id.toUpperCase());

// The explicit carton_size field is authoritative when the legacy meas field differs.
const conflicting = render({ ...cup, meas: '10*20*30', carton_size: '40*50*60' });
assert.ok(conflicting.get('product-detail').innerHTML.includes(
  '<th>Carton Size (W×D×H)</th><td>40 × 50 × 60 cm (15.7 × 19.7 × 23.6 in)</td>'
));
const unknown = render({ ...cup, meas: '', carton_size: '' });
assert.ok(!unknown.get('product-detail').innerHTML.includes('<th>Carton Size (W×D×H)</th>'));
console.log('Product renderer regression checks passed');
