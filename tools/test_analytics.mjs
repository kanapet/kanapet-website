import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handleEvent, recordEvent } from '../worker/analytics.js';
const points = [];
const env = { SITE_EVENTS: { writeDataPoint: p => points.push(p) } };
const send = (data, headers = {}, method = 'POST') => handleEvent(new Request('https://www.kanapet.com/api/events', { method, headers: { Origin: 'https://www.kanapet.com', 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: typeof data === 'string' ? data : JSON.stringify(data) } : {}) }), env);
const event = { event: 'whatsapp_click', group: 'bird_cages', source: 'google', email: 'private@example.test' };
assert.equal((await send(event)).status, 204);
assert.deepEqual(points[0], { indexes: ['site'], blobs: ['whatsapp_click', 'bird_cages', 'google'], doubles: [1] });
for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }]) assert.equal((await send(event, headers)).status, 204);
assert.equal(points.length, 1);
assert.equal((await send(event, { Origin: 'https://evil.example' })).status, 403);
assert.equal((await send({ ...event, event: 'inquiry_accepted' })).status, 400);
assert.equal((await send({ ...event, group: 'private@example.test' })).status, 400);
assert.equal((await send('x'.repeat(1025))).status, 413);
assert.equal((await send('null')).status, 400);
assert.equal((await send('', {}, 'GET')).status, 405);
assert.doesNotThrow(() => recordEvent({ SITE_EVENTS: { writeDataPoint() { throw Error(); } } }, 'inquiry_accepted', 'contact', 'direct'));
const calls = [];
const storage = new Map();
const context = vm.createContext({ URL, URLSearchParams, console,
 navigator: {}, sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) },
 window: { location: { hostname: 'www.kanapet.com', pathname: '/bird-cages.html' } },
 document: { referrer: 'https://www.google.com/search?q=private', addEventListener() {} },
 fetch: (url, init) => { calls.push(JSON.parse(init.body)); return Promise.resolve({}); }
});
vm.runInContext(readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8'), context);
vm.runInContext("trackSiteEvent('page_view')", context);
assert.deepEqual(calls[0], { event: 'page_view', group: 'bird_cages', source: 'google' });
context.document.referrer = 'https://www.kanapet.com/bird-cages.html';
context.window.location.pathname = '/contact.html';
vm.runInContext("trackSiteEvent('email_click')", context);
assert.equal(calls[1].source, 'google');
context.navigator.doNotTrack = '1';
vm.runInContext("trackSiteEvent('page_view')", context);
assert.equal(calls.length, 2);
console.log('Analytics validation, privacy, attribution and failure-isolation checks passed.');
// Only a confirmed upstream acceptance produces the server conversion event.
const { default: worker } = await import('../worker/index.js');
const originalFetch = globalThis.fetch;
const inquiry = { name: 'Test', email: 'test@example.test', country: 'Test', message: 'Local fixture only' };
const serverEnv = { ...env, FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/local-fixture' };
try {
  for (const [id, upstreamCode, privacy, expected] of [['ok',0,'on',1], ['failed',1,'on',0], ['private',0,'off',0]]) {
    globalThis.fetch = async () => Response.json({ code: upstreamCode });
    const before = points.length;
    await worker.fetch(new Request('https://www.kanapet.com/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': 'local-'+id, 'X-Site-Source': 'google', 'X-Site-Privacy': privacy }, body: JSON.stringify(inquiry) }), serverEnv);
    assert.equal(points.length-before, expected);
    if (expected) assert.deepEqual(points.at(-1).blobs, ['inquiry_accepted','contact','google']);
  }
} finally { globalThis.fetch = originalFetch; }
console.log('Server acceptance, failure and privacy checks passed; no external inquiry sent.');
