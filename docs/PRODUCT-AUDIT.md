# Kanapet product audit — Phase 1

## Purpose and scope

`tools/audit_products.py` checks the current static catalog without changing any
input file. It uses only the Python standard library (Python 3.10+). No network,
browser, credentials, generation, deployment or inquiry submission is involved.
The existing validator and CI remain unchanged in this phase.

Run from the repository root:

```sh
python -B tools/audit_products.py
python -B tools/audit_products.py --format json
python -B -m unittest discover -s tools -p test_audit_products.py
```

`--root PATH` audits another checkout or test fixture. Both output formats go to
stdout. The tool does not create reports itself. Exit 1 means at least one error;
exit 0 means no errors, but warnings may still require review. JSON output includes
pages checked, error/warning counts, file paths, HTML line numbers where available,
stable rule codes and messages. The UTF-8 output supports product names and units.

## Checks

- Data: JSON syntax and duplicate keys, nonempty product array, required identity
  fields, unique IDs/slugs, safe slugs, category membership, known/unknown fields,
  array and option structure, supported dimensions and positive numeric MOQ.
- Images: main/gallery/option/color image references, including nested color maps,
  exist within `public/`; page and JSON-LD product images belong to the product's
  declared image set. This deliberately allows color/material default images.
- Synchronization: embedded products AND categories agree with their JSON sources.
- Product HTML: exactly one H1, product name, visible SKU, main image, first primary
  specification table, known size/carton/weight/CBM/carton quantity/notes and MOQ.
- SEO: nonempty product-specific title/description, exact canonical, OG parity,
  product image, no unexpected noindex, current template size/MOQ statements.
- JSON-LD: strict JSON parsing, duplicate keys, supported schema.org context,
  exactly one Product, name/SKU/category/material/description/image/brand parity,
  optional URL parity, no unverified Offer/rating/review, breadcrumb hierarchy and
  product identity. Arrays and `@graph` containers are supported.
- Discovery: catalog card names/sizes/MOQs and one-card-per-listed-product coverage;
  sitemap canonical URLs/static files/product set; llms names/sizes/materials/MOQs
  and product coverage; orphan static product files.

## Severity and limits

These are checks of the **current Kanapet publication contract**, not a universal
HTML validator, full JSON-LD processor, search-engine rich-results certification,
or proof of real-world product specifications.

- Missing known specs, contradictory identifiers, invalid data and missing catalog
  coverage are errors. A zero height in a three-dimensional record is rejected;
  whether that record should instead describe a two-dimensional shelf needs human
  confirmation. The tool never invents a replacement height.
- Unknown facts, ambiguous MOQ units, conflicting carton fields, body material
  wording and unsupported dimension formats are review warnings. Material wording
  differences do not prove the materials are wrong. A claim absent from product
  data means the checker cannot substantiate it, not that it is necessarily false.
- When `meas` and `carton_size` conflict, the checker reports the source conflict
  and does not arbitrarily choose one as the expected page value.
- MOQ comparisons preserve quantity and conditions and allow adding a missing
  explicit unit (e.g. `50 per color` -> `50 pcs per color`). The separate source
  unit review remains visible; no carton-to-piece conversion is inferred.
- `Product.url` absence is a v1 completeness warning, not invalid JSON-LD.
  Offer absence is intentional and is not an error.
- With no explicit `sku`, the current uppercase-ID convention is checked. An
  explicit data `sku` takes precedence. Business ownership of SKU conventions
  still needs confirmation before making changes.
- Only legacy three-dimensional cm sizes are automatically compared including
  inch conversion. Two-dimensional and compound free-text sizes are reported as
  unverified coverage, not silently accepted as fully checked.
- Catalog coverage follows `renderProducts()`: dedicated accessories are excluded
  from the main catalog. Their detail pages, sitemap and llms entries are still
  checked. Other products require a separate card.
- Runtime DOM changes, keyboard/accessibility behavior, production redirects,
  real image contents, PDF/video contents and external claim evidence are outside
  this phase. Metadata phrasing checks follow the existing English template.

Regression tests create temporary fixture catalogs, deliberately corrupt individual
facts, and verify both detection and exit status. They also verify input-file hashes
remain unchanged by an audit. They do not edit actual catalog data.

## Baseline: branch fix/seo-geo-foundation-20260921, HEAD 199e345

All 70 product pages were checked. Result: **13 error occurrences and 313 warning
occurrences**. Occurrences overlap; these are not 326 distinct products or confirmed
business defects. The 29 regression tests passed.

### Errors

| Rule | Count | Finding |
| --- | ---: | --- |
| PAGE_SPEC | 7 | Existing carton dimensions are absent from the main specification table: bird-feeder-cup-no1, bird-feeder-cup-no3-white, bird-feeder-cup-no3-transparent-hook, bird-feeder-cup-no4, bird-feeder-cup-no10, bird-feeding-cup-spring-door, bird-feeder-cup-anti-spill. |
| PAGE_SKU + LD_FACT | 4 | Two products disagree with their explicit data SKU in both visible HTML and JSON-LD. bird-parrot-nest: data PARROT-NEST-S versus page BIRD-PARROT-NEST-SMALL; bird-parrot-nest-large: data PARROT-NEST-L versus page BIRD-PARROT-NEST-LARGE. |
| DATA_SIZE_REVIEW | 1 | hamster-shelf-62 has size `{w:44,d:22,h:0}`; clarify whether height is unknown or the measurement should be two-dimensional. |
| CATALOG_COVERAGE | 1 | bird-space-bathroom-grate has data and a detail page but no product card in the static catalog. |

### Review warnings

| Rule | Count | Finding |
| --- | ---: | --- |
| PAGE_MATERIAL_REVIEW | 70 | Materials paragraphs differ from product-data material strings; assess semantic differences and generic template claims. |
| PAGE_CLAIM_REVIEW | 41 | food-grade claims are present without corresponding supporting product-data content. |
| DATA_MOQ_REVIEW | 37 | carton-unit records need review against their quantity and written conditions. |
| DATA_MOQ_UNIT | 7 | MOQ unit field missing. |
| DATA_CARTON_CONFLICT | 3 | meas/carton_size disagree for bird-parrot-nest-large, bird-perch-stick and bird-breeding-box. |
| DATA_UNKNOWN | 12 | Empty size/material/notes fields, counted per field. |
| DATA_SIZE_REVIEW | 4 | Three two-dimensional pipe sizes and the compound hamster-shelf-43 size need explicit formatting rules. |
| OUTPUT_MOQ_UNIT | 69 | llms entries lack an explicit MOQ unit; includes `50 per color` in addition to bare quantities. |
| LD_URL_MISSING | 70 | Product.url absent; canonical and breadcrumb product URLs are checked separately. |

The current data.js synchronization, product file availability, sitemap checks,
JSON-LD parsing and checked canonical/OG rules produced no additional errors.
No product page, business data, asset, Worker or CI workflow was changed to produce
this baseline. Resolving findings is a separate phase after review.

## Follow-up: confirmed fact synchronization (local, not deployed)

- Added the seven existing `carton_size` values to their static spec tables.
- Updated the two explicit SKU values in visible HTML and Product JSON-LD.
- Updated the legacy browser renderer to fall back to `carton_size` when `meas`
  is absent, and honor explicit SKU values in visible HTML and both existing
  Product schema outputs. Conflicting nonempty carton fields keep existing
  behavior pending business review; this change does not resolve those conflicts.
- Corrected the initial catalog coverage false positive: bird-space-bathroom-grate
  is a dedicated accessory intentionally excluded by the existing frontend.
  No catalog card was added and no product classification was changed.

Current result after product-owner confirmation: **70 pages checked, 0 errors and
313 warnings**. The hamster-shelf-62 height was confirmed as 1.44 cm and synchronized
to products.json, data.js, its product page and same-series comparison tables, the
catalog and llms.txt. Its derived imperial height is 0.6 in. The initial 13 errors
comprise 11 corrected output findings, 1 corrected audit false positive, and this
now-confirmed source-data correction.

Validation: 30 audit regression tests passed; `node tools/test_product_render.mjs`
passed real-renderer checks for explicit/fallback SKU, carton alias fallback,
legacy conflict precedence and unknown carton dimensions. JavaScript syntax
checks passed. These tests do not constitute a browser visual or production test.
Product JSON data, data.js, URL structure, sitemap, llms and deployment settings
remain unchanged. No commit or push was performed.
