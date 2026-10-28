# NFRGuide.com — Data Migration / Seed Report (Phase 1 / Batch 02)

Seed script: [apps/web/prisma/seed.ts](apps/web/prisma/seed.ts) (run via `npm run db:seed`).

## Source → target mapping

| Phase 0 source (typed demo data) | Target table(s) |
|---|---|
| `PRIMARY_SECTIONS` (config) | `Category` (5 rows) |
| `AUTHORS` + each article byline | `Author` |
| `SEVEN_DISCIPLINES` | `Discipline` (core columns + rich `guide` JSON) |
| `RODEO_HUBS` | `RodeoHub` |
| `RECURRING_RODEO_EVENTS` (+ `currentEdition`) | `RodeoEvent` + `RodeoEventEdition` |
| `MEDIA_ASSETS` | `MediaAsset` (+ `ArticleMedia` hero links) |
| `ADMIN_SOURCES` + `article.sources` | `Source` + `ArticleSource` |
| `ALL_ARTICLES` | `Article` + `ArticleBlock` + `ArticleSeo` + `ArticleTag`/`Tag` + junctions + `ArticleRelation` |
| 12 SEO groups | `SeoRule` (foundation) |
| 5 editorial roles / sample permissions | `Role` / `Permission` (foundation) |
| 5 legacy redirects | `ArticleRedirect` (mirrors `next.config.mjs`) |

## Idempotency strategy (§7)
- Every entity is **upserted by a stable key** (demo ids / slugs), so re-running
  the seed does not duplicate records.
- Each article's child rows (blocks, tags, sources, media, rodeo junctions) are
  **deleted and rebuilt** per run; `ArticleSeo` is upserted; `ArticleRelation` is
  reset per source article.
- Demo content uses deterministic ids (`art-*`, `disc-*`, `hub-*`, …). Editor-created
  content in a shared environment uses different ids and is **not** touched.

## Content integrity (§7 / §14)
- No real NFR results, schedules, standings, dates, prices or athlete statistics are
  fabricated — only the clearly-marked Phase 0 demonstration editorial content is
  persisted. `publishedAt` values are synthetic (deterministic ordering: array order
  = newest first) so homepage "latest" feeds are stable.
- Image paths are rewritten from the Vite `/src/assets/images/...` form to the Next
  `/assets/images/...` public path.
- Rodeo relationships are linked **defensively**: an article is linked to a
  discipline/hub only when the referenced entity exists in the seeded set, preserving
  referential integrity.

## Execution status

> **PENDING LIVE DATABASE.** The seed compiles and type-checks, and the initial
> migration SQL is generated and committed. Applying the migration and running the
> seed require a `DATABASE_URL` that the agent was not permitted to guess. Run
> `npm run db:setup` once credentials are provided (see DATABASE_SETUP.md). The seed
> prints a per-table count summary on success.

Expected seed volume (from the Phase 0 catalog): 5 categories, 7 disciplines, 11
published articles (+ their blocks/SEO/tags/sources), 3 rodeo hubs, 3 recurring
events + editions, media assets, 12 SEO rules, 5 roles, 5 redirects.
