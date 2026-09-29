"""Regression tests use temporary fixtures; never mutate the real product catalog."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from audit_products import Audit, Document, SITE, moq_parts, size_text, strict_json


class ProductAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.pub = self.root / 'public'
        for name in ('data', 'js', 'product', 'images'):
            (self.pub / name).mkdir(parents=True)
        self.p = dict(id='sample', slug='sample', name='Sample & Cage', category='cages',
                      image='images/sample.jpg', size='10*20*30', material='ABS', moq=100,
                      moq_unit='pc', colors=['White'], gallery=[], notes='Confirmed sample.')
        self.cats = {'cages': {'name': 'Cages'}}
        self.url = SITE + '/product/sample.html'
        self.size = size_text(self.p['size'])
        self.desc = f'Sample & Cage. Product size: {self.size}. MOQ from 100 pcs.'
        self.ld = {'@context': 'https://schema.org', '@type': 'Product', 'name': self.p['name'],
                   'sku': 'SAMPLE', 'category': 'Cages', 'material': 'ABS', 'url': self.url,
                   'description': f'Sample & Cage. Size: {self.size}.',
                   'brand': {'@type': 'Brand', 'name': 'Kanapet'}, 'image': [SITE + '/images/sample.jpg']}
        self.crumb = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': i, 'name': name, 'item': url}
            for i, (name, url) in enumerate([('Home', SITE + '/'), ('Products', SITE + '/products.html'),
                ('Cages', SITE + '/products.html?cat=cages'), (self.p['name'], self.url)], 1)]}
        self.sync()
        self.write('images/sample.jpg', 'fixture-image')
        self.write('product/sample.html', self.html())
        self.write('sitemap.xml', f'<urlset><url><loc>{self.url}</loc></url></urlset>')
        self.write('products.html', f'<div class="product-card"><a href="/product/sample.html"><h3>Sample &amp; Cage</h3></a><div>{self.size}</div><div class="product-moq">MOQ: 100 pcs</div></div>')
        self.write('llms.txt', f'- [Sample & Cage]({self.url}) — size {self.size}, MOQ 100 pcs, ABS\n')

    def sync(self, products=None):
        products = [self.p] if products is None else products
        self.write('data/products.json', json.dumps(products))
        self.write('data/categories.json', json.dumps(self.cats))
        self.write('js/data.js', 'window.KANAPET_PRODUCTS = ' + json.dumps(products) + ';\nwindow.KANAPET_CATEGORIES = ' + json.dumps(self.cats) + ';')

    def write(self, name, text):
        (self.pub / name).write_text(text, encoding='utf-8')

    def html(self):
        return f'''<!doctype html><html><head><title>Sample &amp; Cage</title>
<meta name="description" content="{self.desc}">
<link rel="canonical" href="{self.url}">
<meta property="og:title" content="Sample &amp; Cage">
<meta property="og:description" content="{self.desc}">
<meta property="og:url" content="{self.url}"><meta property="og:type" content="product">
<meta property="og:image" content="{SITE}/images/sample.jpg">
<script type="application/ld+json">{json.dumps(self.ld)}</script>
<script type="application/ld+json">{json.dumps(self.crumb)}</script></head><body>
<h1>Sample &amp; Cage</h1><div class="product-sku">SKU: SAMPLE | OEM/ODM Available</div><img id="product-main-image" src="/images/sample.jpg">
<table class="spec-table"><tr><th>Product Size (W×D×H)</th><td>{self.size}</td></tr>
<tr><th>MOQ</th><td>100 pcs</td></tr><tr><th>Notes</th><td>Confirmed sample.</td></tr></table>
<div><h3>Materials</h3><p>ABS</p></div></body></html>'''

    def codes(self):
        return {i['code'] for i in Audit(self.root).run()}

    def mutate_page(self, old, new):
        path = self.pub / 'product/sample.html'
        path.write_text(path.read_text(encoding='utf-8').replace(old, new), encoding='utf-8')

    def test_valid_fixture_and_read_only(self):
        def hashes():
            return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.rglob('*') if p.is_file()}
        before = hashes()
        self.assertEqual(Audit(self.root).run(), [])
        self.assertEqual(before, hashes())

    def test_malformed_data_does_not_crash(self):
        for bad, code in [(None, 'DATA_ARRAY'), ({}, 'DATA_ARRAY'), ([], 'DATA_ARRAY'), ([1], 'DATA_OBJECT'), ([{}], 'DATA_REQUIRED')]:
            with self.subTest(bad=bad):
                self.sync(bad)
                if bad is None:
                    self.write('data/products.json', 'null')
                self.assertIn(code, self.codes())

    def test_unsafe_slug(self):
        self.p['slug'] = '../sample'
        self.sync()
        self.assertIn('DATA_SLUG', self.codes())

    def test_duplicate_ids(self):
        self.sync([self.p, self.p])
        self.assertIn('DATA_DUPLICATE', self.codes())

    def test_categories_and_js_drift(self):
        self.write('js/data.js', 'window.KANAPET_PRODUCTS = []; window.KANAPET_CATEGORIES = {};')
        self.assertIn('DATA_JS_SYNC', self.codes())

    def test_missing_nested_image(self):
        self.p['color_images'] = {'Blue': 'images/missing.jpg'}
        self.sync()
        self.assertIn('IMAGE_MISSING', self.codes())

    def test_missing_size_is_warning(self):
        self.p['size'] = ''
        self.sync()
        issues = Audit(self.root).run()
        self.assertTrue(any(i['code'] == 'DATA_UNKNOWN' and i['severity'] == 'warning' for i in issues))

    def test_zero_dimension(self):
        self.p['size'] = {'w': 10, 'd': 20, 'h': 0}
        self.sync()
        self.assertIn('DATA_SIZE_REVIEW', self.codes())

    def test_visible_size_drift(self):
        self.mutate_page(f'<td>{self.size}</td>', '<td>999 cm</td>')
        self.assertIn('PAGE_SPEC', self.codes())

    def test_visible_sku_drift(self):
        self.mutate_page('SKU: SAMPLE', 'SKU: WRONG')
        self.assertIn('PAGE_SKU', self.codes())

    def test_malformed_optional_fields(self):
        self.p.update(material=42, colors=None, color_images=[], material_options=[None])
        self.sync()
        self.assertIn('DATA_TYPE', self.codes())

    def test_carton_alias_omitted(self):
        self.p['carton_size'] = '30*40*50'
        self.sync()
        self.assertIn('PAGE_SPEC', self.codes())

    def test_conflicting_carton_is_review_not_guessed(self):
        self.p.update(carton_size='30*40*50', meas='60*70*80')
        self.sync()
        self.assertIn('DATA_CARTON_CONFLICT', self.codes())
        self.assertNotIn('PAGE_SPEC', self.codes())

    def test_moq_condition_and_duplicate_unit(self):
        for source, output in [('180 sets per color', '180 sets per color pcs'), ('100 per color', '100 pcs'), ('100', '1000 pcs')]:
            with self.subTest(source=source):
                audit = Audit(self.root)
                audit.moq(output, source, self.pub, 'TEST')
                self.assertEqual(audit.issues[0]['severity'], 'error')

    def test_moq_unit_insertion_is_not_false_error(self):
        audit = Audit(self.root)
        audit.moq('50 pcs per color', '50 per color', self.pub, 'TEST')
        self.assertEqual(audit.issues, [])

    def test_pc_data_unit_matches_public_pcs_label(self):
        self.assertEqual(moq_parts('50 pc per color'), moq_parts('50 pcs per color'))

    def test_order_specific_moq_is_not_compared_as_none_text(self):
        self.p['moq'] = None
        self.p['notes'] = 'Order quantity depends on the compatible product order.'
        self.sync()
        self.mutate_page('<td>100 pcs</td>', '<td>Contact for order-specific MOQ</td>')
        self.mutate_page(' MOQ from 100 pcs.', '')
        self.assertNotIn('PAGE_MOQ', self.codes())
        self.assertNotIn('SEO_MOQ', self.codes())
        self.assertNotIn('DATA_UNKNOWN', self.codes())

    def test_wrong_canonical(self):
        self.mutate_page(f'rel="canonical" href="{self.url}"', 'rel="canonical" href="https://example.com/"')
        self.assertIn('SEO_CANONICAL', self.codes())

    def test_noindex_and_missing_meta(self):
        self.mutate_page('<head>', '<head><meta name="robots" content="noindex">')
        self.mutate_page('name="description"', 'name="other"')
        self.assertTrue({'SEO_NOINDEX', 'SEO_DESCRIPTION'} <= self.codes())

    def test_bad_jsonld(self):
        self.mutate_page(json.dumps(self.ld), '{oops}')
        self.assertIn('LD_PARSE', self.codes())

    def test_duplicate_json_key(self):
        self.mutate_page(json.dumps(self.ld), '{"@type":"Product","@type":"Product"}')
        self.assertIn('LD_PARSE', self.codes())

    def test_jsonld_drift(self):
        self.ld['material'] = 'Steel'
        self.ld['sku'] = 'WRONG'
        self.write('product/sample.html', self.html())
        self.assertIn('LD_FACT', self.codes())

    def test_duplicate_product_schema(self):
        self.mutate_page('</head>', f'<script type="application/ld+json">{json.dumps(self.ld)}</script></head>')
        self.assertIn('LD_PRODUCT_COUNT', self.codes())

    def test_graph_supported(self):
        self.mutate_page(json.dumps(self.ld), json.dumps({'@context': 'https://schema.org', '@graph': [self.ld]}))
        self.assertEqual(Audit(self.root).run(), [])

    def test_breadcrumb_wrong_category(self):
        self.crumb['itemListElement'][2]['item'] = SITE + '/products.html?cat=wrong'
        self.write('product/sample.html', self.html())
        self.assertIn('LD_BREADCRUMB', self.codes())

    def test_unverified_offer(self):
        self.ld['offers'] = {'@type': 'Offer', 'price': 0}
        self.write('product/sample.html', self.html())
        self.assertIn('LD_UNVERIFIED_CLAIM', self.codes())

    def test_sitemap_missing_product(self):
        self.write('sitemap.xml', '<urlset/>')
        self.assertIn('SITEMAP_PRODUCTS', self.codes())

    def test_catalog_and_llms_drift(self):
        self.write('products.html', '<div></div>')
        self.write('llms.txt', f'- [Wrong]({self.url}) — size wrong, MOQ 100 pcs, ABS')
        self.assertTrue({'CATALOG_COVERAGE', 'LLMS_NAME', 'LLMS_SIZE'} <= self.codes())

    def test_dedicated_accessory_excluded_from_catalog_only(self):
        self.p['accessory_type'] = 'dedicated'
        self.sync()
        self.write('products.html', '<div></div>')
        self.assertEqual(Audit(self.root).run(), [])
        self.write('llms.txt', '')
        self.assertIn('LLMS_COVERAGE', self.codes())

    def test_cli_exit_codes_and_json(self):
        command = [sys.executable, '-B', str(Path(__file__).with_name('audit_products.py')), '--root', str(self.root), '--format', 'json']
        result = subprocess.run(command, capture_output=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['pages_checked'], 1)
        self.mutate_page('<h1>Sample &amp; Cage</h1>', '<h1>Wrong</h1>')
        result = subprocess.run(command, capture_output=True, encoding='utf-8')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertGreater(json.loads(result.stdout)['errors'], 0)

    def test_json_nonfinite_rejected(self):
        with self.assertRaises(ValueError):
            strict_json('{"value": NaN}')

    def test_entities_and_void_elements(self):
        doc = Document('<div><img src="x"><h1>A &amp; B</h1></div>').root
        self.assertEqual(doc.find('h1')[0].text(), 'A & B')


if __name__ == '__main__':
    unittest.main()
