// Aggregate events only: no form fields, full URLs, IPs or visitor IDs.
export const GROUPS = new Set(['home', 'bird_cages', 'hamster_cages', 'product', 'contact', 'other']);
export const SOURCES = new Set(['google', 'bing', 'chatgpt', 'perplexity', 'facebook', 'other_external', 'direct', 'internal']);
export function recordEvent(env, event, group, source) {
  if (!env.SITE_EVENTS) return;
  try {
    env.SITE_EVENTS.writeDataPoint({ indexes: ['site'], blobs: [event, GROUPS.has(group) ? group : 'other', SOURCES.has(source) ? source : 'direct'], doubles: [1] });
  } catch { /* Analytics must never interrupt inquiries. */ }
}
export async function handleEvent(request, env) {
  const reply = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return reply(405);
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || request.headers.get('Origin') !== url.origin) return reply(403);
  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return reply(204);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(415);
  // Bound actual streamed bytes, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return reply(400);
  let bytes = new Uint8Array(0);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (bytes.length + value.length > 1024) { await reader.cancel(); return reply(413); }
    const next = new Uint8Array(bytes.length + value.length); next.set(bytes); next.set(value, bytes.length); bytes = next;
  }
  let event;
  try { event = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400); }
  if (!event || !['page_view', 'whatsapp_click', 'email_click'].includes(event.event) || !GROUPS.has(event.group) || !SOURCES.has(event.source)) return reply(400);
  if (!env.SITE_EVENTS) return reply(503);
  recordEvent(env, event.event, event.group, event.source);
  return reply(204);
}
