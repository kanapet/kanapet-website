import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const env = {
  ASSETS: {
    fetch: async () => new Response('asset', { status: 200 })
  }
};

async function request(url, init = {}) {
  return worker.fetch(new Request(url, init), env);
}

let response = await request('http://kanapet.com/contact.html?from=old');
assert.equal(response.status, 301);
assert.equal(response.headers.get('location'), 'https://www.kanapet.com/contact.html?from=old');

for (const path of ['/insights', '/insights/index.html', '/insights/custom-pet-product-development-process', '/insights/custom-pet-product-development-process/index.html']) {
  const result = await request('https://www.kanapet.com' + path);
  assert.equal(result.status, 301);
  assert.equal(result.headers.get('location'), 'https://www.kanapet.com' + path.replace(/\/index\.html$/, '/').replace(/\/?$/, '/'));
}
const insightsAssets = [];
const insightsEnv = { ASSETS: { fetch: async req => { insightsAssets.push(new URL(req.url).pathname); return new Response('Insights'); } } };
response = await worker.fetch(new Request('https://www.kanapet.com/insights/custom-pet-product-development-process/'), insightsEnv);
assert.equal(response.status, 200);
assert.equal(insightsAssets[0], '/insights/custom-pet-product-development-process/index.html');

response = await request('http://www.kanapet.com/api/inquiry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}'
});
assert.equal(response.status, 400);
assert.deepEqual(await response.json(), { ok: false, error: 'HTTPS required' });

response = await request('https://kanapet.com/api/inquiry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}'
});
assert.equal(response.status, 308);
assert.equal(response.headers.get('location'), 'https://www.kanapet.com/api/inquiry');

response = await request('https://preview.example.workers.dev/contact.html');
assert.equal(response.status, 200);
assert.equal(await response.text(), 'asset');

response = await request('https://www.kanapet.com/product/bird-parrot-nest-old.html?from=legacy');
assert.equal(response.status, 301);
assert.equal(response.headers.get('location'), 'https://www.kanapet.com/product/bird-no-mess-parrot-feeder.html?from=legacy');

response = await request('https://www.kanapet.com/product.html?slug=bird-parrot-nest-old');
assert.equal(response.status, 301);
assert.equal(response.headers.get('location'), 'https://www.kanapet.com/product/bird-no-mess-parrot-feeder.html');

response = await request('https://www.kanapet.com/product/hamster-bite-guard.html?from=legacy');
assert.equal(response.status, 301);
assert.equal(response.headers.get('location'), 'https://www.kanapet.com/product/hamster-tube-anti-chew-ring.html?from=legacy');

response = await request('https://www.kanapet.com/product.html?slug=hamster-bite-guard');
assert.equal(response.status, 301);
assert.equal(response.headers.get('location'), 'https://www.kanapet.com/product/hamster-tube-anti-chew-ring.html');

response = await request('https://www.kanapet.com/api/inquiry');
assert.equal(response.status, 405);
assert.equal(response.headers.get('cache-control'), 'no-store');

const validInquiry = {
  name: 'Test Buyer',
  company: 'Test Company',
  email: 'buyer@example.com',
  country: 'US',
  product: 'Test Product',
  message: 'Please send specifications.'
};
const inquiryEnv = {
  ...env,
  FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-only'
};
const originalFetch = globalThis.fetch;

globalThis.fetch = async () => Response.json({ code: 0 });
response = await worker.fetch(new Request('https://www.kanapet.com/api/inquiry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(validInquiry)
}), inquiryEnv);
assert.equal(response.status, 200);
const accepted = await response.json();
assert.equal(accepted.ok, true);
assert.match(accepted.requestId, /^[0-9a-f-]{36}$/);
assert.equal(response.headers.get('x-request-id'), accepted.requestId);

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
globalThis.setTimeout = (callback) => {
  queueMicrotask(callback);
  return 1;
};
globalThis.clearTimeout = () => {};
globalThis.fetch = (_url, options) => new Promise((resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
});
response = await worker.fetch(new Request('https://www.kanapet.com/api/inquiry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(validInquiry)
}), inquiryEnv);
assert.equal(response.status, 504);
const timedOut = await response.json();
assert.equal(timedOut.error, 'Delivery status unknown');
assert.match(timedOut.requestId, /^[0-9a-f-]{36}$/);

for (const inquiryType of ['Wholesale', 'Private Label', 'OEM/ODM', 'Other']) {
  let delivered;
  globalThis.fetch = async (_url, options) => { delivered = JSON.parse(options.body); return Response.json({ code: 0 }); };
  const result = await worker.fetch(new Request('https://www.kanapet.com/api/inquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'test-' + inquiryType },
    body: JSON.stringify({ ...validInquiry, inquiryType })
  }), inquiryEnv);
  assert.equal(result.status, 200);
  assert.ok(delivered.card.elements[0].text.content.includes('**询盘类型：** ' + inquiryType));
}

globalThis.fetch = originalFetch;
globalThis.setTimeout = originalSetTimeout;
globalThis.clearTimeout = originalClearTimeout;

console.log('Worker routing tests passed');
