"""Exercise release protections without modifying the real catalog."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    fixture = Path(directory)
    (fixture / 'tools').mkdir()
    (fixture / 'public/data').mkdir(parents=True)
    (fixture / 'content').mkdir()
    shutil.copy(ROOT / 'tools/check_confirmed_products.py', fixture / 'tools')
    data = fixture / 'public/data/products.json'
    approval = fixture / 'content/confirmed-products.json'
    def check():
        return subprocess.run([sys.executable, str(fixture / 'tools/check_confirmed_products.py')], capture_output=True).returncode
    data.write_text(json.dumps([{'id': 'example', 'gross_weight': '12'}]))
    approval.write_text(json.dumps({'products': {'example': {'gross_weight': '12'}}, 'images': {}}))
    assert check() == 0
    data.write_text(json.dumps([{'id': 'example', 'gross_weight': '10'}]))
    assert check() != 0, 'Changed confirmed weight must block publishing'
    data.write_text(json.dumps([{'id': 'example', 'gross_weight': '12'}]))
    approval.write_text(json.dumps({'products': {}, 'images': {'photo.jpg': hashlib.sha256(b'original').hexdigest()}}))
    assert check() != 0, 'Missing confirmed image must block publishing'
    (fixture / 'public/photo.jpg').write_bytes(b'replaced')
    assert check() != 0, 'Replaced confirmed image must block publishing'
environment = {k: v for k, v in os.environ.items() if not k.startswith('WORKERS_CI')}
result = subprocess.run([sys.executable, str(ROOT / 'tools/prepare_production.py')], env=environment, capture_output=True)
assert result.returncode != 0, 'Local production publishing must be blocked'
print('Release guard regression checks passed')
