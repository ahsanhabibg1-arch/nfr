# Technical SEO Audit (Batch 06 §8)

> Audience: engineers. What the technical analyzer checks, and the boundary
> between static/DB analysis and HTTP-verified analysis.

## Analysis mode (critical distinction)

This batch's technical checks are **database/static analysis** of the CMS data
and the deterministic rules that drive Next.js metadata/sitemap/robots/redirects.
They are **not** HTTP-verified crawls. The engine performs **no network
requests** — there is therefore **no SSRF surface** (no URL fetching, no
external crawling, no allowlist needed because nothing is fetched).

Separately, the project's HTTP behavior (status codes, canonical tags, redirects,
sitemap/robots content, admin gating, draft privacy, media delivery) is verified
by the real-request smoke suites: `scripts/route-smoke.mts`,
`scripts/admin-auth-smoke.mts`, `scripts/cache-invalidation.mts`,
`scripts/media-http-check.mts`. Those are HTTP-verified; the SEO engine's own
findings are labelled as static analysis.

## Checks (static/DB)

- **Canonical** — published article has a canonical URL (`TECH_NO_CANONICAL`),
  and it matches the computed canonical path (`TECH_CANONICAL_MISMATCH`).
- **Indexability** — published article's robots directive is not `noindex`
  (`TECH_PUBLISHED_NOINDEX`); draft/private articles are not public by the CMS
  design, so "draft exposed publicly" is prevented upstream and additionally
  surfaced via image privacy (`IMG_PRIVATE_ON_PUBLISHED`).
- **Sitemap eligibility** — a published, indexable article is present in the
  computed sitemap inventory (`TECH_SITEMAP_EXCLUDED`).
- **Redirects** — loops/chains (`TECH_REDIRECT_LOOP`) and targets that don't
  resolve to a known route/published article (`TECH_REDIRECT_TARGET_UNKNOWN`),
  read from the `ArticleRedirect` registry (mirrors `next.config.mjs`).
- **Trailing slash / route identity** — canonical paths are normalized with the
  site's `trailingSlash: true` policy when resolving link/redirect targets.

## Not performed in this batch (documented)

- Live HTTP status of every internal URL (covered by the smoke suites for the
  key routes, not exhaustively per-URL).
- Google rich-result eligibility (Schema.org structural validity ≠ rich results;
  we never promise rankings or rich results).
- External backlink / crawl analysis (out of scope; no external crawling).
