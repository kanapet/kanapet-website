"""Generate independent supply pages from actual catalog facts."""
import json,re,copy,html
from pathlib import Path
from sync_product_output import catalog_cards
ROOT=Path(__file__).resolve().parents[1];P=ROOT/'public';E=html.escape
def group(p):
 s=p['slug']
 if p['category']=='smart-pet-products':return 'Smart Feeding & Watering'
 if p['category']=='bird-accessories':
  if any(term in s for term in ('kettle','feeder','feeding')):return 'Feeders & Water Bottles'
  if 'bathroom' in s:return 'Bird Baths & Care'
  if 'nest' in s or 'breeding' in s:return 'Nests & Breeding Boxes'
  return 'Toys & Perches'
 if s=='hamster-universal-wheel':return 'Cage Caster Wheels'
 if 'pipe' in s or 'tube' in s:return 'Tubes, Connectors & Anti-Chew Ring'
 if 'wheel' in s or 'disc' in s:return 'Running Wheels & Exercise Disc'
 if 'ball' in s:return 'Running Balls'
 if 'bathroom' in s:return 'Bathrooms'
 if 'shelf' in s:return 'Shelf & Ladder Sets'
 if 'food-cup' in s:return 'Food Cup'
 return 'Heat Lamp'
def build():
 ps=json.loads((P/'data/products.json').read_text(encoding='utf-8'));cs=json.loads((P/'data/categories.json').read_text(encoding='utf-8'))
 source=(P/'products.html').read_text(encoding='utf-8');header=re.search(r'<header>.*?</header>',source,re.S)[0];footer=source[source.index('<footer>'):]
 for kind in ['bird','hamster']:
  subset=[p for p in ps if p['category'] == kind+'-accessories']
  groups={}
  for p in subset:groups.setdefault(group(p),[]).append(p)
  filters=''
  if kind=='bird':
   filters='<nav class="bird-supply-filters" aria-label="Bird accessory categories"><button type="button" class="active" data-filter="all">All Accessories</button>'+''.join(f'<button type="button" data-filter="{i}">{E(label)}</button>' for i,label in enumerate(groups))+'</nav>'
  sections=[]
  for i,(label,items) in enumerate(groups.items()):
   dedicated=any(p.get('accessory_type')=='dedicated' for p in items)
   note='<p>Some products in this group are model-specific. Confirm compatibility and whether they are ordered separately before purchasing.</p>' if dedicated else ''
   display=copy.deepcopy(items)
   for p in display:p.pop('accessory_type',None)
   sections.append(f'<section class="section bird-supply-group" data-group="{i}"><div class="container"><h2>{E(label)}</h2>{note}<div class="products-grid">{catalog_cards(display,cs)}</div></div></section>')
  name=kind.title();url='https://www.kanapet.com/'+kind+'-supplies.html';title=f'Wholesale {name} Supplies & Accessories | KANAPET'
  desc=f'Explore KANAPET {kind} supplies by product type. Compare existing models, dimensions and MOQ, and confirm compatibility and packaging for wholesale orders.'
  schema={'@context':'https://schema.org','@type':'CollectionPage','name':f'Wholesale {name} Supplies','url':url,'mainEntity':{'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i+1,'url':'https://www.kanapet.com/product/'+p['slug']+'.html','name':p['name']} for i,p in enumerate(subset)]}}
  filter_css='<style>.bird-supply-filters{display:flex;flex-wrap:wrap;gap:10px;margin:24px auto;max-width:1200px;padding:0 20px}.bird-supply-filters button{border:1px solid #d6deda;border-radius:24px;background:#fff;padding:10px 16px;cursor:pointer;font:inherit}.bird-supply-filters button.active{background:#087fbd;color:#fff}.bird-supply-group[hidden]{display:none}</style>' if kind=='bird' else ''
  filter_js='''<script>document.querySelectorAll('.bird-supply-filters button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.bird-supply-filters button').forEach(item=>item.classList.toggle('active',item===button));document.querySelectorAll('.bird-supply-group').forEach(section=>section.hidden=button.dataset.filter!=='all'&&section.dataset.group!==button.dataset.filter)}));</script>''' if kind=='bird' else ''
  s=f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{E(title)}</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{url}"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="{url}"><link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/categories.css"><link rel="icon" href="/favicon.ico">{filter_css}<script type="application/ld+json">{json.dumps(schema)}</script></head><body>{header}<main><section class="page-header"><div class="container"><p class="category-breadcrumb"><a href="products.html">All Products</a> / {name} Supplies</p><h1>Wholesale {name} Supplies &amp; Accessories</h1><p>Browse supplies as individual sourcing options, or confirm the accessories for your selected cage model.</p></div></section>{filters}{''.join(sections)}<section class="section"><div class="container"><h2>Plan your wholesale order</h2><p>Use the individual product pages to check dimensions, materials, MOQ and ordering notes. Unknown specifications and compatibility should be confirmed with our team.</p><h3>What should I include in my inquiry?</h3><p>Send the model names, quantities, colors, packaging requirements and the cage model if compatibility is relevant.</p><h3>Are all products included with a cage?</h3><p>Do not assume supplies are included. Check the selected cage configuration and confirm separately ordered accessories before placing an order.</p><p><a href="{kind}-cages.html">Explore {kind} cages</a> · <a href="oem-odm.html">OEM &amp; ODM services</a></p><a class="btn btn-primary" href="contact.html">Request a Quote</a></div></section></main>{footer}{filter_js}</body></html>"""
  (P/(kind+'-supplies.html')).write_text(s,encoding='utf-8');print(kind,len(subset),'supplies')
if __name__=='__main__':build()
