"""Production deployment is only allowed from Cloudflare's Git build."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
if not os.environ.get('WORKERS_CI_COMMIT_SHA'):
    sys.exit('Direct local production deployment is disabled. Commit and push main; Cloudflare Git Builds publishes it.')
branch = os.environ.get('WORKERS_CI_BRANCH', '')
if branch != 'main':
    sys.exit('Only the main branch can publish production.')
subprocess.run([sys.executable, 'tools/check_confirmed_products.py'], cwd=ROOT, check=True)
subprocess.run(['npx', '--yes', 'wrangler', 'deploy'], cwd=ROOT, check=True)
subprocess.run([sys.executable, 'tools/verify_release.py', '--retries', '6'], cwd=ROOT, check=True)
