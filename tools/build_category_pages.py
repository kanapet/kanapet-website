"""Build category landing pages from synchronized catalog cards."""
import re,json,html
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'public'
from sync_product_output import format_size, format_moq, transparent_cage_guide
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
  products=[p for p in json.loads((PUBLIC/'data/products.json').read_text()) if p['category']==category]
  rows=''.join('<tr><th scope="row"><a href="/product/'+e(p['slug'])+'.html">'+e(p['name'])+'</a></th><td>'+e(format_size(p.get('size')).split(' (')[0] or 'Confirm dimensions')+'</td><td>'+e(p.get('material') or 'Confirm materials')+'</td><td>'+e(format_moq(p.get('moq')) or 'Confirm MOQ')+'</td></tr>' for p in products)
  comparison='<h2>Compare models and ordering specifications</h2><p>Compare overall product dimensions, listed materials and MOQ. Model numbers are product identifiers, not measurements. Confirm material options, included parts and packaging in the final quote.</p><div class="category-table" role="region" aria-label="'+name+' model comparison" tabindex="0"><table><caption>'+name+' cages'+(' and stands' if kind=='bird' else ' and enclosure')+' — current catalog specifications</caption><thead><tr><th scope="col">Model</th><th scope="col">Product dimensions (W × D × H)</th><th scope="col">Listed materials</th><th scope="col">MOQ</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
  selection = ('<h3>Door style, layers and stands</h3><p>Start with the 400, 470, 490 or 650 model family, then compare the actual dimensions above. Within the 490 range, review single, double and three-layer configurations separately. Stands and the climbing stand are listed as distinct products; confirm compatibility and whether they are included in your order.</p><p>The 650 PET-door and glass-door models have separate detail pages. Ask our team to confirm the selected door construction and final material specification.</p>' if kind=='bird' else '<h3>Transparent models, folding models and accessories</h3><p>Compare the 43, 62 and 75 transparent cages by their actual dimensions. The two 70 folding models share a footprint and differ in overall height. Compare the current dimensions in the table above.</p><p>The external enclosure is a separate product with dimensions available on request. Confirm connections, wheel clearance and included accessories for your chosen cage before ordering. Overall cage dimensions alone do not establish suitability for a particular animal.</p>')
  if kind == 'hamster':
   family = {p['slug']: p for p in products}
   versions = family['hamster-43-cage']['configuration_options']
   assert versions == family['hamster-62-cage']['configuration_options']
   assert family['hamster-43-cage']['expansion_note'] == family['hamster-62-cage']['expansion_note']
   options = ''.join('<li>' + e(option) + '</li>' for option in versions)
   selection = '<h2>Choose your transparent cage configuration</h2><h3>43 and 62: with or without side openings</h3><ul>' + options + '</ul><p>' + e(family['hamster-43-cage']['expansion_note']) + '</p><h3>75: one version, without side openings</h3><p>' + e(family['hamster-75-cage']['expansion_note']) + '</p><h3>PET transparent cages, not acrylic</h3><p>The 43, 62 and 75 cages use PET for the transparent enclosure and ABS for other components. The transparent enclosure is not acrylic. PET is chosen for its clarity and toughness. See each model’s specifications before ordering.</p><h3>Folding cages and accessory orders</h3><p>The two 70 folding models have the same footprint and different heights; compare their dimensions above. The external enclosure is listed separately, with dimensions available on request.</p><p>Choose matching parts from our <a href="hamster-supplies.html">hamster accessories</a> and <a href="/product/hamster-pipe-joint.html">tube connectors</a>. Confirm the cage model and accessory dimensions when requesting a bundle.</p>'
   guide = 'Build your wholesale range from the 43, 62 and 75 transparent cages or the two 70 folding models. Compare dimensions and MOQ below, then select your cage configuration and any separately ordered accessories.'
  moq_answer = 'MOQ varies by model and configuration. Use each product page as the starting point and confirm the selected colors and carton quantities when requesting a quote.'
  if kind == 'hamster':
   minimums = {format_moq(p.get('moq')) for p in products}
   if len(minimums) == 1 and '' not in minimums:
    moq_answer = 'The ' + str(len(products)) + ' models currently listed on this page each have a catalog MOQ of ' + e(next(iter(minimums))) + '. Confirm colors, configuration and final order quantities in your quote. Customization and accessory orders are quoted separately.'

  questions = ('<h3>Are stands included with a bird cage?</h3><p>Stands have separate catalog entries. Specify the cage and stand model in your inquiry and confirm compatibility and inclusion before ordering.</p>' if kind=='bird' else '<h3>Will any wheel or tunnel fit these cages?</h3><p>Compatibility depends on the selected cage, connection and accessory dimensions. Send the cage model and accessory list for confirmation before ordering.</p>')
  questions += '<h3>How do I confirm packing and delivery requirements?</h3><p>Review each product page for carton details. Send your destination and order quantity so our team can confirm packing, quotation terms and the current production schedule. No delivery date is implied by the catalog.</p>'

  sourcing = ''
  if kind == 'hamster':
   sourcing = '<h3>Order an existing model</h3><p>Send the cage model, opening version where available, quantity, destination market and packaging requirements. List tunnels and connectors separately.</p><h3>Develop or customize a product</h3><p>For private-label colors, logos or packaging, or changes to structure and tooling, review our <a href="oem-odm.html">OEM &amp; ODM services</a> and include your requirements in the inquiry.</p>'
  body=f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="{url}">
<link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/categories.css"><link rel="icon" href="/favicon.ico"><script type="application/ld+json">{json.dumps(schema)}</script></head><body>
{header}<main><section class="page-header"><div class="container"><p class="category-breadcrumb"><a href="products.html">All Products</a> / {name} Cages</p><h1>Wholesale {name} Cages</h1><p>Source {kind} cages for wholesale and private-label programs. Explore existing models or discuss a custom project with our manufacturing team.</p></div></section>
<section class="section"><div class="container"><h2>Choose a cage for your product range</h2><p>{guide}</p><p>Dimensions below describe the product. Review the detail page for carton information, material options and ordering notes.</p>{comparison}{selection}<h2>Browse model details</h2><div class="products-grid">{''.join(selected)}</div></div></section>
<section class="section"><div class="container"><h2>Procurement questions</h2><h3>What is the minimum order quantity?</h3><p>{moq_answer}</p><h3>Can I request my own colors, logo or packaging?</h3><p>Discuss your private-label requirements with our team. For changes to the product design or tooling, see our <a href="oem-odm.html">OEM &amp; ODM manufacturing services</a>.</p><h3>What should I include in a quote request?</h3><p>Include the model, quantity, preferred colors, packaging requirements and destination market. Our team can review the configuration and confirm the order details.</p>{questions}<h2>Build your sourcing shortlist</h2>{sourcing}<p><a href="factory.html">Explore our factory capabilities</a> or <a href="{kind}-supplies.html">browse {kind} accessories</a>.</p><a class="btn btn-primary" href="contact.html">Request a Quote</a></div></section></main>{footer}
"""
  (PUBLIC/path).write_text(body,encoding='utf-8')
  print(path,len(selected),'models')
if __name__=='__main__':build()
