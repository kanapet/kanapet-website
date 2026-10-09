"""Prevent accidental loss of user-confirmed facts and original image assets."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
products = {p['id']: p for p in json.loads((ROOT / 'public/data/products.json').read_text(encoding='utf-8'))}
approved = json.loads((ROOT / 'content/confirmed-products.json').read_text(encoding='utf-8'))
failures = []
for slug, fields in approved['products'].items():
    for key, value in fields.items():
        if products.get(slug, {}).get(key) != value:
            failures.append(f'{slug}: confirmed {key} changed; update approval record deliberately')
for relative, digest in approved['images'].items():
    path = ROOT / 'public' / relative
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        failures.append(f'Confirmed image missing or changed: {relative}')
if failures:
    print('\n'.join(failures), file=sys.stderr)
    sys.exit(1)
print(f'Confirmed product checks passed: {len(approved["products"])} products, {len(approved["images"])} images')
