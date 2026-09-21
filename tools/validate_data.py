#!/usr/bin/env python3
"""
KANAPET data integrity validator.

Run before every commit that touches product data or the sitemap:
    python3 tools/validate_data.py

Checks (exit 1 on any ERROR):
  1. products.json is a non-empty JSON array with required fields per SKU
  2. slugs are unique, non-empty, URL-safe (lowercase + digits + dashes)
  3. public/js/data.js KANAPET_PRODUCTS is in exact sync with products.json
  4. sitemap.xml product URLs match products.json exactly (count + set)
  5. every SKU category exists in KANAPET_CATEGORIES
  6. every image referenced by SKU data exists under public/ (warning-only)
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
CORE_FIELDS = ["id", "slug", "name", "category", "image"]       # missing -> ERROR
EXTENDED_FIELDS = ["size", "moq", "colors", "material", "notes",
                   "gallery"]                                    # missing -> WARNING
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
IMG_RE = re.compile(r"images/[\w./-]+\.(?:jpg|jpeg|png|webp|gif)")

errors, warnings = [], []


def err(msg): errors.append(msg)
def warn(msg): warnings.append(msg)


# ---- 1. products.json ----
try:
    prods = json.load(open(os.path.join(PUB, "data/products.json"), encoding="utf-8"))
except Exception as e:
    print(f"ERROR: products.json is not valid JSON: {e}"); sys.exit(1)
if not isinstance(prods, list) or not prods:
    err("products.json must be a non-empty array")

for i, p in enumerate(prods):
    for f in CORE_FIELDS:
        if f not in p or p[f] in ("", None):
            err(f"SKU#{i} ({p.get('slug','?')}): missing/empty core field '{f}'")
    for f in EXTENDED_FIELDS:
        if f not in p or p[f] in ("", None):
            warn(f"SKU#{i} ({p.get('slug','?')}): missing/empty field '{f}' (fill when specs are available)")

# ---- 2. slug & id uniqueness ----
slugs = [p.get("slug", "") for p in prods]
ids = [p.get("id", "") for p in prods]
dup_slugs = {s for s in slugs if slugs.count(s) > 1}
dup_ids = {s for s in ids if ids.count(s) > 1}
if dup_slugs:
    err(f"duplicate slugs in products.json: {sorted(dup_slugs)}  "
        f"(unreachable products: find() only ever returns the first match)")
if dup_ids:
    err(f"duplicate ids in products.json: {sorted(dup_ids)}")
bad_slugs = [s for s in slugs if not SLUG_RE.match(s)]
if bad_slugs:
    err(f"slugs not URL-safe (lowercase/digits/dashes): {bad_slugs}")

# ---- 3. data.js sync ----
js = open(os.path.join(PUB, "js/data.js"), encoding="utf-8").read()
m = re.search(r"KANAPET_PRODUCTS\s*=\s*(\[[\s\S]*?\])\s*;\s*\n", js)
if not m:
    err("data.js: cannot locate KANAPET_PRODUCTS = [...] ;")
    js_prods = None
else:
    try:
        js_prods = json.loads(m.group(1))
    except Exception as e:
        err(f"data.js: KANAPET_PRODUCTS is not valid JSON: {e}"); js_prods = None
if js_prods is not None and js_prods != prods:
    if len(js_prods) != len(prods):
        err(f"data.js/products.json count mismatch: {len(js_prods)} vs {len(prods)}")
    else:
        for i, (a, b) in enumerate(zip(prods, js_prods)):
            if a != b:
                err(f"data.js SKU#{i} ({a.get('slug','?')}) differs from products.json")
                break

# ---- 4. sitemap sync ----
sitemap_path = os.path.join(PUB, "sitemap.xml")
sm = open(sitemap_path, encoding="utf-8").read()
try:
    root = ET.fromstring(sm)
    locs = [node.text.strip() for node in root.findall("{*}url/{*}loc") if node.text]
except ET.ParseError as e:
    err(f"sitemap.xml is not valid XML: {e}")
    locs = []

# Canonical product URLs use /product/<slug>.html. Accept the legacy query
# form too so a partially migrated sitemap still gets a useful diagnosis.
sm_slugs = []
for loc in locs:
    parsed = urlparse(loc)
    match = re.fullmatch(r"/product/([a-z0-9]+(?:-[a-z0-9]+)*)\.html", parsed.path)
    if match:
        sm_slugs.append(match.group(1))
        continue
    if parsed.path == "/product.html":
        legacy = re.search(r"(?:^|&)slug=([a-z0-9-]+)(?:&|$)", parsed.query)
        if legacy:
            sm_slugs.append(legacy.group(1))
if sorted(sm_slugs) != sorted(set(slugs)) or len(sm_slugs) != len(slugs):
    err(f"sitemap.xml product URLs ({len(sm_slugs)}) do not match products.json "
        f"({len(set(slugs))} unique). missing={sorted(set(slugs)-set(sm_slugs))} "
        f"extra={sorted(set(sm_slugs)-set(slugs))}")
for loc in locs:
    parsed = urlparse(loc)
    if parsed.scheme != "https" or parsed.netloc != "www.kanapet.com":
        err(f"sitemap.xml URL is not on the canonical HTTPS host: {loc}")
        continue
    path = parsed.path.lstrip("/")
    if path and not os.path.exists(os.path.join(PUB, path)):
        err(f"sitemap.xml references missing static page: {path}")

# ---- 5. categories ----
mc = re.search(r"KANAPET_CATEGORIES\s*=\s*(\{[\s\S]*?\})\s*;", js)
if mc:
    try:
        cats = set(json.loads(mc.group(1)).keys())
        for p in prods:
            if p.get("category") not in cats:
                err(f"SKU {p.get('slug','?')}: unknown category '{p.get('category')}'")
    except Exception as e:
        err(f"data.js: KANAPET_CATEGORIES is not valid JSON: {e}")
else:
    err("data.js: cannot locate KANAPET_CATEGORIES")

# ---- 6. image existence (warning-only) ----
referenced = set()
for p in prods:
    for v in p.values():
        if isinstance(v, str):
            referenced.update(IMG_RE.findall(v))
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, str):
                    referenced.update(IMG_RE.findall(item))
                elif isinstance(item, dict):
                    for vv in item.values():
                        if isinstance(vv, str):
                            referenced.update(IMG_RE.findall(vv))
missing_imgs = sorted(img for img in referenced
                      if not os.path.exists(os.path.join(PUB, img)))
for img in missing_imgs:
    warn(f"image referenced but missing: {img}")

# ---- report ----
n = len(prods)
print(f"SKUs: {n} ({len(set(slugs))} unique slugs) | sitemap product URLs: {len(sm_slugs)} "
      f"| images referenced: {len(referenced)}")
for w in warnings: print(f"WARNING: {w}")
if errors:
    for e in errors: print(f"ERROR: {e}")
    print(f"\nFAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1)
print(f"OK: all integrity checks passed ({len(warnings)} warning(s))")
