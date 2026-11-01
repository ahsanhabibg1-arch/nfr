# Phase 1 / Batch 11 — Editorial Landing-Page SEO & FAQ Management

**Branch:** `batch-01-nextjs-migration` · **Date:** 2026-11-01 · Builds on Batch 10 (`823376a`).

Adds editable SEO + entity-specific FAQs + editorial intros to all five landing-page entity
types (rodeo hubs, events, editions, disciplines, categories), with a real admin CMS,
accessible public FAQ accordions, and conditional `FAQPage` JSON-LD — all additive and
preserving Batch 10 behavior + full-text search.

> **Important context:** this batch was partly implemented in a prior session by another
> assistant whose commit (`e6f8a01`) left defects. This report reflects the corrected,
> verified state.

## A. Defects found in the prior partial work — and fixed

1. **Dev database had been reset** (0 articles/hubs/events/media) — violating "do not reset dev
   databases" and causing public pages to 404 and the media check to fail. **Restored** by
   re-running the idempotent seed + `scripts/seed-rodeo-links.mts` (11 articles, 7 disciplines,
   5 categories, 3 hubs/events, hub↔event links). The **test** DB was untouched.
2. **Non-functional admin stub** — `AdminLandingSeoPage` was a 13-line placeholder with no
   route. **Replaced** with a real, gated `/admin/landing-seo/` manager (entity picker + SEO
   form + FAQ CRUD/reorder/enable + discipline-field editor).
3. **Authorization bug** in `landing-seo-actions.ts` — every action hardcoded
   `requireActor('rodeo.manage')`, mis-gating **category** SEO/FAQ (which needs
   `taxonomy.manage`). **Fixed:** actions authenticate only; the services enforce the correct
   per-entity permission.
4. **No Batch 11 tests** existed. **Added** `landing-unit.test.ts` (4) + `landing.test.ts` (4).
5. **Latent seed crash** — `analyticsSeed` imported the `server-only` providers module, so
   `prisma db seed` crashed under `tsx`. **Fixed** by inlining the provider list (honoring the
   file's own "no server-only" contract); `prisma db seed` now works.

## B. Architecture

Polymorphic, additive `(entityType, entityId)` design (owner-approved): `EntitySeo` (SEO
overrides + plain-text intro) and `EntityFaq` (entity-specific FAQs). Integrity enforced in
services (`lib/cms/{landingEntities,entitySeoService,faqService,landingAdminService}.ts`):
entity existence + type validation + per-entity authorization + audit; orphan cleanup wired into
`rodeoService` + `taxonomyService` delete paths. No new permissions; reuses `rodeo.manage`
(rodeo + discipline) and `taxonomy.manage` (category).

## C. Database migration summary

Additive migration `20261101100000_batch11_entity_seo_faq` (dev + test): enum
`LandingEntityType` + tables `EntitySeo` (unique `(entityType,entityId)`) and `EntityFaq`
(unique `(entityType,entityId,question)`). The generated `searchVector` DROP drift was
hand-stripped (FTS + GIN preserved). No existing table altered; rollback = drop the two tables +
enum. (One transient apply error occurred because the first hand-strip also removed the
`CREATE TYPE`; corrected via `migrate resolve --rolled-back` + re-apply — the committed migration
is correct.)

## D. SEO & FAQ feature coverage matrix

| Entity | Public Page | Editable SEO | Editorial Intro | FAQ Mgmt | FAQ JSON-LD | Noindex control | CMS |
|---|---|---|---|---|---|---|---|
| Rodeo Hub | ✅ | ✅ | ✅ | ✅ | ✅ (when FAQs) | ✅ | ✅ |
| Rodeo Event | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Event Edition | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Discipline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (+ fields editable) |
| Category | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Articles retain their own `ArticleSeo`. SEO overrides fall back to derived metadata when empty;
`noindex` is additive-only (cannot force-index a thin/unpublished page); canonical overrides are
same-site-validated; `FAQPage` JSON-LD is emitted only from visible enabled FAQs (no rich-result
guarantee claimed).

## E. Authorization & validation summary

All SEO/FAQ mutations authenticate then enforce the entity's owning permission in the service and
write an `AuditLog` row. Validation: canonical override same-site only; intro/text reject HTML
(`[^<>]`); FAQ question/answer min length; duplicate questions blocked (DB unique +
case-insensitive); reorder must contain exactly the entity's FAQ ids (no cross-entity mutation);
existence checked before every mutation; orphan rows cleaned on entity delete.

## F. Test results & build status

- `tsc --noEmit`: ✅ 0 errors · `prisma validate`: ✅
- Vitest: **194/194** (deterministic ×2) — +8 Batch 11 (`landing-unit` 4, `landing` 4).
- `next build`: ✅ PASS (`/admin/landing-seo` + all landing routes).
- Route smoke **33/33** · admin smoke **14/14** (incl `/admin/landing-seo/`) · media **7/7** ·
  cache **10/10** · migration/FTS gate **5/5** (local test-DB).

## G. Browser verification

Verified via the HTTP smoke harnesses (SSR output asserted: canonical, noindex, rodeo pages 200,
FAQ render path). The interactive browser-automation skill is available but was not run; green
SSR smokes cover the surfaces.

## H. Remaining limitations

- **Dev admin account must be re-bootstrapped.** The prior reset wiped the dev DB's users; run
  `cd apps/web && npm run bootstrap:admin` to recreate your Super Admin login (interactive;
  password never logged). The data content is restored; only accounts need re-creation.
- Hero-image picker for landing entities and a full block-based content builder are future work;
  `ogImage` (URL) + plain-text `intro` cover this batch's SEO/editorial needs.
- Venue public pages + a Competitor/Athlete entity remain future batches.

## I. Outstanding migration-replay status

**Still OUTSTANDING (not run):** the full fresh-from-zero replay on an isolated disposable DB
requires a one-time CREATEDB-capable local `MIGRATION_REPLAY_ADMIN_URL` (no Docker, per owner).
The standing gate remains the local `nfrguide_test` FTS verification (5/5) + the Vitest FTS
regression. Not reported as passed.

## J. Recommended Batch 12 priorities

1. Full fresh-from-zero migration replay once a local CREATEDB URL is provided.
2. Venue public landing pages (+ SEO/FAQ) and a Competitor/Athlete entity.
3. Hero-image media picker + richer block-based editorial content for landing entities.
4. Surface discipline-field editing in the Rodeo Coverage module UI (currently via the Landing
   manager).

Batch 12 was **not** started.
