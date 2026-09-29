#!/usr/bin/env python3
"""Normalize generated product facts without rebuilding customized pages.

This is intentionally a narrow migration tool. Product data remains the fact
source; the script only replaces leaked Python dict representations in static
HTML/llms.txt with the site's standard metric + inch display.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def display_size(size):
    dims = [size[key] for key in ("w", "d", "h")]
    metric = " × ".join(str(value) for value in dims)
    imperial = " × ".join(f"{value / 2.54:.1f}" for value in dims)
    return f"{metric} cm ({imperial} in)"


def main():
    products = json.loads((PUBLIC / "data/products.json").read_text(encoding="utf-8"))
    replacements = {}
    for product in products:
        size = product.get("size")
        if not isinstance(size, dict) or not all(key in size for key in ("w", "d", "h")):
            continue
        leaked = str({key: size[key] for key in ("w", "d", "h")}) + " cm"
        rendered = display_size(size)
        replacements[leaked] = rendered
        replacements[html.escape(leaked, quote=True)] = rendered

    changed = []
    targets = [PUBLIC / "products.html", PUBLIC / "llms.txt", *(PUBLIC / "product").glob("*.html")]
    for path in targets:
        source = path.read_text(encoding="utf-8")
        updated = source
        for old, new in replacements.items():
            updated = updated.replace(old, new)

        # Inquiry-only B2B pages do not publish a verified price, availability
        # or tax position. Remove the entire Offer until those facts exist;
        # never substitute a zero/contact-price placeholder.
        def clean_product_schema(match):
            schema = json.loads(match.group(2))
            schema.pop("offers", None)
            compact = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
            return match.group(1) + compact + match.group(3)

        updated = re.sub(
            r'(<script[^>]*id="product-jsonld"[^>]*>)(.*?)(</script>)',
            clean_product_schema,
            updated,
            flags=re.DOTALL,
        )
        if updated != source:
            path.write_text(updated, encoding="utf-8")
            changed.append(path.relative_to(ROOT).as_posix())

    print(f"Normalized {len(changed)} file(s)")
    for path in changed:
        print(path)


if __name__ == "__main__":
    main()
