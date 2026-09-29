#!/usr/bin/env python3
"""Static accessibility checks for the generated HTML site."""
import argparse
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import sys


INTERACTIVE = {'a', 'button', 'input', 'select', 'textarea', 'summary'}


class Node:
    def __init__(self, tag, attrs, line, parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.line = line
        self.parent = parent
        self.children = []

    def text(self):
        return ''.join(child.text() if isinstance(child, Node) else child for child in self.children)


class Document(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.root = Node('', [], 1)
        self.stack = [self.root]
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.getpos()[0], self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def nodes(root):
    for child in root.children:
        if isinstance(child, Node):
            yield child
            yield from nodes(child)


def audit(path):
    source = path.read_text(encoding='utf-8')
    doc = Document(source)
    all_nodes = list(nodes(doc.root))
    issues = []

    def issue(code, node, message, severity='error'):
        issues.append({
            'severity': severity,
            'code': code,
            'file': path.as_posix(),
            'line': node.line,
            'message': message,
        })

    html = next((node for node in all_nodes if node.tag == 'html'), None)
    if html and not html.attrs.get('lang', '').strip():
        issue('HTML_LANG', html, 'html element needs a language')

    ids = Counter(node.attrs.get('id') for node in all_nodes if node.attrs.get('id'))
    for value, count in ids.items():
        if count > 1:
            node = next(node for node in all_nodes if node.attrs.get('id') == value)
            issue('DUPLICATE_ID', node, f'id {value!r} appears {count} times')

    labels = {node.attrs.get('for') for node in all_nodes if node.tag == 'label' and node.attrs.get('for')}
    for node in all_nodes:
        attrs = node.attrs
        if node.tag == 'img' and ('alt' not in attrs or not attrs.get('alt', '').strip()):
            issue('IMAGE_ALT', node, 'image needs non-empty alt text')
        if node.tag in {'input', 'select', 'textarea'} and attrs.get('type', '').lower() != 'hidden':
            control_id = attrs.get('id')
            wrapped = any(parent.tag == 'label' for parent in ancestors(node))
            if not attrs.get('aria-label') and not attrs.get('aria-labelledby') and not wrapped and control_id not in labels:
                issue('FORM_LABEL', node, f'{node.tag} needs an associated label')
        if node.tag == 'button':
            name = ' '.join(node.text().split())
            if not name and not attrs.get('aria-label') and not attrs.get('aria-labelledby') and not attrs.get('title'):
                issue('BUTTON_NAME', node, 'button needs an accessible name')
            if 'type' not in attrs:
                issue('BUTTON_TYPE', node, 'button needs an explicit type', 'warning')
        if 'onclick' in attrs and node.tag not in INTERACTIVE and attrs.get('role') != 'dialog':
            if attrs.get('role') not in {'button', 'link'} or attrs.get('tabindex') != '0' or not attrs.get('onkeydown'):
                issue('NON_KEYBOARD_CLICK', node, f'clickable {node.tag} is not keyboard-operable')
        if node.tag == 'a' and attrs.get('target') == '_blank':
            rel = set(attrs.get('rel', '').split())
            if 'noopener' not in rel:
                issue('BLANK_REL', node, 'target=_blank link needs rel=noopener')
        if 'tabindex' in attrs:
            try:
                if int(attrs['tabindex']) > 0:
                    issue('TAB_ORDER', node, 'positive tabindex overrides document order')
            except ValueError:
                issue('TABINDEX', node, 'tabindex must be an integer')
    return issues


def ancestors(node):
    parent = node.parent
    while parent:
        yield parent
        parent = parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    issues = []
    for path in sorted((root / 'public').rglob('*.html')):
        for item in audit(path):
            item['file'] = path.relative_to(root).as_posix()
            issues.append(item)
    counts = Counter(item['severity'] for item in issues)
    for item in issues:
        print(f"{item['severity'].upper()} {item['code']} {item['file']}:{item['line']} {item['message']}")
    print(f"Checked HTML files: {len(list((root / 'public').rglob('*.html')))} | errors: {counts['error']} | warnings: {counts['warning']}")
    return 1 if counts['error'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
