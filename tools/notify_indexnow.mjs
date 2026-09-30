#!/usr/bin/env node

// Notify IndexNow only about canonical HTML pages changed by a successful
// main-branch build. The verification key is intentionally public: IndexNow
// verifies ownership by fetching /<key>.txt from the site's root.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'https://www.kanapet.com';
const key = process.env.INDEXNOW_KEY;
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const base = process.env.INDEXNOW_BASE_SHA;
const head = process.env.GITHUB_SHA || 'HEAD';

function git(...argv) {
  return execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function canonicalFromFile(path, revision) {
  let html;
  if (revision) {
    try {
      html = git('show', `${revision}:${path}`);
    } catch {
      return null;
    }
  } else {
    const absolute = resolve(ROOT, path);
    if (!existsSync(absolute)) return null;
    html = readFileSync(absolute, 'utf8');
  }
  const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function changedHtmlPaths() {
  if (!base || /^0+$/.test(base)) {
    return git('ls-files', 'public').split('\n').filter(path => path.endsWith('.html'))
      .map(path => ({ path, revision: null }));
  }

  const rows = git('diff', '--name-status', base, head).split('\n').filter(Boolean);
  return rows.flatMap(row => {
    const fields = row.split('\t');
    const status = fields[0];
    if (status.startsWith('R') || status.startsWith('C')) {
      return [
        { path: fields[1], revision: base },
        { path: fields[2], revision: null }
      ];
    }
    return [{ path: fields[1], revision: status === 'D' ? base : null }];
  }).filter(({ path }) => path?.startsWith('public/') && path.endsWith('.html'));
}

const urls = [...new Set(changedHtmlPaths()
  .map(({ path, revision }) => canonicalFromFile(path, revision))
  .filter(url => url?.startsWith(`${SITE}/`)))]
  .sort();

if (!urls.length) {
  console.log('IndexNow: no canonical HTML URLs changed; nothing to submit.');
  process.exit(0);
}

if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) {
  throw new Error('INDEXNOW_KEY must be an 8-128 character alphanumeric/dash key.');
}

const keyLocation = `${SITE}/${key}.txt`;
const batches = Array.from({ length: Math.ceil(urls.length / 10_000) }, (_, index) =>
  urls.slice(index * 10_000, (index + 1) * 10_000)
);

console.log(`IndexNow: ${urls.length} canonical URL(s) in ${batches.length} batch(es).`);
if (dryRun) {
  console.log(urls.join('\n'));
  process.exit(0);
}

for (const urlList of batches) {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'www.kanapet.com', key, keyLocation, urlList })
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow rejected the batch: HTTP ${response.status} ${await response.text()}`);
  }
  console.log(`IndexNow accepted ${urlList.length} URL(s): HTTP ${response.status}.`);
}
