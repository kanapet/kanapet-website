"""Wrangler build hook: block local production uploads and validate Git builds."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
if os.environ.get('WORKERS_CI_BRANCH') != 'main' or not os.environ.get('WORKERS_CI_COMMIT_SHA'):
    sys.exit('Production uploads must originate from the main branch in Cloudflare Git Builds. Use tools/build_release.py for local previews; push main to publish.')
for script, args in [
    ('build_release.py', []),
    ('check_confirmed_products.py', []),
    ('validate_data.py', []),
    ('audit_products.py', []),
    ('audit_accessibility.py', []),
]:
    subprocess.run([sys.executable, 'tools/' + script, *args], cwd=ROOT, check=True)
for script in ['test_product_render.mjs', 'test_worker.mjs', 'smoke_site.mjs']:
    subprocess.run(['node', 'tools/' + script], cwd=ROOT, check=True)
