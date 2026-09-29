#!/usr/bin/env python3
"""Normalize repeated keyboard and control semantics in static HTML."""
import argparse
import difflib
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
KEY_HANDLER = "if(event.key==='Enter'||(this.getAttribute('role')==='button'&&event.key===' ')){event.preventDefault();this.click();}"


def normalize(source):
    source = source.replace('style.css?v=15', 'style.css?v=16')
    source = source.replace('data.js?v=16', 'data.js?v=17')
    source = source.replace('main.js?v=18', 'main.js?v=19')
    source = re.sub(
        r'<button(?![^>]*\btype=)([^>]*)>',
        r'<button type="button"\1>',
        source,
        flags=re.I,
    )
    source = source.replace(
        '<div class="lightbox" id="lightbox" onclick="closeLightbox()">',
        '<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Product image preview" onclick="if(event.target===this) closeLightbox()">',
    )
    source = source.replace(
        '<span class="lightbox-close" onclick="closeLightbox()">&times;</span>',
        '<button type="button" class="lightbox-close" onclick="closeLightbox()" aria-label="Close image preview">&times;</button>',
    )

    pattern = re.compile(r'<(div|span|img)(\s+[^>]*\bonclick="[^"]*"[^>]*)>', re.I)

    def interactive(match):
        tag, attrs = match.groups()
        if re.search(r'\brole="dialog"', attrs, re.I):
            return match.group(0)
        role = 'link' if 'window.location.href' in attrs else 'button'
        additions = []
        if not re.search(r'\brole=', attrs, re.I):
            additions.append(f'role="{role}"')
        if not re.search(r'\btabindex=', attrs, re.I):
            additions.append('tabindex="0"')
        if not re.search(r'\bonkeydown=', attrs, re.I):
            additions.append(f'onkeydown="{KEY_HANDLER}"')
        if not additions:
            return match.group(0)
        return f'<{tag}{attrs} ' + ' '.join(additions) + '>'

    source = pattern.sub(interactive, source)
    return re.sub(r'[ \t]+>', '>', source)


def patch_for(path, old, new):
    rel = path.relative_to(ROOT).as_posix()
    diff = list(difflib.unified_diff(old.splitlines(keepends=True), new.splitlines(keepends=True), n=3))
    return '*** Update File: ' + rel + '\n' + ''.join(diff[2:])


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--patch', action='store_true')
    parser.add_argument('--start', type=int, default=0, help='first changed file to include')
    parser.add_argument('--limit', type=int, help='maximum changed files to include')
    args = parser.parse_args()
    changes = []
    for path in sorted(PUBLIC.rglob('*.html')):
        old = path.read_text(encoding='utf-8')
        new = normalize(old)
        if new != old:
            changes.append((path, old, new))
    selected = changes[args.start:args.start + args.limit if args.limit is not None else None]
    if args.patch:
        print('*** Begin Patch')
        for path, old, new in selected:
            print(patch_for(path, old, new), end='')
        print('*** End Patch')
    elif args.check:
        for path, _, _ in changes:
            print(path.relative_to(ROOT).as_posix())
        if changes:
            print(f'Accessibility normalization drift: {len(changes)} file(s)', file=sys.stderr)
            return 1
    else:
        for path, _, new in changes:
            path.write_text(new, encoding='utf-8')
            print(path.relative_to(ROOT).as_posix())
        print(f'Normalized {len(changes)} file(s)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
