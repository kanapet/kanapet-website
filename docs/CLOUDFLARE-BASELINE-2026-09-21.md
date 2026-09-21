# Cloudflare baseline and proposed settings — 2026-09-21

No Cloudflare dashboard settings were changed. This file is an implementation/review checklist only.

## In-code changes on the review branch

- Redirect production HTTP GET/HEAD requests to `https://www.kanapet.com`, preserving path and query.
- Redirect HTTPS apex GET/HEAD with `301`; use `308` for non-safe methods so request bodies are preserved.
- Reject insecure HTTP writes to `/api/inquiry` with JSON `400` instead of a body-dropping redirect.
- Never canonicalize preview, local or unknown hosts to production.
- Keep every inquiry API response `Cache-Control: no-store`.

## Dashboard checks requiring authorized access

1. Confirm both hostnames route through the same Worker and that no Page Rule/Redirect Rule conflicts with the code behavior.
2. Confirm `/api/inquiry*` bypasses edge caching for every method; do not cache POST responses.
3. Confirm `FEISHU_WEBHOOK_URL` and optional `FEISHU_SECRET` exist only as encrypted Worker secrets.
4. Review WAF/Bot rules for false blocking of ordinary search crawlers and OAI-SearchBot. Verify published crawler IP ranges against actual logs; never trust a spoofed User-Agent alone.
5. Save a before/after export or screenshots of relevant routes, cache and bot rules for drift review.
6. Evaluate security headers progressively. Do not enable strict CSP until inline handlers have been removed/tested. Do not enable HSTS `includeSubDomains` or preload until every subdomain is inventoried and HTTPS-ready.

## Acceptance checks after explicit launch approval

- HTTP apex and `www` return a single canonical redirect with path/query intact and no loop.
- HTTPS apex returns one redirect to HTTPS `www`; HTTPS `www` returns the expected page.
- HTTP POST `/api/inquiry` returns a clear HTTPS-required error; HTTPS `www` POST is not cached.
- Preview/local host requests remain on their original host.
- A separately authorized synthetic inquiry receives a request reference and reaches the intended sales channel once; timeout is reported as unknown rather than automatically retried.
