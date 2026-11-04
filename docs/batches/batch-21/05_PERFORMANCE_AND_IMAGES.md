# Batch 21 §E — Performance & Image Optimization

**Method:** static code inspection + production build output. **No code change** — nothing met the "measured, low-risk, evidence-backed" bar, and no production-like measurement environment is available (findings below are static, clearly distinguished from measured results).

## Rendering / caching (verified correct)
| Surface | Strategy |
|---------|----------|
| Legal pages | `force-static` |
| Homepage, article, category | ISR `revalidate=60` (+ `generateStaticParams` for article/category) |
| Competitor/venue/discipline/rodeo | ISR `revalidate=300` + `generateStaticParams` + `dynamicParams` |
| Public layout (search index/nav) | `revalidate=300` |
| Schedule/results/standings, search | dynamic (`ƒ`) — always fresh |
| Admin / API | dynamic + `no-store` |
Build: **57/57 static pages**. Static/private split is correct; **no unpublished content is cacheable** (public services filter to published/verified at query time; admin/API `no-store`).

## Query efficiency
- No N+1: no `for…await prisma` / `map(async…)` in `lib/cms` or `lib/content.ts`; relations via single-query `include`/`select`.
- Directory listings bounded-paginated; FTS via generated `searchVector` + GIN (single indexed query).

## Image rendering (static finding — not changed)
- `components/ImageWithCredit` and editorial media render managed media (served via the gated `/api/media/[...key]` proxy). They do **not** currently use `next/image`.
- Converting to `next/image` could improve LCP/CLS (responsive `sizes`, lazy-loading, width/height to reserve space) **but** is **not a low-risk drop-in**: it needs intrinsic dimensions, a loader compatible with the gated proxy (or `unoptimized`), and `images` config in `next.config.mjs`. Doing it blind risks broken images / layout shifts.
- **Decision:** deferred to a dedicated, measured batch. Documented, not applied.

## LCP / CLS observations (static)
- Fonts: `preconnect` + `display=swap` in the root layout (good).
- Loading skeletons (Batch 18/19) reserve space and enable Suspense streaming on heavy pages — a future low-risk win now unblocked.
- No obvious render-blocking third-party scripts (first-party only).

## Conclusion
Performance posture is already sound for launch. The one real improvement (`next/image`) requires measurement + config and is deferred with a plan. No URL structure changed; no caching change; no new image service.
