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

globalThis.fetch = originalFetch;
globalThis.setTimeout = originalSetTimeout;
globalThis.clearTimeout = originalClearTimeout;

console.log('Worker routing tests passed');
