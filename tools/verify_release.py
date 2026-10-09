"""Compare deployed HTML, product data and scripts with the exact release."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def verify(base, retries):
    expected = json.loads((ROOT / 'public/release.json').read_text(encoding='utf-8'))
    paths = ['data/products.json', 'js/data.js', 'js/main.js', 'products.html']
    approved = json.loads((ROOT / 'content/confirmed-products.json').read_text(encoding='utf-8'))
    paths += ['product/' + slug + '.html' for slug in approved['products']]
    paths += list(approved['images'])
    for attempt in range(retries):
        try:
            def fetch(path):
                req = urllib.request.Request(base.rstrip('/') + '/' + path + '?release=' + expected['id'], headers={'User-Agent': 'Mozilla/5.0 (compatible; KanapetReleaseCheck/1.0)', 'Accept': '*/*', 'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req, timeout=20) as response:
                    return response.read()
            assert json.loads(fetch('release.json'))['id'] == expected['id'], 'Release ID differs'
            for path in paths:
                assert hashlib.sha256(fetch(path)).hexdigest() == expected['files'][path], 'Deployed file differs: ' + path
            print('Verified deployed release', expected['id'], 'and', len(paths), 'files')
            return
        except Exception as error:
            print(f'Verification {attempt + 1}/{retries}: {error}')
            if attempt + 1 == retries:
                raise
            time.sleep(10)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='https://www.kanapet.com')
    parser.add_argument('--retries', type=int, default=1)
    args = parser.parse_args()
    verify(args.base_url, args.retries)
