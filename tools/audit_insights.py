#!/usr/bin/env python3
"""Verify publishable Insights links, metadata, heading and schema invariants."""
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import xml.etree.ElementTree as ET
from build_insights import build, PUBLIC, SITE

class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.h1=0; self.ids=set(); self.links=[]; self.schemas=[]; self.script=False; self.buffer=''; self.canonical=[]; self.meta={}; self.images=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='h1': self.h1+=1
        if 'id' in a:
            assert a['id'] not in self.ids, f'Duplicate anchor: {a["id"]}'
            self.ids.add(a['id'])
        if tag=='a' and a.get('href'): self.links.append(a['href'])
        if tag=='link' and a.get('rel')=='canonical': self.canonical.append(a['href'])
        if tag=='meta': self.meta[a.get('name',a.get('property'))]=a.get('content')
        if tag=='img': self.images.append(a)
        if tag=='script' and a.get('type')=='application/ld+json': self.script=True; self.buffer=''
    def handle_data(self,data):
        if self.script: self.buffer+=data
    def handle_endtag(self,tag):
        if tag=='script' and self.script: self.schemas.append(json.loads(self.buffer)); self.script=False

outputs=build()
sitemap=ET.fromstring(outputs[PUBLIC/'sitemap.xml'])
locations=[e.text for e in sitemap.iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
assert len(locations)==len(set(locations)), 'Duplicate sitemap URLs'
for path,source in outputs.items():
    if path.suffix!='.html': continue
    p=Page(); p.feed(source)
    route='/'+path.relative_to(PUBLIC).as_posix().removesuffix('index.html')
    assert p.h1==1 and p.canonical==[SITE+route], path
    assert SITE+route in locations
    for key in ['description','og:title','og:description','og:url','og:image','twitter:card']: assert p.meta.get(key), key
    assert p.meta['og:url']==SITE+route
    assert (PUBLIC/urlsplit(p.meta['og:image']).path.lstrip('/')).is_file()
    for img in p.images:
        assert img.get('alt') and img.get('width') and img.get('height'), img
    for href in p.links+[img['src'] for img in p.images]:
        u=urlsplit(href)
        if u.scheme or u.netloc: continue
        if not u.path:
            if u.fragment: assert u.fragment in p.ids, href
            continue
        target=PUBLIC/unquote(u.path.lstrip('/'))
        if u.path.endswith('/'): target=target/'index.html'
        assert target.is_file(), f'{path}: broken link {href}'
    graph=p.schemas[0]['@graph']
    org=next(s for s in graph if s['@type']=='Organization')
    assert org['url'].rstrip('/')==SITE and org['logo'] and org['contactPoint']['email']
    if route!='/insights/':
        article=next(s for s in graph if s['@type']=='Article')
        for key in ['headline','description','image','datePublished','dateModified','author','publisher','mainEntityOfPage']: assert article.get(key), key
        assert article['mainEntityOfPage']['@id']==SITE+route
        crumbs=next(s for s in graph if s['@type']=='BreadcrumbList')['itemListElement']
        assert [c['position'] for c in crumbs]==[1,2,3,4]
        assert crumbs[-1]['item']==SITE+route
assert 'Disallow: /insights' not in (PUBLIC/'robots.txt').read_text(encoding='utf-8')
print('Insights audit passed: links, images, canonical URLs, sitemap, H1, metadata and schema')
