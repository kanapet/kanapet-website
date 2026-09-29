#!/usr/bin/env python3
"""Synchronize static product facts from public/data/products.json.

The script preserves page-specific galleries and marketing sections while
refreshing facts that must have one source of truth: specs, SEO descriptions,
Product/Breadcrumb JSON-LD, catalog cards and llms.txt entries.
"""
import argparse
import difflib
import html
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SITE = "https://www.kanapet.com"

# Keep renamed products consistent across prerendered related-product cards and
# consolidate any old URLs through the matching redirects in worker/index.js.
LEGACY_PRODUCT_ALIASES = {
    "bird-parrot-nest-old": ("bird-no-mess-parrot-feeder", None),
    "hamster-bite-guard": ("hamster-tube-anti-chew-ring", "Bite Guard (Pipe Connector)"),
}

LEGACY_PRODUCT_NAME_ALIASES = {
    "6.7\" Running Wheel + Hanging Bracket": "17 cm Hamster Running Wheel",
    "8.3\" Running Wheel + Hanging Bracket": "21 cm Hamster Running Wheel",
}

# Keep historical asset filenames out of static product pages after a product
# is renamed. The source records above use the canonical filenames.
LEGACY_ASSET_ALIASES = {
    "images/products/bird-parrot-nest-old.jpg": "images/products/bird-no-mess-parrot-feeder.jpg",
    "images/products/hamster-bite-guard-v3.jpg": "images/products/hamster-tube-anti-chew-ring.jpg",
}


def text(value):
    return html.escape(str(value), quote=True)


def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def format_number(value):
    value = float(value)
    return str(int(value)) if value.is_integer() else str(value)


def format_size(value):
    if value in (None, ""):
        return ""
    if isinstance(value, dict):
        if not all(key in value for key in ("w", "d", "h")):
            return ""
        source = "*".join(str(value[key]) for key in ("w", "d", "h"))
    else:
        source = str(value).strip()
    source = source.replace("*", " × ")
    source = re.sub(r"(?<=\d)[xX](?=\d)", " × ", source)
    match = re.fullmatch(
        r"\s*(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*",
        source,
    )
    if match:
        dims = [float(value) for value in match.groups()]
        metric = " × ".join(format_number(value) for value in dims)
        imperial = " × ".join(f"{value / 2.54:.1f}" for value in dims)
        return f"{metric} cm ({imperial} in)"
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*", source)
    if match:
        value = float(match.group(1))
        return f"{format_number(value)} cm ({value / 2.54:.1f} in)"
    return source if re.search(r"\b(?:cm|in|inch)\b", source, re.I) else source + " cm"


def format_moq(value):
    if value in (None, ""):
        return ""
    value = str(value).strip()
    return value + " pcs" if re.fullmatch(r"\d+(?:\.\d+)?", value) else value


def image_paths(product):
    ordered = []

    def add(value):
        if isinstance(value, str) and value.startswith("images/") and value not in ordered:
            ordered.append(value)

    add(product.get("image"))
    for value in product.get("gallery", []):
        add(value)
    for value in product.get("color_images", {}).values():
        add(value)
    for field in ("color_options", "material_options"):
        for option in product.get(field, []):
            if isinstance(option, dict):
                add(option.get("image"))
    return ordered


def replace_once(source, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise ValueError(f"{label}: expected one match, got {count}")
    return updated


def rewrite_legacy_product_references(source, products):
    names_by_slug = {product["slug"]: product["name"] for product in products}
    for old_slug, (new_slug, old_name) in LEGACY_PRODUCT_ALIASES.items():
        source = source.replace(f"/product/{old_slug}.html", f"/product/{new_slug}.html")
        if old_name and new_slug in names_by_slug:
            new_name = names_by_slug[new_slug]
            source = source.replace(old_name, new_name)
            source = source.replace(quote(old_name, safe=""), quote(new_name, safe=""))
    for old_name, new_name in LEGACY_PRODUCT_NAME_ALIASES.items():
        source = source.replace(old_name, new_name)
        source = source.replace(text(old_name), text(new_name))
        source = source.replace(quote(old_name, safe=""), quote(new_name, safe=""))
    return source


def rewrite_legacy_asset_references(source):
    for old_path, new_path in LEGACY_ASSET_ALIASES.items():
        source = source.replace(old_path, new_path)
    return source


def meta_description(product, category):
    parts = [
        f"Buy {product['name']} wholesale from Kanapet — leading {category.lower()} manufacturer since 1991."
    ]
    size = format_size(product.get("size"))
    if size:
        parts.append(f" Product size: {size}.")
    moq = format_moq(product.get("moq"))
    if moq:
        parts.append(f" MOQ from {moq}.")
    parts.append(
        " OEM/ODM available, custom colors, logos and packaging. 20,000㎡ factory in Foshan, China. Request a quote today."
    )
    return "".join(parts)


def product_schema(product, category):
    size = format_size(product.get("size"))
    description = f"{product['name']} — {category}."
    if size:
        description += f" Size: {size}."
    description += " OEM/ODM available from Kanapet, pet cage manufacturer since 1991."
    schema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product["name"],
        "sku": product.get("sku") or product["id"].upper(),
        "image": [f"{SITE}/{path.lstrip('/')}" for path in image_paths(product)],
        "description": description,
        "url": f"{SITE}/product/{product['slug']}.html",
        "brand": {"@type": "Brand", "name": "Kanapet"},
        "manufacturer": {
            "@type": "Organization",
            "name": "Kanapet",
            "url": SITE,
            "foundingDate": "1991",
            "address": {
                "@type": "PostalAddress",
                "addressLocality": "Foshan",
                "addressRegion": "Guangdong",
                "addressCountry": "CN",
            },
        },
        "category": category,
    }
    if product.get("material"):
        schema["material"] = product["material"]
    return schema


def breadcrumb_schema(product, category):
    slug = product["slug"]
    items = [
        ("Home", f"{SITE}/"),
        ("Products", f"{SITE}/products.html"),
        (category, f"{SITE}/products.html?cat={product['category']}"),
        (product["name"], f"{SITE}/product/{slug}.html"),
    ]
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": position, "name": name, "item": url}
            for position, (name, url) in enumerate(items, 1)
        ],
    }


def specs_html(product):
    rows = []

    def add(label, value, suffix=""):
        if value not in (None, ""):
            rows.append((label, str(value) + suffix))

    add("Type", product.get("type"))
    if product.get("size"):
        semantic_size = isinstance(product["size"], str) and product["size"].strip().lower().startswith("length ")
        add("Product Size" if semantic_size else "Product Size (W×D×H)", format_size(product["size"]))
    carton = product.get("carton_size") or product.get("meas")
    if carton:
        add("Carton Size (W×D×H)", format_size(carton))
    add("Net Weight", product.get("net_weight"), " kg")
    add("Gross Weight", product.get("gross_weight"), " kg")
    add("CBM", product.get("cbm"), " m³")
    add("PCS per Carton", product.get("pcs_per_ctn"))
    add("Color", product.get("color"))
    add("Included Accessories", product.get("accessories"))
    add("MOQ", format_moq(product.get("moq")) or "Contact for order-specific MOQ")
    add("Notes", product.get("notes"))
    return "\n".join(f"        <tr><th>{text(label)}</th><td>{text(value)}</td></tr>" for label, value in rows)


def gallery_html(product):
    paths = []
    for path in [product.get("image"), *product.get("gallery", [])]:
        if path and path not in paths:
            paths.append(path.lstrip("/"))
    if len(paths) < 2:
        return '<div style="margin-top:8px;font-size:12px;color:var(--text-light);text-align:center;">🔍 Click image to zoom </div>'
    thumbs = "\n".join(
        f'        <div class="product-thumb{" active" if index == 0 else ""}" '
        f'onclick="switchProductImage(this, \'/{text(path)}\')" role="button" tabindex="0" '
        f'onkeydown="if(event.key===\'Enter\'||(this.getAttribute(\'role\')===\'button\'&&event.key===\' \')){{event.preventDefault();this.click();}}">'
        f'<img src="/{text(path)}" alt="{text(product["name"])} view {index + 1}" loading="lazy"></div>'
        for index, path in enumerate(paths)
    )
    return (
        '      <div class="product-thumbnails">\n' + thumbs + '\n      </div>\n'
        '      <div style="margin-top:8px;font-size:12px;color:var(--text-light);text-align:center;">'
        '🔍 Click image to zoom | Click thumbnails to switch</div>'
    )


def features_html(product):
    return "\n".join(f"        <li>{text(feature)}</li>" for feature in product.get("features", []))


def sync_page(source, product, categories):
    category = categories[product["category"]]["name"]
    slug = product["slug"]
    url = f"{SITE}/product/{slug}.html"
    description = meta_description(product, category)
    escaped_description = text(description)

    source = replace_once(
        source,
        r'(<meta name="description" content=").*?("\s*/?>)',
        lambda match: match.group(1) + escaped_description + match.group(2),
        f"{slug} meta description",
    )
    source = replace_once(
        source,
        r'(<meta property="og:description" content=").*?("\s*/?>)',
        lambda match: match.group(1) + escaped_description + match.group(2),
        f"{slug} og description",
    )
    source = replace_once(
        source,
        r'(<link rel="canonical" href=").*?("\s*/?>)',
        lambda match: match.group(1) + url + match.group(2),
        f"{slug} canonical",
    )
    source = replace_once(
        source,
        r'(<meta property="og:url" content=").*?("\s*/?>)',
        lambda match: match.group(1) + url + match.group(2),
        f"{slug} og url",
    )
    main_image = product["image"].lstrip("/")
    source = replace_once(
        source,
        r'(<meta property="og:image" content=").*?("\s*/?>)',
        lambda match: match.group(1) + f"{SITE}/{main_image}" + match.group(2),
        f"{slug} og image",
    )
    source = replace_once(
        source,
        r'(<img id="product-main-image" src=").*?(" alt=").*?("\s+class=)',
        lambda match: (match.group(1) + "/" + text(main_image) + match.group(2) +
                       text(product["name"]) + match.group(3)),
        f"{slug} main image",
    )
    source = replace_once(
        source,
        r'(<div class="product-main-image-wrap">.*?</div>\s*</div>)\s*'
        r'(?:<div class="product-thumbnails">.*?</div>\s*)?'
        r'<div style="margin-top:8px;font-size:12px;color:var\(--text-light\);text-align:center;">.*?</div>',
        lambda match: match.group(1) + "\n" + gallery_html(product),
        f"{slug} gallery",
        re.DOTALL,
    )
    source = replace_once(
        source,
        r'(<script[^>]*id="product-jsonld"[^>]*>).*?(</script>)',
        lambda match: match.group(1) + compact_json(product_schema(product, category)) + match.group(2),
        f"{slug} product schema",
        re.DOTALL,
    )
    source = replace_once(
        source,
        r'(<script[^>]*id="breadcrumb-jsonld"[^>]*>).*?(</script>)',
        lambda match: match.group(1) + compact_json(breadcrumb_schema(product, category)) + match.group(2),
        f"{slug} breadcrumb schema",
        re.DOTALL,
    )
    source = replace_once(
        source,
        r'(<div class="product-sku">SKU:\s*).*?(\s*\|\s*OEM/ODM Available</div>)',
        lambda match: match.group(1) + text(product.get("sku") or product["id"].upper()) + match.group(2),
        f"{slug} SKU",
    )
    source = replace_once(
        source,
        r'(<table class="spec-table">).*?(</table>)',
        lambda match: match.group(1) + "\n" + specs_html(product) + "\n      " + match.group(2),
        f"{slug} primary spec table",
        re.DOTALL,
    )
    material = product.get("material") or "Material specifications available on request."
    source = replace_once(
        source,
        r'(<h3[^>]*>Materials</h3>\s*<p[^>]*>).*?(</p>)',
        lambda match: match.group(1) + text(material) + match.group(2),
        f"{slug} material",
        re.DOTALL,
    )
    source = source.replace(
        "Made from food-grade, pet-safe materials",
        "Designed for routine installation, use and cleaning",
    )
    if product.get("features"):
        source = replace_once(
            source,
            r'(<h3[^>]*>Key Features</h3>\s*<ul[^>]*>).*?(</ul>)',
            lambda match: match.group(1) + "\n" + features_html(product) + "\n      " + match.group(2),
            f"{slug} features",
            re.DOTALL,
        )

    for variant in categories["_products"]:
        variant_slug = re.escape(variant["slug"])
        value = text(format_moq(variant.get("moq")) or "Contact")
        pattern = (
            r'(<tr style="[^"]*">\s*<td>.*?</td>\s*<td>.*?</td>\s*<td>).*?'
            r'(</td>\s*<td><a href="/product/' + variant_slug + r'\.html")'
        )
        source = re.sub(pattern, lambda match: match.group(1) + value + match.group(2), source, flags=re.DOTALL)

        # Related-product and accessory cards are prerendered into many pages.
        # Keep their image paths aligned when a product image is replaced or renamed.
        variant_name = re.escape(text(variant["name"]))
        variant_image = "/" + text(variant["image"].lstrip("/"))
        image_pattern = r'(<img src=")[^"]*(" alt="' + variant_name + r'")'
        source = re.sub(
            image_pattern,
            lambda match: match.group(1) + variant_image + match.group(2),
            source,
        )
    return source


COLOR_MAP = {
    "green": "#7cb342", "blue": "#4a90d9", "yellow": "#ffd54f",
    "white": "#fff", "black": "#222", "pink": "#f48fb1", "grey": "#999",
    "gray": "#999", "purple": "#9c6ade", "orange": "#f5a623", "red": "#e55",
}


def swatches(product):
    colors = product.get("colors") or []
    if not colors:
        return ""
    spans = []
    for color in colors:
        key = color.lower()
        special = " transparent" if key == "transparent" else ""
        style = "cursor:pointer;" if special else f"background-color:{COLOR_MAP.get(key, '#ddd')};cursor:pointer;"
        spans.append(
            f'<span class="color-swatch{special}" style="{style}" title="{text(color)}" data-color="{text(color)}"></span>'
        )
    if len(colors) > 1:
        spans.append(f'<span class="color-swatch-label">{len(colors)} colors</span>')
    return '<div class="color-swatches">' + "".join(spans) + "</div>"


def catalog_cards(products, categories):
    cards = []
    for product in products:
        if product.get("accessory_type") == "dedicated":
            continue
        slug = product["slug"]
        size = format_size(product.get("size"))
        moq = format_moq(product.get("moq"))
        cards.append(f'''      <div class="product-card" data-cat="{text(product['category'])}">
        <a href="/product/{slug}.html" class="product-img-link">
          <div class="product-img">
            <img src="/{text(product['image'].lstrip('/'))}" alt="{text(product['name'])}" width="800" height="800" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="placeholder" style="display:none;align-items:center;justify-content:center;width:100%;height:100%;font-size:48px;color:var(--primary-light);opacity:0.3;">📦</div>
          </div>
        </a>
        <div class="product-info">
          <a href="/product/{slug}.html" class="product-name-link"><h3>{text(product['name'])}</h3></a>
          {f'<div class="product-meta">{text(size)}</div>' if size else ''}
          <div class="product-meta">{text(categories[product['category']]['name'])}</div>
          {swatches(product)}
          <div class="product-moq">{f'MOQ: {text(moq)}' if moq else 'Contact for MOQ'}</div>
          <a href="/product/{slug}.html" class="btn btn-primary">Request Quote</a>
        </div>
      </div>''')
    return "\n".join(line.rstrip() for line in "\n".join(cards).splitlines())


CATEGORY_INTROS = {
    "bird-cages": "Premium bird cages in transparent, wire and stainless steel options — 650, 490, 470 and 400 series.",
    "bird-accessories": "Bathrooms, nesting boxes, feeders, water bottles, perches and more.",
    "bird-travel": "Compact travel cages for birds — 23cm to 42cm, multi-color options.",
    "smart-pet-products": "Smart feeders and water dispensers for modern pet care.",
    "hamster-cages": "Transparent acrylic hamster cages and folding cages — 43cm to 75cm.",
    "hamster-accessories": "Running wheels, tunnels, sand baths, platforms and feeding cups.",
    "other-small-pets": "Rabbit cages, cat litter boxes and feeders, turtle tanks and supplies for other small animals.",
}


def llms_catalog(products, categories):
    lines = ["## Product catalog", ""]
    for category_id, category in categories.items():
        lines.extend([f"### {category['name']}", f"- {CATEGORY_INTROS.get(category_id, 'Wholesale products for OEM/ODM buyers.')}" ])
        for product in products:
            if product["category"] != category_id:
                continue
            facts = []
            size = format_size(product.get("size"))
            if size:
                facts.append("size " + size)
            moq = format_moq(product.get("moq"))
            facts.append("MOQ " + (moq or "contact for order-specific quantity"))
            if product.get("material"):
                facts.append(product["material"])
            lines.append(
                f"- [{product['name']}]({SITE}/product/{product['slug']}.html) — " + ", ".join(facts)
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def build_outputs():
    products = json.loads((PUBLIC / "data/products.json").read_text(encoding="utf-8"))
    categories = json.loads((PUBLIC / "data/categories.json").read_text(encoding="utf-8"))
    categories_for_pages = dict(categories)
    categories_for_pages["_products"] = products
    outputs = {}
    for product in products:
        path = PUBLIC / "product" / f"{product['slug']}.html"
        page = sync_page(path.read_text(encoding="utf-8"), product, categories_for_pages)
        outputs[path] = rewrite_legacy_asset_references(
            rewrite_legacy_product_references(page, products)
        )

    products_path = PUBLIC / "products.html"
    source = products_path.read_text(encoding="utf-8")
    pattern = r'(<div class="products-grid" id="all-products" data-prerendered="1">).*?(\n    </div>\n  </div>\n</section>\n\n<section class="cta-banner">)'
    outputs[products_path] = replace_once(
        source,
        pattern,
        lambda match: match.group(1) + "\n" + catalog_cards(products, categories) + match.group(2),
        "product catalog grid",
        re.DOTALL,
    )

    llms_path = PUBLIC / "llms.txt"
    source = llms_path.read_text(encoding="utf-8")
    prefix = source.split("## Product catalog", 1)[0]
    outputs[llms_path] = prefix + llms_catalog(products, categories)

    sitemap_path = PUBLIC / "sitemap.xml"
    outputs[sitemap_path] = rewrite_legacy_product_references(
        sitemap_path.read_text(encoding="utf-8"), products
    )
    return outputs


def patch_for(path, old, new):
    rel = path.relative_to(ROOT).as_posix()
    diff = list(difflib.unified_diff(
        old.splitlines(keepends=True), new.splitlines(keepends=True),
        fromfile=rel, tofile=rel, n=3,
    ))
    return "*** Update File: " + rel + "\n" + "".join(diff[2:])


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report drift without writing")
    parser.add_argument("--patch", action="store_true", help="print an apply_patch-compatible patch")
    args = parser.parse_args()
    outputs = build_outputs()
    changed = [(path, path.read_text(encoding="utf-8"), new) for path, new in outputs.items()
               if path.read_text(encoding="utf-8") != new]
    if args.patch:
        print("*** Begin Patch")
        for path, old, new in changed:
            print(patch_for(path, old, new), end="")
        print("*** End Patch")
    elif args.check:
        for path, _, _ in changed:
            print(path.relative_to(ROOT).as_posix())
        if changed:
            print(f"Product output drift: {len(changed)} file(s)", file=sys.stderr)
            return 1
    else:
        for path, _, new in changed:
            path.write_text(new, encoding="utf-8")
            print(path.relative_to(ROOT).as_posix())
        print(f"Synchronized {len(changed)} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
