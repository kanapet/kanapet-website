#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';


const ROOT = resolve(new URL('../public', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'));
const SITE = 'https://www.kanapet.com';
const argIndex = process.argv.indexOf('--base-url');
const externalBase = argIndex >= 0 ? process.argv[argIndex + 1] : null;

if (argIndex >= 0 && !externalBase) {
  throw new Error('--base-url requires a URL');
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

function localServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const target = resolve(ROOT, '.' + pathname.replaceAll('/', sep));
      if (target !== ROOT && !target.startsWith(ROOT + sep)) {
        response.writeHead(400).end('Bad path');
        return;
      }
      const info = await stat(target);
      if (!info.isFile()) throw new Error('not a file');
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': types[extname(target).toLowerCase()] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

function canonicalFrom(html) {
  return html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] || '';
}

async function run(baseUrl) {
  const products = JSON.parse(await readFile(resolve(ROOT, 'data/products.json'), 'utf8'));
  assert.equal(products.length, 70, 'expected 70 products');
  assert.equal(new Set(products.map(product => product.slug)).size, 70, 'product slugs must be unique');

  const sitemap = await readFile(resolve(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.ok(urls.length >= 75, 'sitemap unexpectedly small');
  const productUrls = urls.filter(url => url.includes('/product/'));
  assert.equal(productUrls.length, products.length, 'sitemap product count differs from product data');

  const failures = [];
  const paths = [...new Set([
    ...urls.map(value => new URL(value).pathname),
    '/data/products.json',
    '/js/data.js',
    '/js/main.js',
    '/css/style.css',
    '/llms.txt'
  ])];

  for (let index = 0; index < paths.length; index += 10) {
    const batch = paths.slice(index, index + 10);
    await Promise.all(batch.map(async pathname => {
      try {
        const response = await fetch(new URL(pathname, baseUrl), { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (pathname.endsWith('.html') || pathname === '/') {
          const html = await response.text();
          if (!/<title>.+<\/title>/is.test(html)) throw new Error('missing title');
          if (/name="robots"[^>]+(?:noindex|none)/i.test(html)) throw new Error('page is noindex');
          const canonical = canonicalFrom(html);
          if (!canonical.startsWith(SITE + '/')) throw new Error('missing/invalid canonical');
          if (pathname.startsWith('/product/')) {
            if (!/<h1>.+<\/h1>/is.test(html)) throw new Error('missing product h1');
            const schemaText = html.match(/<script[^>]+id="product-jsonld"[^>]*>(.*?)<\/script>/is)?.[1];
            if (!schemaText) throw new Error('missing Product JSON-LD');
            const schema = JSON.parse(schemaText);
            if (schema['@type'] !== 'Product' || schema.url !== canonical) throw new Error('Product JSON-LD differs from canonical');
          }
        }
      } catch (error) {
        failures.push(`${pathname}: ${error.message}`);
      }
    }));
  }

  for (const product of products) {
    try {
      await stat(resolve(ROOT, product.image));
    } catch {
      failures.push(`${product.slug}: missing main image ${product.image}`);
    }
  }

  if (failures.length) {
    throw new Error(`Smoke failures (${failures.length}):\n${failures.join('\n')}`);
  }
  console.log(`Smoke checks passed: ${paths.length} URLs, ${products.length} products`);
}


let server;
try {
  let baseUrl = externalBase;
  if (!baseUrl) {
    server = localServer();
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  }
  await run(baseUrl);
} finally {
  if (server) await new Promise(resolveClose => server.close(resolveClose));
}
