"""Capture production baseline; block review when baseline or change scope drifts."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parents[1]
LIVE = 'https://www.kanapet.com'

def baseline():
    def read(path):
        with urlopen(Request(LIVE + path, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20) as response:
            return json.load(response)
    return {'release': read('/release.json')['id'], 'covers': read('/api/media/covers')['covers']}

def check(expected, actual, changed, allowed):
    if expected != actual:
        raise ValueError('Production release or published covers changed; refresh baseline and review again')
    extra = set(changed) - set(allowed)
    if extra:
        raise ValueError('Changes outside approved scope: ' + ', '.join(sorted(extra)))

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['capture', 'check'])
    p.add_argument('--state', required=True, type=Path, help='Local baseline file outside public/')
    p.add_argument('--git', default='git')
    p.add_argument('--allow', action='append', default=[], help='Exact reviewed path, repeat per file')
    args = p.parse_args()
    if args.state.resolve().is_relative_to(ROOT):
        p.error('Keep baseline outside the public repository')
    current = baseline()
    if args.action == 'capture':
        if args.state.exists():
            p.error('Baseline already exists; choose a new task filename')
        args.state.write_text(json.dumps(current, indent=2) + '\n')
        print('Captured production release and published covers')
    else:
        def git(*parts):
            return subprocess.check_output([args.git, *parts], cwd=ROOT, text=True).strip()
        if git('rev-parse', 'HEAD') != git('rev-parse', 'origin/main'):
            raise SystemExit('HEAD differs from origin/main; reconcile before review')
        changed = git('diff', '--name-only', 'origin/main').splitlines()
        changed += git('ls-files', '--others', '--exclude-standard').splitlines()
        check(json.loads(args.state.read_text()), current, changed, args.allow)
        print('PASS: production baseline unchanged; all changed files explicitly allowed')
