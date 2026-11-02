# NFRGuide.com — Post-Batch 11 Recovery Audit & Batch 12 Architecture Plan

**Status:** Audit + planning only. No application features modified. Batch 12 **not** started.
**Date:** 2026-11-01 · **HEAD:** `702746f` · **Branch:** `batch-01-nextjs-migration` · working tree clean.
**Written for:** the project owner, to make the approval decisions in §8 before any Batch 12 code is written.

---

## Part A — Database Recovery Audit

### A.1 Git & commit state
- Branch `batch-01-nextjs-migration`, HEAD `702746f` (Batch 11 fix commit), **working tree clean** (no uncommitted changes).
- 10 migrations on disk, `init` → `batch11_entity_seo_faq`, plus `migration_lock.toml`.

### A.2 Dev database content counts (live, read-only)
| Group | Table | Count | Reads as |
|---|---|--:|---|
| Identity | User | **1** | only the Super Admin re-bootstrapped today |
| | Role / Permission | 5 / 43 | code-synced, intact |
| | Session | 0 | expected (none logged in) |
| | AuditLog | 14 | **only post-reset events** (restore + bootstrap) |
| Editorial | Article / ArticleBlock / ArticleSeo | 11 / 48 / 11 | full seed set |
| | Category / Tag / Author / Source | 5 / 42 / 6 / 6 | full seed set |
| Rodeo | Discipline | 7 | full seed set |
| | RodeoHub / RodeoEvent / RodeoEventEdition | 3 / 3 / 3 | full seed set |
| | RodeoHubEvent | 3 | Batch 10 links (re-seeded) |
| | **Venue** | **0** | never seeded — see A.4 |
| Media | MediaAsset | 4 | legacy seed assets only |
| Nav | NavigationItem | 15 | full seed set |
| Batch 11 | EntitySeo / EntityFaq | **0 / 0** | no landing SEO/FAQ content exists |
| SEO Intel | SeoRule / SeoFinding / SeoConfig | 55 / 0 / 0 | rules seeded; no scans/config |
| Analytics | ProviderConnection / Config / DailyAggregate | 2 / 0 / 0 | providers seeded; collection OFF |
| Monetization | Partner / Link / AdPlacement / Config | 0 / 0 / 0 / 0 | disabled-by-default, no seed rows |
| Governance | SystemSetting / StaffInvitation / PwdReset | 0 / 0 / 0 | none |

### A.3 Comparison vs documented Batch 02–11 expectations
Every table that the **idempotent seed** is supposed to populate matches its documented shape (articles 11, categories 5, disciplines 7, hubs/events/editions 3/3/3, nav 15, SEO rules 55, analytics providers 2). The schema itself is complete and correct across all 11 batches. **Seed-level content is fully restored.**

### A.4 Missing / non-seed records (what the reset cost)
These were **never in the seed** and are therefore **not recovered** by re-seeding:
1. **User accounts & auth history** — all users were wiped; the single current user is the one re-created today. Prior `lastLoginAt`, password history, and any additional staff accounts are gone.
2. **Full AuditLog history** — only 14 post-reset rows remain; the entire pre-reset audit trail is **unrecoverable**.
3. **Any manually authored/edited content in dev** — if drafts, edits, or extra articles existed beyond the 11 seed articles, they are **unrecoverable**.
4. **Manually uploaded media** — only the 4 legacy seed `MediaAsset` rows exist; any dev uploads are **unrecoverable** (note: Postgres never stored binary bodies, so even recovered rows would be URL/metadata only).
5. **Batch 11 landing SEO/FAQ** — `EntitySeo`/`EntityFaq` are empty; any hand-entered overrides/FAQs in dev before the reset are **unrecoverable**.
6. **SystemSetting / SeoConfig / AnalyticsConfig / Monetization** — all empty; any custom configuration is **unrecoverable**.
7. **Venues** — 0 rows. This is **expected** (the seed has no venues) but relevant to Batch 12.

### A.5 Backups searched (no modification)
- No pre-existing dumps or backups were found anywhere in the repo (`*.dump`, `*.sql.gz`, `backup*` — none).
- **Conclusion: there is no recoverable pre-reset snapshot on disk.** The data in A.4 is unrecoverable unless the owner holds a backup elsewhere.

### A.6 Backup created now (authorized local config)
- Tool: `pg_dump` v17 (matches the PostgreSQL 17 server), custom format (`-Fc --no-owner --no-privileges`).
- Validated with `pg_restore -l`: **65 TABLE DATA entries**, 183,398 bytes, restoreable.
- Location (session scratchpad — deliberately outside the repo so no data/credentials enter source control):
  `…/scratchpad/nfrguide_dev_backup_20261101_154750.dump`
- No credentials or connection strings were printed. **This backup is session-temporary** — copy it to a durable location you control if you want to keep it.

> **Honest recovery verdict:** the database is **restored to seed baseline only**, not recovered to a prior manual state. Successful seeding is **not** complete recovery (A.4 items remain lost).

---

## Part B — Admin & Security Verification

1. **Active Super Admin:** exactly **1** user, status `ACTIVE`, role `super_admin`, password set. (Verified by role/status/flags only — no credential exposed.)
2. **Auth / RBAC / guards:** DB-session auth, bcrypt + SHA-256 token, default-deny RBAC (43 permissions across 5 roles synced from code) all intact. `/admin/login/` and the dashboard guard chain are present on disk; prior-session smoke runs showed the dashboard redirecting unauthenticated requests (307).
3. **No accounts created or passwords set in this audit** — per the Part B.3 constraint. (The earlier bootstrap was a separate, explicitly-authorized request.)
4. **Batch 11 landing route:** `app/admin/(dashboard)/landing-seo/page.tsx` present and gated.
5. **Five landing entity types confirmed** in both schema enum and `LANDING_TYPES`: DISCIPLINE, CATEGORY, RODEO_HUB, RODEO_EVENT, RODEO_EDITION.

---

## Part C — Migration Replay Status

### C.1 Current replay script (`scripts/migration-replay.mts`)
Replays **every committed migration from zero** onto a disposable `<db>_migration_replay`, asserts the FTS contract (tsvector generated column, GIN index, `websearch_to_tsquery` match, all expected tables, live insert populates the vector), then drops the disposable DB. If the role lacks `CREATEDB`, it **falls back** to asserting the same FTS artifacts on `TEST_DATABASE_URL` and explicitly says that is **not** a from-zero replay.

### C.2 Observed DB state
- **Dev DB:** FTS healthy (GIN index present, `searchVector` `is_generated = ALWAYS`, query "rodeo" → 5 matches). **But `_prisma_migrations` does not exist** — the prior reset recreated the dev schema via `db push`, so dev has **no migration history**. Running `migrate deploy` against dev would now fail (objects already exist); dev must be either kept on `db push` or baselined with `migrate resolve --applied` before ever running `deploy` there.
- **Test DB:** `_prisma_migrations` present (**11 applied, 1 rolled-back** — the expected Batch 11 rollback+redeploy), FTS healthy. This is what the fallback gate verifies.

### C.3 Minimum privileges for a genuine from-zero replay
- A role with **`CREATEDB`** (to create/drop the disposable DB) is sufficient; **full superuser is not required** and not recommended.
- **Preferred:** provision a **separate disposable database** owned by a dedicated role, and point `MIGRATION_REPLAY_ADMIN_URL` at a `CREATEDB`-capable maintenance connection. No existing dev/test DB is touched.

### C.4 Verdict: **OUTSTANDING** (unchanged)
No isolated `CREATEDB`-capable target is currently configured, so a true fresh-from-zero replay has **not** been run. Safe setup to clear it (no passwords in chat; no Docker; no reset of dev/test):
```
-- one-time, as a local admin (psql), choosing your own password:
CREATE ROLE nfrguide_replay LOGIN PASSWORD '***' CREATEDB;
-- then set in apps/web/.env (not committed):
MIGRATION_REPLAY_ADMIN_URL="postgresql://nfrguide_replay:***@localhost:5432/postgres"
-- then:
npm run test:migration
```
The gate self-verifies `searchVector`, the GIN index, and full-text behavior on the fresh DB and exits non-zero on any drift.

---

## Part D — Batch 12 Architecture Proposal (planning only)

### D.1 What already exists (reuse, do not duplicate)
- **Venue** model exists but is **minimal** (`slug, name, city, state, country`, `editions[]`, `media[]`) — no description, no public page, no SEO/FAQ. `VenueMedia` join already exists.
- **Edition → Venue** link already exists (`RodeoEventEdition.venueId`). Events (recurring) intentionally have only a `location` string, no fixed venue.
- **Discipline ↔ Event** link exists (`EventDiscipline`).
- **No `Competitor` model exists** — Batch 12 introduces it net-new (no collision).
- **Polymorphic SEO/FAQ** (`EntitySeo`/`EntityFaq` + `LandingEntityType`) and the `/admin/landing-seo/` manager, `landingAdminService`, `buildMetadata`, `faqPageJsonLd`, media library, `guard.ts`/`audit`, and RBAC are all reusable — **extend, do not fork**.

### D.2 Proposed schema changes (all additive; FTS preserved)
1. **Extend `LandingEntityType`** enum (+2 members): `VENUE`, `COMPETITOR`. Reuses the entire Batch 11 SEO/FAQ layer.
2. **Extend `Venue`** additively: `nickname?`, `summary?` (text), `description?`/`guide Json?` (evergreen body), `websiteUrl?`, `capacity?`, `openedYear?`, `latitude?`/`longitude?`, `sortOrder`. *(Scope is an owner decision — see §8.)*
3. **New model `Competitor`:** `id, slug @unique, fullName, knownAs?, summary, bio/guide Json?, hometownCity?/state?/country?, birthYear?, status? (active/retired), heroImage?, imageCredit?, sortOrder`.
4. **New junctions (mirroring existing composite-PK patterns, no new FK gymnastics):**
   - `CompetitorDiscipline (competitorId, disciplineId)` — competitor ↔ discipline.
   - `CompetitorParticipation` — competitor ↔ **edition** `(competitorId, editionId)` as the primary participation grain (specific occurrences), with an optional result/placement field. *(Event-level participation is an owner decision — see §8.)*
   - `ArticleCompetitor (articleId, competitorId)` — mirrors `ArticleDiscipline`/`ArticleEvent` so articles surface on competitor pages.
   - `CompetitorMedia` — net-new media join mirroring `VenueMedia`.
5. **Venue ↔ event/edition:** keep the existing **edition-level** `venueId` (no change). Adding a venue to recurring events is an owner decision (§8) — default recommendation: **don't** (events are venue-independent by design).
6. **Migration `20261101200000_batch12_venue_competitor`:** additive only; hand-strip the known spurious `DROP INDEX "Article_searchVector_idx"` + `ALTER … DROP DEFAULT` drift lines (keep all `CreateEnum`/`CreateTable`); apply to dev + test. **Dev caveat (C.2):** dev has no migration history, so this migration must be applied to dev via `db push`/baseline, not `migrate deploy`.

### D.3 Proposed public routes
| Route | Backing | SEO/FAQ |
|---|---|---|
| `/venues/<slug>/` | `Venue` + its editions (which event/edition occurs there) | `EntitySeo`/`EntityFaq` (`VENUE`) + FAQPage JSON-LD + Place/LocationFeatureSpecification JSON-LD |
| `/competitors/<slug>/` | `Competitor` + disciplines + participations + tagged articles | `EntitySeo`/`EntityFaq` (`COMPETITOR`) + FAQPage + Person JSON-LD |

Both: `generateMetadata` + `generateStaticParams` + `dynamicParams` + `trailingSlash`, published-only article surfacing, internal links from existing edition/discipline pages, and **sitemap integration** (add both to the existing sitemap source). Naming (`/competitors/` vs `/athletes/` vs `/contestants/`) is an owner decision (§8).

### D.4 Cross-cutting
- **Authorization & audit:** reuse `guard.ts`/`requireActor`/`audit`. Gate venue + competitor management under existing `rodeo.manage` (recommended, no new permission strings), or add `venue.manage`/`competitor.manage` — owner decision (§8). Landing SEO/FAQ for the new types routes through `permForEntity` (extend it for VENUE/COMPETITOR).
- **Validation & publication eligibility:** zod-validated inputs; a competitor/venue is **publicly listable** only when it has the minimum fields (slug, name/fullName, summary) and `noindex` is respected via `isLandingIndexable`.
- **Tests & QA:** unit suites (no-DB) for services + permission mapping; DB-gated suites for CRUD/SEO/FAQ/participation integrity + orphan cleanup; extend route/admin smoke scripts for the two new public routes and the landing manager's two new types; browser QA pass.

---

## Final Deliverables Summary

1. **DB recovery audit** — §A: schema complete; **seed-baseline restored only**; A.4 lists unrecoverable losses (users, full audit history, any manual content/media/config).
2. **Backup verification** — §A.6: valid 65-table `pg_dump` created in scratchpad, restoreable; **no pre-reset backup existed**.
3. **Admin/security status** — §B: 1 active Super Admin; RBAC/guards/login/landing route all intact; no accounts created in this audit.
4. **Migration replay status** — §C: **OUTSTANDING**; dev lost its migration history (`db push` reset); test healthy; exact CREATEDB setup provided; FTS/GIN verified live on both DBs.
5. **Batch 12 architecture proposal** — §D.
6. **Proposed public routes** — §D.3 (`/venues/<slug>/`, `/competitors/<slug>/`).
7. **Required schema changes** — §D.2 (additive; enum +2, Venue extended, Competitor + 4 junctions, additive migration).
8. **Owner approval decisions** — below.
9. **Implementation sequence** — below.
10. **Acceptance criteria** — below.

### 8 — Owner approval decisions needed
- **D1. Public term/route for athletes:** `/competitors/` (recommended), `/athletes/`, or `/contestants/`?
- **D2. Participation grain:** edition-only (recommended), or edition **and** event-level?
- **D3. Venue model scope:** minimal (summary + description + website only) vs richer (capacity, openedYear, lat/long)?
- **D4. Venue on recurring events:** keep edition-only (recommended) or add an optional venue to `RodeoEvent`?
- **D5. Permissions:** reuse `rodeo.manage` for venues+competitors (recommended, no new strings) or add `venue.manage`/`competitor.manage`?
- **D6. Competitor data sourcing:** since only verified facts are allowed, confirm Batch 12 ships the CMS + empty/seed-stub entities (no fabricated athlete bios/stats).
- **D7. Migration replay:** provision the CREATEDB replay role now (clears the OUTSTANDING gate) or defer again?

### 9 — Implementation sequence (on approval)
1. Additive migration (enum +2, Venue fields, Competitor + junctions); hand-strip FTS drift; apply dev + test.
2. Services: `venueService`, `competitorService` (+ orphan cleanup wiring); extend `landingEntities`/`permForEntity`/`landingAdminService` for the 2 new types.
3. Admin CMS: venue & competitor management + their landing SEO/FAQ via the existing manager.
4. Public pages: `/venues/<slug>/`, `/competitors/<slug>/` with metadata/JSON-LD/FAQ.
5. Internal linking + sitemap wiring.
6. Tests (unit + DB-gated) + smoke-script + browser QA.
7. Report + verification (incl. FTS gate).

### 10 — Acceptance criteria
- `tsc` clean; full vitest suite green (×2 serial); `next build` passes.
- Route + admin + media + cache smoke all green, incl. the 2 new public routes and the 2 new landing types.
- Additive migration applies cleanly to dev + test with **no** `DROP COLUMN`/`DROP INDEX`; `searchVector`/GIN/FTS preserved.
- RBAC enforced server-side for every new mutation; every mutation audited.
- No fabricated data; monetization/analytics collection remain disabled by default; no secrets committed; no DB reset; no Docker.
- Public pages surface only PUBLISHED articles; `noindex`/canonical honored; both entities in the sitemap.

---

**Do not start Batch 12 implementation until the §8 decisions are approved.**
