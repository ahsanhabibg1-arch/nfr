# Batch 22 §6 — Media & Image Performance Assessment

**No code change.** No reliable production-like LCP/CLS measurement is available locally, so this records a static feasibility assessment + a benchmark plan — no performance gains are claimed or invented.

## Current media rendering
- Managed media is served through the **gated proxy** `app/api/media/[...key]/route.ts` (visibility-checked; private assets require `media.view`; `Cache-Control` public vs `private, no-store`).
- Components (`ImageWithCredit`, editorial media) render `<img>` with the proxy path. They do **not** use `next/image`.
- Public media URL contract: `publicUrl` returns the proxy path (not a direct bucket URL) so drafts aren't exposed. **Must not change** (SEO + security depend on it).

## `next/image` feasibility
| Factor | Finding |
|--------|---------|
| Benefit | Responsive `srcset`/`sizes`, lazy-loading, and width/height reserving space → potential LCP/CLS gains. |
| Loader | Next's default optimizer would need to fetch via the gated proxy; a **custom loader** (or `unoptimized`) is required so authorization + the URL contract are preserved. |
| Dimensions | Many images need intrinsic width/height (or `fill` + sized container) to avoid layout shift; `MediaAsset` stores dimensions for managed uploads (usable). |
| Config | `images` config in `next.config.mjs` (remotePatterns/loader) required. |
| Risk | A blind switch risks broken images, auth bypass, or CLS regressions. **Not low-risk without measurement.** |

**Decision:** deferred to a dedicated, measured batch. Not switched.

## Benchmark plan (for the future batch)
1. On staging, capture baseline **LCP, CLS, TTFB** (Lighthouse / WebPageTest / field CrUX) for: homepage, article detail, rodeo edition, competitor/venue directory.
2. Prototype `next/image` with a **custom loader** that targets the gated proxy on **one** template (article detail hero); keep the proxy URL contract.
3. Re-measure; accept only if LCP/CLS improve with no auth/URL regression and no static/ISR→dynamic change.
4. Roll out per-template, re-measuring each.

## Low-hanging, already in place
- Fonts: `preconnect` + `display=swap`.
- Loading skeletons (Batch 18/19) reserve space + enable Suspense streaming.
- ISR/static caching correct; media proxy sets long immutable cache for public assets.

## Constraints honored
No public media URL change; no new external image service; no blind conversion; no invented metrics.
