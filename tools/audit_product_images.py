#!/usr/bin/env python3
"""Audit product image references and build labeled contact sheets for review."""
import argparse
import csv
import hashlib
import json
import math
import re
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def image_refs(product):
    yield "main", product.get("image")
    for value in product.get("gallery", []):
        yield "gallery", value
    for name, value in product.get("color_images", {}).items():
        yield f"color:{name}", value
    for field in ("color_options", "material_options"):
        for option in product.get(field, []):
            if isinstance(option, dict):
                yield f"{field}:{option.get('name', '')}", option.get("image")


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def contact_sheet(products, category, output_dir, page_size=12):
    tile_w, tile_h = 360, 430
    columns = 3
    title_font, id_font, body_font = font(22, True), font(18, True), font(15)
    paths = []
    for page_no in range(math.ceil(len(products) / page_size)):
        page = products[page_no * page_size:(page_no + 1) * page_size]
        rows = math.ceil(len(page) / columns)
        canvas = Image.new("RGB", (columns * tile_w, 60 + rows * tile_h), "white")
        draw = ImageDraw.Draw(canvas)
        draw.text((16, 16), f"{category} — primary image review — page {page_no + 1}",
                  fill="black", font=title_font)
        for index, product in enumerate(page):
            col, row = index % columns, index // columns
            x, y = col * tile_w, 60 + row * tile_h
            draw.rectangle((x, y, x + tile_w - 1, y + tile_h - 1), outline="#b8b8b8", width=1)
            source = PUBLIC / product["image"]
            with Image.open(source) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                image.thumbnail((tile_w - 24, 300), Image.Resampling.LANCZOS)
                image_x = x + (tile_w - image.width) // 2
                canvas.paste(image, (image_x, y + 10))
                text_y = y + 318
            draw.text((x + 10, text_y), product["id"], fill="#111", font=id_font)
            draw.text((x + 10, text_y + 25), product["name"], fill="#333", font=body_font)
            path = product["image"]
            if len(path) > 44:
                path = "…" + path[-43:]
            draw.text((x + 10, text_y + 50), path, fill="#666", font=body_font)
        path = output_dir / f"contact-{category}-{page_no + 1}.png"
        canvas.save(path, optimize=True)
        paths.append(path)
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="outputs/product-image-audit")
    parser.add_argument("--no-contact-sheets", action="store_true")
    args = parser.parse_args()

    products = json.loads((PUBLIC / "data/products.json").read_text(encoding="utf-8"))
    output_dir = ROOT / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    missing = []
    static_missing = []
    rows = []
    primary_paths = defaultdict(list)
    primary_hashes = defaultdict(list)
    by_category = defaultdict(list)

    for product in products:
        by_category[product["category"]].append(product)
        for role, value in image_refs(product):
            if not value:
                continue
            path = PUBLIC / value
            exists = path.is_file()
            rows.append((product["id"], product["name"], product["category"], role, value, exists))
            if not exists:
                missing.append((product["id"], role, value))
        primary = product.get("image")
        if primary and (PUBLIC / primary).is_file():
            primary_paths[primary].append(product["id"])
            digest = hashlib.sha256((PUBLIC / primary).read_bytes()).hexdigest()
            primary_hashes[digest].append((product["id"], primary))

    with (output_dir / "image-inventory.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(("product_id", "product_name", "category", "role", "image_path", "exists"))
        writer.writerows(rows)

    shared_paths = {path: ids for path, ids in primary_paths.items() if len(ids) > 1}
    duplicate_files = {digest: values for digest, values in primary_hashes.items() if len(values) > 1}
    image_pattern = re.compile(
        r'(?:src|content)="(?:https://www\.kanapet\.com)?/([^"?]+\.(?:jpe?g|png|webp|gif|svg))',
        re.I,
    )
    for html_path in PUBLIC.rglob("*.html"):
        source = html_path.read_text(encoding="utf-8")
        for image_path in image_pattern.findall(source):
            if not (PUBLIC / image_path).is_file():
                static_missing.append((html_path.relative_to(ROOT).as_posix(), image_path))
    report = {
        "products": len(products),
        "references": len(rows),
        "unique_paths": len({row[4] for row in rows}),
        "missing": missing,
        "static_html_missing": static_missing,
        "shared_primary_paths": shared_paths,
        "duplicate_primary_files": duplicate_files,
    }
    (output_dir / "audit-summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    sheets = []
    if not args.no_contact_sheets:
        for category, category_products in sorted(by_category.items()):
            sheets.extend(contact_sheet(category_products, category, output_dir))

    print(f"Products: {len(products)} | references: {len(rows)} | missing: {len(missing)}")
    print(f"Missing static HTML image references: {len(static_missing)}")
    print(f"Shared primary paths: {len(shared_paths)} | exact duplicate primary groups: {len(duplicate_files)}")
    print(f"Contact sheets: {len(sheets)} | output: {output_dir.relative_to(ROOT).as_posix()}")
    return 1 if missing or static_missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
