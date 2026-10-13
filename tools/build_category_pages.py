"""Build category landing pages from synchronized catalog cards."""
import re,json,html
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'public'
def build():
 source=(PUBLIC/'products.html').read_text(encoding='utf-8')
 header=re.search(r'<header>.*?</header>',source,re.S)[0]
 footer=source[source.index('<footer>'):]
 cards=re.findall(r'      <div class="product-card".*?(?=      <div class="product-card"|    </div>\n  </div>)',source,re.S)
 for kind in ['bird','hamster']:
  category=kind+'-cages';name=kind.title();path=category+'.html';url='https://www.kanapet.com/'+path
  selected=[c for c in cards if 'data-cat="'+category+'"' in c]
  assert selected,category
  title=f'Wholesale {name} Cages | KANAPET Manufacturer'
  desc=f'Explore wholesale {kind} cages from KANAPET. Compare product dimensions and MOQ, browse model details, and discuss private-label or OEM/ODM requirements.'
  guide=('Compare wire and transparent-door configurations, cage dimensions and matching stands. Check each model for its materials and available colors.' if kind=='bird' else 'Compare transparent and folding cage models by dimensions and configuration. Check the model details before selecting compatible wheels, tunnels and other accessories.')
  schema={'@context':'https://schema.org','@type':'CollectionPage','name':f'Wholesale {name} Cages','url':url,'mainEntity':{'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i+1,'url':'https://www.kanapet.com'+re.search(r'href="([^"]+)"',c)[1]} for i,c in enumerate(selected)]}}
  e=html.escape
  body=f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="{url}">
<link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/categories.css"><link rel="icon" href="/favicon.ico"><script type="application/ld+json">{json.dumps(schema)}</script></head><body>
{header}<main><section class="page-header"><div class="container"><p class="category-breadcrumb"><a href="products.html">All Products</a> / {name} Cages</p><h1>Wholesale {name} Cages</h1><p>Source {kind} cages for wholesale and private-label programs. Explore existing models or discuss a custom project with our manufacturing team.</p></div></section>
<section class="section"><div class="container"><h2>Choose a cage for your product range</h2><p>{guide}</p><p>Dimensions below describe the product. Review the detail page for carton information, material options and ordering notes.</p><div class="products-grid">{''.join(selected)}</div></div></section>
<section class="section"><div class="container"><h2>Procurement questions</h2><h3>What is the minimum order quantity?</h3><p>MOQ varies by model and configuration. Use each product page as the starting point and confirm the selected colors and carton quantities when requesting a quote.</p><h3>Can I request my own colors, logo or packaging?</h3><p>Discuss your private-label requirements with our team. For changes to the product design or tooling, see our <a href="oem-odm.html">OEM &amp; ODM manufacturing services</a>.</p><h3>What should I include in a quote request?</h3><p>Include the model, quantity, preferred colors, packaging requirements and destination market. Our team can review the configuration and confirm the order details.</p><h2>Build your sourcing shortlist</h2><p><a href="factory.html">Explore our factory capabilities</a> or <a href="{kind}-supplies.html">browse {kind} accessories</a>.</p><a class="btn btn-primary" href="contact.html">Request a Quote</a></div></section></main>{footer}
"""
  (PUBLIC/path).write_text(body,encoding='utf-8')
  print(path,len(selected),'models')
if __name__=='__main__':build()
