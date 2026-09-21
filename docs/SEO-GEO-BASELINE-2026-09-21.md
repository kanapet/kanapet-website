# SEO / GEO baseline — 2026-09-21

This baseline separates observable public behavior from account-only data.

## Public technical checks

- All 76 sitemap URLs were previously confirmed reachable; the repository validator now resolves all 70 canonical `/product/<slug>.html` entries and verifies their files.
- Live checks on 2026-09-21 found HTTP and HTTPS, apex and `www`, all serving content directly. The current branch adds canonical redirects, but they are not live until approved and merged.
- `/api/inquiry` returns `405` to GET and `Cache-Control: no-store`. No real inquiry was submitted.
- `robots.txt` allows ordinary crawlers, OAI-SearchBot, GPTBot, ChatGPT-User and other named AI crawlers. Cloudflare logs/rules were not available, so real bot requests and IP verification are not confirmed.

## Search account status

- Google Search Console: ownership, sitemap submission, indexing coverage and performance data not accessible in this environment.
- Bing Webmaster Tools: ownership, sitemap submission and performance data not accessible in this environment.
- Accessing public URLs successfully does not establish that they are indexed.

When access is connected, save the first baseline for indexed/excluded URLs, exclusion reasons, queries, impressions, clicks, CTR and countries. Never request or store account passwords in the repository.

## Discovery snapshot

Public web-search samples were run for:

1. `Kanapet pet cage manufacturer`
2. `transparent hamster cage manufacturer OEM China`
3. `wholesale bird cages OEM manufacturer China`
4. `small pet cage supplier Kanapet`

The site was not present in the returned result set. This is one provider/session snapshot, not a ranking claim and not a substitute for Google/Bing account data or a fixed-platform AI answer test.

For future monthly GEO tests record platform, date, language, region, session state, exact question, brand mention, actual official-site citation, landing page and factual accuracy. Relate results to verified referral traffic and qualified inquiries; do not classify all direct traffic as AI.

## Structured-data decision pending

The original product pages included `Offer` objects without a genuine price and made availability/tax assertions that have not been confirmed. This review branch removes those objects rather than inventing `0`/`1` prices, reviews, ratings, availability or tax handling. The business must choose whether it can publish a genuine price/range and confirm availability/tax semantics before Offer markup returns. Until then, treat rich-result eligibility separately from crawl/index eligibility.

## Current official guidance used

- Google Product snippet structured data: https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- Google generative AI search guidance: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- OpenAI crawler controls: https://developers.openai.com/api/docs/bots

Google's current guidance says there is no special GEO schema requirement and recommends normal technical SEO, useful original content and Search Console measurement. OpenAI documents OAI-SearchBot (search) and GPTBot (training) as independent controls; the business should decide training permission separately from search visibility.
