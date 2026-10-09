#!/usr/bin/env python3
"""Read-only product audit. Python standard library only; never rewrites inputs."""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

SITE = 'https://www.kanapet.com'
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')


def normalized(value):
    return ' '.join(str(value).split())


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f'duplicate JSON key: {key}')
            result[key] = value
        return result
    def invalid(value):
        raise ValueError(f'non-finite JSON number: {value}')
    return json.loads(text, object_pairs_hook=pairs, parse_constant=invalid)


class Node:
    def __init__(self, tag='', attrs=(), line=1):
        self.tag, self.attrs, self.line = tag, dict(attrs), line
        self.children = []

    def text(self):
        return ''.join(c.text() if isinstance(c, Node) else c for c in self.children)

    def find(self, tag=None, **attrs):
        found = []
        for child in self.children:
            if isinstance(child, Node):
                if (tag is None or child.tag == tag) and all(
                    child.attrs.get(k) == v for k, v in attrs.items()
                ):
                    found.append(child)
                found.extend(child.find(tag, **attrs))
        return found


class Document(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.getpos()[0])
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)


def size_text(value):
    """Known legacy cm formats only. Unsupported formats require review."""
    if value in (None, ''):
        return None
    if isinstance(value, dict):
        if set(value) != {'w', 'd', 'h'}:
            return None
        raw = [value[k] for k in ('w', 'd', 'h')]
    elif isinstance(value, str):
        semantic = re.fullmatch(
            r'\s*Length\s+(\d+(?:\.\d+)?)\s*cm\s*[;,]\s*(diameter|width)\s+(\d+(?:\.\d+)?)\s*cm\s*',
            value,
            re.I,
        )
        if semantic:
            length = Decimal(semantic.group(1))
            second_label = semantic.group(2).lower()
            second_value = Decimal(semantic.group(3))
            if length > 0 and second_value > 0:
                return (f'Length {format(length.normalize(), "f")} cm; {second_label} '
                        f'{format(second_value.normalize(), "f")} cm')
        match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*', value)
        if not match:
            return None
        raw = match.groups()
    else:
        return None
    try:
        dims = [Decimal(str(v)) for v in raw]
        if any(not d.is_finite() or d <= 0 for d in dims):
            return None
    except InvalidOperation:
        return None
    metric = ' × '.join(format(d.normalize(), 'f') for d in dims)
    inches = ' × '.join(str((d / Decimal('2.54')).quantize(Decimal('.1'), rounding=ROUND_HALF_UP)) for d in dims)
    return f'{metric} cm ({inches} in)'


def has_order_specific_moq(product):
    notes = str(product.get('notes') or '').lower()
    return (product.get('moq') in (None, '') and 'order quantity' in notes and
            ('determined by' in notes or 'depends on' in notes))


def image_paths(product):
    paths = []
    def walk(value, key=''):
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, k)
        elif isinstance(value, list):
            for v in value:
                walk(v, key)
        elif isinstance(value, str) and (key == 'image' or key == 'gallery' or value.startswith('images/')):
            paths.append(value)
    walk(product)
    return paths


def moq_parts(value):
    """Compare quantity and conditions separately; do not guess a missing unit."""
    text = normalized(value).lower()
    match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(pcs?|pieces?|sets?|cartons?)?\s*(.*)', text)
    if not match:
        return None
    quantity, unit, condition = match.groups()
    units = {'pc': 'pc', 'pcs': 'pc', 'piece': 'pc', 'pieces': 'pc',
             'set': 'sets', 'cartons': 'carton'}
    return Decimal(quantity), units.get(unit, unit), condition


class Audit:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.public = self.root / 'public'
        self.issues = []
        self.checked = 0

    def issue(self, code, path, message, severity='error', line=None):
        path = Path(path)
        try:
            path = path.relative_to(self.root)
        except ValueError:
            pass
        self.issues.append(dict(severity=severity, code=code, file=path.as_posix(),
                                line=line, message=message))

    def read(self, path):
        try:
            return path.read_text(encoding='utf-8-sig')
        except (OSError, UnicodeError) as exc:
            self.issue('FILE_READ', path, str(exc))
            return None

    def load(self, path):
        text = self.read(path)
        if text is None:
            return None
        try:
            return strict_json(text)
        except ValueError as exc:
            self.issue('JSON_PARSE', path, str(exc))
            return None

    def local_asset(self, value, path, absolute=False):
        if not isinstance(value, str) or not value:
            self.issue('IMAGE_PATH', path, f'invalid image reference: {value!r}')
            return
        url = urlparse(value)
        if absolute and (url.scheme != 'https' or url.netloc != 'www.kanapet.com'):
            self.issue('IMAGE_HOST', path, f'image must use canonical HTTPS host: {value}')
            return
        if not absolute and (url.scheme or url.netloc):
            self.issue('IMAGE_PATH', path, f'expected local image path: {value}')
            return
        target = (self.public / unquote(url.path).lstrip('/')).resolve()
        if not target.is_relative_to(self.public) or not target.is_file():
            self.issue('IMAGE_MISSING', path, f'missing or unsafe image path: {value}')

    def data(self, products, categories):
        path = self.public / 'data/products.json'
        if not isinstance(products, list) or not products:
            self.issue('DATA_ARRAY', path, 'products must be a non-empty array')
            return []
        good, seen_ids, seen_slugs = [], set(), set()
        for index, p in enumerate(products):
            label = f'product[{index}]'
            if not isinstance(p, dict):
                self.issue('DATA_OBJECT', path, f'{label}: expected object')
                continue
            valid = True
            for field in ('id', 'slug', 'name', 'category', 'image'):
                if not isinstance(p.get(field), str) or not p[field].strip():
                    self.issue('DATA_REQUIRED', path, f'{label}: missing/invalid {field}')
                    valid = False
            if not valid:
                continue
            label = p['slug']
            if not SLUG.fullmatch(label):
                self.issue('DATA_SLUG', path, f'{label!r}: invalid slug')
                continue
            for field, seen in (('id', seen_ids), ('slug', seen_slugs)):
                if p[field] in seen:
                    self.issue('DATA_DUPLICATE', path, f'{label}: duplicate {field}')
                seen.add(p[field])
            if p['category'] not in categories:
                self.issue('DATA_CATEGORY', path, f'{label}: unknown category {p["category"]}')
            for field in ('size', 'material', 'moq', 'notes'):
                if p.get(field) in (None, ''):
                    if field == 'moq' and has_order_specific_moq(p):
                        continue
                    self.issue('DATA_UNKNOWN', path, f'{label}: {field} is unknown', 'warning')
            for field in ('material', 'notes'):
                if p.get(field) is not None and not isinstance(p[field], str):
                    self.issue('DATA_TYPE', path, f'{label}: {field} must be a string')
            for field in ('size', 'meas', 'carton_size'):
                if p.get(field) not in (None, '') and size_text(p[field]) is None:
                    severity = 'warning' if isinstance(p[field], str) else 'error'
                    self.issue('DATA_SIZE_REVIEW', path, f'{label}: unsupported {field} {p[field]!r}', severity)
            notes = p.get('notes', '').lower()
            documented_inner_and_master = 'inner box size:' in notes and 'master carton size:' in notes
            if (p.get('meas') and p.get('carton_size') and
                    size_text(p['meas']) != size_text(p['carton_size']) and
                    not documented_inner_and_master):
                self.issue('DATA_CARTON_CONFLICT', path, f'{label}: meas and carton_size disagree', 'warning')
            for field in ('colors', 'gallery'):
                values = p.get(field)
                if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
                    self.issue('DATA_TYPE', path, f'{label}: {field} must be a string array')
            for field in ('color_options', 'material_options'):
                if field in p and (not isinstance(p[field], list) or any(
                    not isinstance(v, dict) or not isinstance(v.get('name'), str) or
                    not isinstance(v.get('image'), str) for v in p[field]
                )):
                    self.issue('DATA_TYPE', path, f'{label}: invalid {field} option array')
            if 'color_images' in p and (not isinstance(p['color_images'], dict) or any(
                not isinstance(v, str) or not v for v in p['color_images'].values()
            )):
                self.issue('DATA_TYPE', path, f'{label}: color_images must map color names to image paths')
            moq = p.get('moq')
            if moq not in (None, ''):
                if isinstance(moq, bool) or not isinstance(moq, (str, int, float)):
                    self.issue('DATA_TYPE', path, f'{label}: invalid MOQ type')
                elif re.fullmatch(r'-?\d+(?:\.\d+)?', str(moq)) and Decimal(str(moq)) <= 0:
                    self.issue('DATA_MOQ', path, f'{label}: MOQ must be positive')
            unit = p.get('moq_unit')
            if unit not in ('pc', 'sets', 'carton'):
                self.issue('DATA_MOQ_UNIT', path, f'{label}: missing/unrecognized MOQ unit {unit!r}', 'warning')
            if unit == 'carton' or (unit == 'pc' and 'sets' in str(moq)):
                self.issue('DATA_MOQ_REVIEW', path, f'{label}: verify MOQ {moq!r} against unit {unit!r}; do not infer carton quantity', 'warning')
            for image in sorted(set(image_paths(p))):
                self.local_asset(image, path)
            good.append(p)
        return good

    def page(self, p, categories):
        path = self.public / 'product' / (p['slug'] + '.html')
        text = self.read(path)
        if text is None:
            return
        self.checked += 1
        doc = Document(text).root
        url = SITE + '/product/' + p['slug'] + '.html'

        def one(tag, code, **attrs):
            nodes = doc.find(tag, **attrs)
            if len(nodes) != 1:
                self.issue(code, path, f'expected one {tag} {attrs}, got {len(nodes)}')
            return nodes[0] if nodes else Node()

        def compare(actual, expected, code, line=None):
            if normalized(actual) != normalized(expected):
                self.issue(code, path, f'expected {expected!r}; found {actual!r}', line=line)

        h1 = one('h1', 'PAGE_H1')
        compare(h1.text(), p['name'], 'PAGE_NAME', h1.line)
        sku_nodes = [n for n in doc.find('div') if 'product-sku' in n.attrs.get('class', '').split()]
        sku_match = re.search(r'SKU:\s*([^|]+)', sku_nodes[0].text()) if len(sku_nodes) == 1 else None
        compare(sku_match.group(1).strip() if sku_match else '', p.get('sku') or p['id'].upper(), 'PAGE_SKU')
        title = one('title', 'SEO_TITLE').text()
        description = one('meta', 'SEO_DESCRIPTION', name='description').attrs.get('content', '')
        for field, value in (('title', title), ('description', description)):
            if p['name'] not in value:
                self.issue('SEO_IDENTITY', path, f'{field} missing product name')
        compare(one('link', 'SEO_CANONICAL', rel='canonical').attrs.get('href', ''), url, 'SEO_CANONICAL')
        for key, expected in (('og:url', url), ('og:title', title), ('og:description', description), ('og:type', 'product')):
            compare(one('meta', 'SEO_OG', property=key).attrs.get('content', ''), expected, 'SEO_OG')
        for node in doc.find('meta'):
            if node.attrs.get('name', '').lower() in ('robots', 'googlebot') and re.search(r'\b(noindex|none)\b', node.attrs.get('content', ''), re.I):
                self.issue('SEO_NOINDEX', path, 'published product contains noindex', line=node.line)
        allowed_images = {'/' + value.lstrip('/') for value in image_paths(p)}
        for value in [one('meta', 'SEO_IMAGE', property='og:image').attrs.get('content', '')]:
            self.local_asset(value, path, absolute=True)
            if urlparse(value).path not in allowed_images:
                self.issue('PAGE_IMAGE_PRODUCT', path, f'image is not linked to product: {value}')
        main = one('img', 'PAGE_MAIN_IMAGE', id='product-main-image')
        self.local_asset(main.attrs.get('src', ''), path)
        if main.attrs.get('src') not in allowed_images:
            self.issue('PAGE_IMAGE_PRODUCT', path, 'main image is not linked to product', line=main.line)
        tables = [n for n in doc.find('table') if 'spec-table' in n.attrs.get('class', '').split()]
        specs = {}
        if tables:
            for row in tables[0].find('tr'):
                th, td = row.find('th'), row.find('td')
                if len(th) == len(td) == 1:
                    specs[normalized(th[0].text())] = (normalized(td[0].text()), td[0].line)
        carton = size_text(p.get('carton_size') or p.get('meas'))
        notes = p.get('notes', '').lower()
        documented_inner_and_master = 'inner box size:' in notes and 'master carton size:' in notes
        if (p.get('carton_size') and p.get('meas') and
                size_text(p['carton_size']) != size_text(p['meas']) and
                not documented_inner_and_master):
            carton = None  # Source conflict: neither legacy field is assumed authoritative.
        size_label = ('Product Size' if isinstance(p.get('size'), str) and
                      p['size'].strip().lower().startswith('length ') else 'Product Size (W×D×H)')
        facts = [(size_label, size_text(p.get('size'))),
                 ('Carton Size (W×D×H)', carton)]
        for label, field, suffix in [('Net Weight', 'net_weight', ' kg'), ('Gross Weight', 'gross_weight', ' kg'),
                                     ('CBM', 'cbm', ' m³'), ('PCS per Carton', 'pcs_per_ctn', ''), ('Notes', 'notes', '')]:
            if p.get(field) not in (None, ''):
                facts.append((label, str(p[field]) + suffix))
        for label, expected in facts:
            if expected:
                actual, line = specs.get(label, ('', None))
                compare(actual, expected, 'PAGE_SPEC', line)
        size = size_text(p.get('size'))
        if size and size not in description:
            self.issue('SEO_SIZE', path, 'meta description missing or mismatching known size')
        moq_value = p.get('moq')
        moq = '' if moq_value in (None, '') else str(moq_value).strip()
        if moq:
            actual, line = specs.get('MOQ', ('', None))
            self.moq(actual, moq, path, 'PAGE_MOQ', line)
            match = re.search(r'MOQ from (.*?)\.(?:\s|$)', description)
            if match:
                self.moq(match.group(1), moq, path, 'SEO_MOQ')
            else:
                self.issue('SEO_MOQ', path, 'meta description lacks the current template MOQ statement')
        for h3 in doc.find('h3'):
            if normalized(h3.text()) == 'Materials':
                # Existing template places the Materials heading and paragraph in one div.
                for parent in doc.find('div'):
                    if h3 in parent.children:
                        paragraphs = parent.find('p')
                        actual = normalized(paragraphs[0].text()) if paragraphs else ''
                        expected = normalized(p.get('material', ''))
                        placeholder = 'Material specifications available on request.'
                        if actual and (expected and actual != expected or not expected and actual != placeholder):
                            self.issue('PAGE_MATERIAL_REVIEW', path, f'body material {actual!r}; data {expected!r}', 'warning', h3.line)
                        break
        if 'food-grade' in text.lower() and 'food-grade' not in json.dumps(p).lower():
            self.issue('PAGE_CLAIM_REVIEW', path, 'food-grade claim has no supporting product-data field', 'warning')
        if re.search(r'\[object Object\]|\{[\s\n]*[\x27\"]w[\x27\"]\s*:', doc.text()):
            self.issue('PAGE_OBJECT_LEAK', path, 'raw object representation in HTML')
        self.schema(doc, p, categories, path, url, size, allowed_images)

    def moq(self, actual, expected, path, code, line=None):
        a, b = moq_parts(actual), moq_parts(expected)
        if a and b:
            mismatch = a[0] != b[0] or a[2] != b[2] or b[1] is not None and a[1] != b[1]
        else:
            mismatch = normalized(actual) != normalized(expected)
        if mismatch:
            self.issue(code, path, f'MOQ value/conditions differ: {actual!r} vs {expected!r}', line=line)
        elif a and not a[1]:
            self.issue('OUTPUT_MOQ_UNIT', path, f'MOQ lacks explicit unit: {actual!r}', 'warning', line)

    def schema(self, doc, p, categories, path, url, size, allowed_images):
        entities = []
        def flatten(value):
            if isinstance(value, list):
                for item in value:
                    flatten(item)
            elif isinstance(value, dict):
                entities.append(value)
                if '@graph' in value:
                    flatten(value['@graph'])
        scripts = doc.find('script', type='application/ld+json')
        for script in scripts:
            try:
                value = strict_json(script.text())
                if not isinstance(value, (dict, list)):
                    raise ValueError('JSON-LD must be an object or array')
                roots = value if isinstance(value, list) else [value]
                for root in roots:
                    if not isinstance(root, dict):
                        raise ValueError('JSON-LD array items must be objects')
                    if root.get('@context') not in ('https://schema.org', 'https://schema.org/'):
                        self.issue('LD_CONTEXT', path, 'expected explicit schema.org context', line=script.line)
                flatten(value)
            except ValueError as exc:
                self.issue('LD_PARSE', path, str(exc), line=script.line)
        def typed(kind):
            return [e for e in entities if e.get('@type') == kind or isinstance(e.get('@type'), list) and kind in e['@type']]
        products = typed('Product')
        if len(products) != 1:
            self.issue('LD_PRODUCT_COUNT', path, f'expected one Product, got {len(products)}')
        if products:
            ld = products[0]
            brand = ld.get('brand')
            if not isinstance(brand, dict) or brand.get('name') != 'Kanapet' or brand.get('@type') != 'Brand':
                self.issue('LD_BRAND', path, 'expected Kanapet Brand object')
            expected = {'name': p['name'], 'sku': p.get('sku') or p['id'].upper(),
                        'category': categories.get(p['category'], {}).get('name', '')}
            if p.get('material'):
                expected['material'] = p['material']
            for key, value in expected.items():
                if ld.get(key) != value:
                    self.issue('LD_FACT', path, f'{key}: expected {value!r}; found {ld.get(key)!r}')
            if ld.get('url') is None:
                self.issue('LD_URL_MISSING', path, 'Product.url absent (v1 completeness recommendation)', 'warning')
            elif ld['url'] != url:
                self.issue('LD_URL', path, f'Product.url differs from canonical: {ld["url"]!r}')
            desc = ld.get('description')
            if not isinstance(desc, str) or p['name'] not in desc or size and size not in desc:
                self.issue('LD_DESCRIPTION', path, 'description missing product name or known size')
            images = ld.get('image', [])
            images = [images] if isinstance(images, str) else images
            if not isinstance(images, list) or not images:
                self.issue('LD_IMAGE', path, 'Product.image must contain image URLs')
            else:
                for value in images:
                    self.local_asset(value, path, absolute=True)
                    if isinstance(value, str) and urlparse(value).path not in allowed_images:
                        self.issue('LD_IMAGE', path, f'image not linked to this product: {value}')
            for key in ('offers', 'aggregateRating', 'review'):
                if key in ld:
                    self.issue('LD_UNVERIFIED_CLAIM', path, f'{key} has no verified source in current data')
        crumbs = typed('BreadcrumbList')
        if len(crumbs) != 1:
            self.issue('LD_BREADCRUMB', path, f'expected one BreadcrumbList, got {len(crumbs)}')
        else:
            items = crumbs[0].get('itemListElement')
            if not isinstance(items, list) or not items or any(not isinstance(i, dict) for i in items):
                self.issue('LD_BREADCRUMB', path, 'invalid breadcrumb items')
            elif [i.get('position') for i in items] != list(range(1, len(items) + 1)) or items[-1].get('item') != url or items[-1].get('name') != p['name']:
                self.issue('LD_BREADCRUMB', path, 'breadcrumb positions or final product identity disagree')
            else:
                expected_urls = [SITE + '/', SITE + '/products.html',
                                 SITE + '/products.html?cat=' + p['category'], url]
                if [i.get('item') for i in items] != expected_urls or any(i.get('@type') != 'ListItem' or not i.get('name') for i in items):
                    self.issue('LD_BREADCRUMB', path, 'breadcrumb hierarchy differs from product category/path')

    def discovery(self, products):
        """Audit current catalog cards and llms entries independently of detail pages."""
        path = self.public / 'products.html'
        source = self.read(path)
        by_slug = {p['slug']: p for p in products}
        if source is not None:
            doc = Document(source).root
            cards = [n for n in doc.find('div') if 'product-card' in n.attrs.get('class', '').split()]
            seen = Counter()
            for card in cards:
                links = card.find('a')
                urls = {n.attrs.get('href', '') for n in links}
                slugs = {u.removeprefix('/product/').removesuffix('.html') for u in urls if u.startswith('/product/') and u.endswith('.html')}
                if len(slugs) != 1 or not slugs <= by_slug.keys():
                    self.issue('CATALOG_LINK', path, f'card references invalid/mixed products: {sorted(urls)}', line=card.line)
                    continue
                slug = next(iter(slugs))
                seen[slug] += 1
                p = by_slug[slug]
                h3 = card.find('h3')
                if len(h3) != 1 or normalized(h3[0].text()) != p['name']:
                    self.issue('CATALOG_NAME', path, f'{slug}: card name differs', line=card.line)
                size = size_text(p.get('size'))
                if size and size not in normalized(card.text()):
                    self.issue('CATALOG_SIZE', path, f'{slug}: missing/mismatching size', line=card.line)
                moqs = [n for n in card.find('div') if 'product-moq' in n.attrs.get('class', '').split()]
                if p.get('moq') not in (None, ''):
                    value = normalized(moqs[0].text()).removeprefix('MOQ: ') if len(moqs) == 1 else ''
                    self.moq(value, str(p['moq']), path, 'CATALOG_MOQ', card.line)
            # Match renderProducts(): dedicated accessories are intentionally
            # discoverable via their compatible product, not the main catalog.
            expected_cards = {p['slug'] for p in products if p.get('accessory_type') != 'dedicated'}
            if set(seen) != expected_cards or any(n != 1 for n in seen.values()):
                self.issue('CATALOG_COVERAGE', path, f'missing={sorted(expected_cards-set(seen))}; extra={sorted(set(seen)-expected_cards)}; duplicates={[s for s,n in seen.items() if n>1]}')
        path = self.public / 'llms.txt'
        source = self.read(path)
        if source is not None:
            seen = Counter()
            for line, text in enumerate(source.splitlines(), 1):
                match = re.match(r'- \[(.*?)\]\((https://www\.kanapet\.com/product/([a-z0-9-]+)\.html)\)(.*)', text)
                if not match:
                    continue
                name, _, slug, rest = match.groups()
                seen[slug] += 1
                if slug not in by_slug:
                    self.issue('LLMS_PRODUCT', path, f'unknown product {slug}', line=line)
                    continue
                p = by_slug[slug]
                if name != p['name']:
                    self.issue('LLMS_NAME', path, f'{slug}: name differs', line=line)
                size = size_text(p.get('size'))
                if size and size not in rest:
                    self.issue('LLMS_SIZE', path, f'{slug}: missing/mismatching size', line=line)
                moq = re.search(r'MOQ ([^,]+)', rest)
                if p.get('moq') not in (None, ''):
                    self.moq(moq.group(1).strip() if moq else '', str(p['moq']), path, 'LLMS_MOQ', line)
                if isinstance(p.get('material'), str) and p['material'] and p['material'] not in rest:
                    self.issue('LLMS_MATERIAL', path, f'{slug}: missing/mismatching material', line=line)
            if set(seen) != set(by_slug) or any(n != 1 for n in seen.values()):
                self.issue('LLMS_COVERAGE', path, f'missing={sorted(set(by_slug)-set(seen))}; extra={sorted(set(seen)-set(by_slug))}')

    def run(self):
        products = self.load(self.public / 'data/products.json')
        categories = self.load(self.public / 'data/categories.json')
        if not isinstance(categories, dict) or any(not isinstance(v, dict) or not isinstance(v.get('name'), str) for v in categories.values()):
            self.issue('DATA_CATEGORIES', self.public / 'data/categories.json', 'expected category object with names')
            categories = {}
        good = self.data(products, categories)
        js_path = self.public / 'js/data.js'
        js = self.read(js_path)
        if js is not None:
            for name, expected in [('PRODUCTS', products), ('CATEGORIES', categories)]:
                match = re.search(r'KANAPET_' + name + r'\s*=\s*', js)
                try:
                    if not match:
                        raise ValueError(f'KANAPET_{name} assignment missing')
                    value, _ = json.JSONDecoder().raw_decode(js[match.end():])
                    if value != expected:
                        self.issue('DATA_JS_SYNC', js_path, f'KANAPET_{name} differs from JSON source')
                except ValueError as exc:
                    self.issue('DATA_JS_PARSE', js_path, str(exc))
        for p in good:
            self.page(p, categories)
        self.discovery(good)
        expected = {SITE + '/product/' + p['slug'] + '.html' for p in good}
        sm_path = self.public / 'sitemap.xml'
        sm = self.read(sm_path)
        if sm is not None:
            try:
                locs = [n.text or '' for n in ET.fromstring(sm).findall('{*}url/{*}loc')]
                actual = [u for u in locs if '/product/' in u or '/product.html' in u]
                if set(actual) != expected or len(actual) != len(expected):
                    self.issue('SITEMAP_PRODUCTS', sm_path, f'missing={sorted(expected-set(actual))}; extra={sorted(set(actual)-expected)}; entries={len(actual)}')
                for value in locs:
                    parsed = urlparse(value)
                    target = self.public / (parsed.path.lstrip('/') or 'index.html')
                    if parsed.path.endswith('/'):
                        target = self.public / parsed.path.lstrip('/') / 'index.html'
                    if parsed.scheme != 'https' or parsed.netloc != 'www.kanapet.com' or parsed.query or parsed.fragment or not target.is_file():
                        self.issue('SITEMAP_URL', sm_path, f'invalid canonical/static URL: {value}')
            except ET.ParseError as exc:
                self.issue('SITEMAP_PARSE', sm_path, str(exc))
        files = {p.stem for p in (self.public / 'product').glob('*.html')}
        extras = files - {p['slug'] for p in good}
        if extras:
            self.issue('PAGE_ORPHAN', self.public / 'product', f'pages without valid product: {sorted(extras)}')
        return self.issues


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--format', choices=('text', 'json'), default='text')
    args = parser.parse_args()
    audit = Audit(args.root)
    issues = audit.run()
    counts = Counter(i['severity'] for i in issues)
    if args.format == 'json':
        print(json.dumps({'pages_checked': audit.checked, 'errors': counts['error'],
                          'warnings': counts['warning'], 'issues': issues}, ensure_ascii=False, indent=2))
    else:
        for i in issues:
            location = i['file'] + (f':{i["line"]}' if i['line'] else '')
            print(f'{i["severity"].upper()} [{i["code"]}] {location}: {i["message"]}')
        print(f'Checked {audit.checked} product pages: {counts["error"]} errors, {counts["warning"]} warnings')
    return 1 if counts['error'] else 0


if __name__ == '__main__':
    sys.exit(main())
