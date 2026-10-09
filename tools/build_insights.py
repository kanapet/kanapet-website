#!/usr/bin/env python3
"""Generate Insights from Markdown with JSON front matter; no dependencies."""
import argparse
import datetime as dt
import html
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
SITE = 'https://www.kanapet.com'
CATEGORIES = ['All', 'OEM / ODM', 'Product Guide', 'Manufacturing', 'Company News', 'Exhibition']
E = html.escape

def inline(value):
    value = E(value)
    value = re.sub(r'\[([^\]]+)\]\((/[^\s)]*|https://[^\s)]+)\)', r'<a href="\2">\1</a>', value)
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', value)

def image(src, alt, lazy=True):
    assert src.startswith('/images/') and (PUBLIC / src.lstrip('/')).is_file(), f'Missing image: {src}'
    return f'<img src="{E(src)}" alt="{E(alt)}" width="1600" height="900" decoding="async" '+ ('loading="lazy"' if lazy else 'fetchpriority="high"') + '>'

def markdown(body):
    output, toc = [], []
    blocks = re.split(r'\n\s*\n', body.strip())
    for block in blocks:
        lines = block.splitlines()
        heading = re.fullmatch(r'(#{2,3}) (.+)', block)
        picture = re.fullmatch(r'!\[([^\]]+)\]\((/[^ )]+)(?: "([^"]+)")?\)', block)
        if heading:
            level, title = len(heading[1]), heading[2]
            anchor = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
            anchor += f'-{len(toc)+1}'
            if level == 2: toc.append((anchor, title))
            output.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>')
        elif picture:
            output.append('<figure>'+image(picture[2], picture[1])+(f'<figcaption>{E(picture[3])}</figcaption>' if picture[3] else '')+'</figure>')
        elif all(re.match(r'(- |\d+\. )', line) for line in lines):
            tag = 'ul' if lines[0].startswith('- ') else 'ol'
            output.append(f'<{tag}>'+''.join('<li>'+inline(re.sub(r'^(- |\d+\. )', '', line))+'</li>' for line in lines)+f'</{tag}>')
        elif len(lines)>2 and lines[0].startswith('|') and re.fullmatch(r'[| :\-]+', lines[1]):
            cells = lambda line: [inline(c.strip()) for c in line.strip('|').split('|')]
            output.append('<div class="ins-table"><table><thead><tr>'+''.join('<th scope="col">'+c+'</th>' for c in cells(lines[0]))+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+c+'</td>' for c in cells(line))+'</tr>' for line in lines[2:])+'</tbody></table></div>')
        else:
            assert not block.startswith('#'), 'Body headings must use H2 or H3'
            output.append('<p>'+inline(' '.join(lines))+'</p>')
    return '\n'.join(output), toc

def url(article): return '/insights/'+article['slug']+'/'

def card(a, featured=False):
    return f'<article class="ins-card {"ins-featured" if featured else ""}" data-category="{E(a["category"])}"><a class="ins-card-image" href="{url(a)}">{image(a["coverImage"], a["coverAlt"], not featured)}</a><div class="ins-card-body"><p class="ins-category">{E(a["category"])}</p><h2><a href="{url(a)}">{E(a["title"])}</a></h2><p class="ins-description">{E(a["description"])}</p><time datetime="{a["datePublished"]}">{a["datePublished"]}</time><a class="ins-read" href="{url(a)}">Read Article <span aria-hidden="true">→</span><span class="sr-only">: {E(a["title"])}</span></a></div></article>'

def cta(listing=False):
    return '<section class="ins-cta"><h2>'+('Looking for an OEM / ODM partner?' if listing else 'Looking for a manufacturing partner?')+'</h2><p>Tell us about your product idea.</p><a class="btn btn-ghost" href="/contact.html">Contact KANAPET</a></section>'

def build():
    home = (PUBLIC/'index.html').read_text(encoding='utf-8')
    header = re.search(r'<header>.*?</header>', home, re.S)[0]
    footer = re.search(r'<footer>.*?</footer>', home, re.S)[0]
    def absolute(fragment):
        return re.sub(r'href="(?!/|[a-zA-Z][a-zA-Z0-9+.-]*:|#)([^"]+)"', r'href="/\1"', fragment)
    header, footer = absolute(header), absolute(footer)
    header = header.replace(' class="active"', '')
    if 'href="/insights/"' not in header:
        header = header.replace('<li><a href="/contact.html">Contact</a></li>', '<li><a href="/insights/">Insights</a></li>\n      <li><a href="/contact.html">Contact</a></li>')
    header = header.replace('href="/insights/"', 'href="/insights/" class="active" aria-current="page"')
    organization = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', home, re.S)[1])
    organization['@id'] = SITE+'/#organization'
    articles = []
    for path in sorted((ROOT/'content/insights').glob('*.md')):
        parts = path.read_text(encoding='utf-8').split('---', 2)
        assert len(parts)==3 and not parts[0].strip(), f'Invalid front matter: {path}'
        a = json.loads(parts[1]); a['body'] = parts[2]
        for key in ['title','slug','description','category','datePublished','coverImage','coverAlt','summary']:
            assert a.get(key), f'Missing {key}: {path}'
        assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', a['slug']) and a['slug']==path.stem
        assert a['category'] in CATEGORIES[1:]
        for key in ['datePublished','dateModified']:
            if a.get(key): dt.date.fromisoformat(a[key])
        assert a.get('dateModified',a['datePublished']) >= a['datePublished']
        a['rendered'], a['toc'] = markdown(a['body'])
        articles.append(a)
    assert articles and len({a['slug'] for a in articles})==len(articles)
    articles.sort(key=lambda a:a['datePublished'], reverse=True)
    products = {p['id']:p for p in json.loads((PUBLIC/'data/products.json').read_text(encoding='utf-8'))}
    by_slug = {a['slug']:a for a in articles}
    outputs = {}
    def page(title, desc, path, cover, content, schemas):
        graph = {'@context':'https://schema.org','@graph':[organization]+schemas}
        return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{E(title)} | KANAPET</title><meta name="description" content="{E(desc)}">
<link rel="canonical" href="{SITE+path}"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{SITE+path}"><meta property="og:type" content="{'article' if schemas else 'website'}"><meta property="og:image" content="{SITE+cover}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/css/style.css?v=16"><link rel="stylesheet" href="/css/insights.css?v=2">
<script type="application/ld+json">{json.dumps(graph, ensure_ascii=False).replace('<', chr(92)+'u003c')}</script></head><body class="insights-page">{header}<main id="main-content">{content}</main>{footer}<script src="/js/insights.js" defer></script></body></html>'''
    filters = '<div class="ins-filters" role="group" aria-label="Filter articles by category" hidden>'+''.join(f'<button type="button" data-filter="{E(c)}" aria-pressed="{str(c=="All").lower()}">{E(c)}</button>' for c in CATEGORIES)+'</div>'
    featured = next((a for a in articles if a.get('featured')), articles[0])
    listing = '<div class="container ins-list"><h1>Insights</h1><p class="ins-subtitle">Product knowledge, manufacturing experience and updates from KANAPET.</p>'+filters+card(featured,True)+'<div class="ins-grid">'+''.join(card(a) for a in articles if a!=featured)+'</div><p id="ins-empty" role="status" hidden>No articles in this category yet.</p>'+cta(True)+'</div>'
    outputs[PUBLIC/'insights/index.html'] = page('Insights','Product knowledge, manufacturing experience and updates from KANAPET.','/insights/',featured['coverImage'],listing,[])
    for a in articles:
        crumbs = [('Home','/'),('Insights','/insights/'),(a['category'],'/insights/#'+re.sub(r'[^a-z0-9]+','-',a['category'].lower()).strip('-')),(a['title'],url(a))]
        breadcrumb = '<nav class="ins-breadcrumb" aria-label="Breadcrumb">'+ ' <span aria-hidden="true">→</span> '.join(f'<a href="{u}">{E(n)}</a>' if i<3 else f'<span aria-current="page">{E(n)}</span>' for i,(n,u) in enumerate(crumbs))+'</nav>'
        reading = max(1,math.ceil(len(re.findall(r'\b\w+\b',a['body']+a['summary']))/200))
        meta = f'<p class="ins-meta">Published <time datetime="{a["datePublished"]}">{a["datePublished"]}</time>'
        if a.get('dateModified') and a['dateModified']!=a['datePublished']: meta+=f' · Updated <time datetime="{a["dateModified"]}">{a["dateModified"]}</time>'
        meta+=f' · {reading} min read</p>'
        toc = '<details class="ins-toc" open><summary>Table of Contents</summary><ol>'+''.join(f'<li><a href="#{anchor}">{E(title)}</a></li>' for anchor,title in a['toc'])+'</ol></details>' if len(a['toc'])>=4 else ''
        body = breadcrumb+f'<article class="ins-article"><p class="ins-category">{E(a["category"])}</p><h1>{E(a["title"])}</h1><p class="ins-summary">{E(a["summary"])}</p>'+meta+image(a['coverImage'],a['coverAlt'],False)+toc+'<div class="ins-prose">'+a['rendered']
        if a.get('keyTakeaways'): body+='<section><h2>Key Takeaways</h2><ul>'+''.join('<li>'+E(t)+'</li>' for t in a['keyTakeaways'])+'</ul></section>'
        if a.get('faq'): body+='<section><h2>Frequently Asked Questions</h2>'+''.join('<h3>'+E(f['question'])+'</h3><p>'+E(f['answer'])+'</p>' for f in a['faq'])+'</section>'
        body+='</div></article>'
        if a.get('relatedProducts'):
            body+='<section class="ins-related"><h2>Related Products</h2><div class="ins-grid">'
            for pid in a['relatedProducts']:
                assert pid in products, f'Unknown product: {pid}'
                p=products[pid]
                body+=f'<article class="ins-product"><a href="/product/{p["slug"]}.html">{image("/"+p["image"].lstrip("/"),p["name"])}<h3>{E(p["name"])}</h3></a><p>{E(p.get("material") or p.get("size") or "")}</p><a href="/product/{p["slug"]}.html">View Product <span aria-hidden="true">→</span><span class="sr-only">: {E(p["name"])}</span></a></article>'
            body+='</div></section>'
        for slug in a.get('relatedArticles',[]): assert slug in by_slug and slug!=a['slug'], f'Invalid related article: {slug}'
        related = [by_slug[s] for s in a.get('relatedArticles',[])] or [other for other in articles if other!=a]
        if related: body+='<section class="ins-related"><h2>Related Articles</h2><div class="ins-grid">'+''.join(card(other) for other in related[:3])+'</div></section>'
        body+=cta()
        schema = {'@type':'Article','headline':a['title'],'description':a['description'],'image':SITE+a['coverImage'],'datePublished':a['datePublished'],'dateModified':a.get('dateModified',a['datePublished']),'author':{'@type':'Organization','name':'KANAPET','@id':organization['@id']},'publisher':{'@id':organization['@id']},'mainEntityOfPage':{'@type':'WebPage','@id':SITE+url(a)}}
        bc={'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':i+1,'name':n,'item':SITE+u} for i,(n,u) in enumerate(crumbs)]}
        outputs[PUBLIC/'insights'/a['slug']/'index.html']=page(a['title'],a['description'],url(a),a['coverImage'],'<div class="container ins-detail">'+body+'</div>',[schema,bc])
    sitemap=(PUBLIC/'sitemap.xml').read_text(encoding='utf-8')
    sitemap=re.sub(r'\s*<url>\s*<loc>https://www\.kanapet\.com/insights/.*?</url>', '', sitemap, flags=re.S)
    entries=[('/insights/',max(a.get('dateModified',a['datePublished']) for a in articles))]+[(url(a),a.get('dateModified',a['datePublished'])) for a in articles]
    sitemap=sitemap.replace('</urlset>', ''.join(f'  <url><loc>{SITE+p}</loc><lastmod>{d}</lastmod></url>\n' for p,d in entries)+'</urlset>')
    ET.fromstring(sitemap)
    outputs[PUBLIC/'sitemap.xml']=sitemap
    return outputs

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--check',action='store_true'); args=parser.parse_args()
    outputs=build(); changed=[]
    for path,content in outputs.items():
        if not path.exists() or path.read_text(encoding='utf-8')!=content:
            changed.append(path)
            if not args.check:
                path.parent.mkdir(parents=True,exist_ok=True); path.write_text(content,encoding='utf-8')
    print(f'Insights: {len(outputs)-1} pages; {len(changed)} changed files')
    if args.check and changed:
        print('\n'.join(str(p.relative_to(ROOT)) for p in changed)); raise SystemExit(1)
