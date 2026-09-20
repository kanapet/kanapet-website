// Cloudflare Worker for kanapet-website.
//
// Two jobs:
//   1. Serve the static site from public/ (via the ASSETS binding).
//   2. Proxy inquiry form submissions to the Feishu bot webhook so the
//      webhook URL and signing secret NEVER ship to browsers.
//      (main.js used to embed both in client-side JS — anyone could forge
//      inquiries; see the P0 in the 2026-09-20 site audit.)
//
// Required secrets (set with `wrangler secret put` or the dashboard,
// NEVER in this repo — it is public):
//   FEISHU_WEBHOOK_URL  e.g. https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
//   FEISHU_SECRET       only if the bot has "签名校验" enabled; optional.

const LIMITS = {
  name: 80,
  company: 120,
  email: 120,
  country: 80,
  product: 160,
  message: 2000
};

const MAX_BODY_BYTES = 8 * 1024; // a legit inquiry is well under this

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  // strip control chars, collapse excessive whitespace, cap length
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function feishuSign(timestamp, secret) {
  // Feishu custom-bot signature: HMAC-SHA256 over the empty string,
  // keyed with `${timestamp}\n${secret}`, then base64.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(timestamp + '\n' + secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new Uint8Array(0));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Best-effort flood control. Uses per-isolate memory, so it is not a hard
// guarantee across Cloudflare's edge fleet — enough to stop naive spam.
const hits = new Map();
function tooManyRequests(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

function shanghaiTime() {
  return new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
}

function escapeLarkMd(s) {
  return s.replace(/([\\`*_{}[\]()#+!~])/g, '\\$1');
}

async function handleInquiry(request, env) {
  if (request.method !== 'POST') {
    return jsonResp({ ok: false, error: 'Method not allowed' }, 405);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (tooManyRequests(ip)) {
    return jsonResp({ ok: false, error: 'Too many requests' }, 429);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResp({ ok: false, error: 'Unsupported content type' }, 415);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return jsonResp({ ok: false, error: 'Payload too large' }, 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResp({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const data = {
    name: clean(body.name, LIMITS.name),
    company: clean(body.company, LIMITS.company),
    email: clean(body.email, LIMITS.email),
    country: clean(body.country, LIMITS.country),
    product: clean(body.product, LIMITS.product),
    message: clean(body.message, LIMITS.message)
  };

  if (!data.name || !data.email || !data.country || !data.message) {
    return jsonResp({ ok: false, error: 'Missing required fields' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return jsonResp({ ok: false, error: 'Invalid email' }, 400);
  }

  const webhook = env.FEISHU_WEBHOOK_URL;
  if (!webhook || !/^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\//.test(webhook)) {
    // Server misconfigured — do not leak details to the caller.
    console.error('FEISHU_WEBHOOK_URL is missing or malformed');
    return jsonResp({ ok: false, error: 'Server configuration error' }, 500);
  }

  const card = {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: '🔔 新询盘 — Kanapet独立站' },
        template: 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content:
              `**👤 姓名：** ${escapeLarkMd(data.name)}\n` +
              `**🏢 公司：** ${escapeLarkMd(data.company || '-')}\n` +
              `**📧 邮箱：** ${escapeLarkMd(data.email)}\n` +
              `**🌍 国家：** ${escapeLarkMd(data.country)}\n` +
              `**📦 产品：** ${escapeLarkMd(data.product || '-')}\n` +
              `**💬 留言：** ${escapeLarkMd(data.message)}\n` +
              `**⏰ 时间：** ${shanghaiTime()}`
          }
        }
      ]
    }
  };

  if (env.FEISHU_SECRET) {
    const ts = Math.floor(Date.now() / 1000).toString();
    card.timestamp = ts;
    card.sign = await feishuSign(ts, env.FEISHU_SECRET);
  }

  try {
    const upstream = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    });
    const out = await upstream.json().catch(() => ({}));
    // Feishu v2 webhooks: { code: 0 } — legacy: { StatusCode: 0 }
    const accepted = upstream.ok &&
      (out.code === 0 || out.StatusCode === 0 || out.statusCode === 0);
    if (accepted) return jsonResp({ ok: true });
    console.error('Feishu rejected inquiry:', upstream.status, JSON.stringify(out));
    return jsonResp({ ok: false, error: 'Delivery failed' }, 502);
  } catch (err) {
    console.error('Upstream fetch failed:', err);
    return jsonResp({ ok: false, error: 'Delivery failed' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/inquiry') {
      return handleInquiry(request, env);
    }
    // Everything else: static assets (404s handled by the assets layer).
    return env.ASSETS.fetch(request);
  }
};
