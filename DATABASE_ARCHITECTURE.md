# NFRGuide.com — Database Architecture (Phase 1 / Batch 02)

PostgreSQL relational schema (Prisma 6) for the editorial platform. Source of
truth: [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma). Grounded in
Master Requirements v2.0 §7, Batch 02 §4, and the Phase 0 TypeScript contracts.

## Overview

- **Provider:** PostgreSQL · **ORM:** Prisma 6.19.3 · **IDs:** `uuid` by default
  (seed uses stable string ids for demo entities so re-seeding is idempotent).
- **Timestamps:** `createdAt`/`updatedAt` on mutable entities (UTC).
- **34 tables, 33 foreign keys, 8 enums** (see initial migration).
- **Scope:** this batch builds the schema + a server-only **read** layer. Identity
  (User/Role/Permission/UserRole/AuditLog) and SEO-intelligence tables
  (SeoRule/SeoFinding/SeoAuditRun) are **foundation only** — no auth logic, no
  scanning worker.

## Enums

`WorkflowStatus` (DRAFT, IN_REVIEW, APPROVED, SCHEDULED, PUBLISHED, ARCHIVED),
`ImageRightsStatus`, `SourceClassification`, `SourceStatus`, `SeoSeverity`,
`SeoFindingStatus`, `RedirectStatus`, `UserAccountStatus`.

## Entity groups & relationships

### Editorial core
- **Article** — the eight approved fields map as: `title` (01), `deck` (02),
  `excerpt` (03), body → **ArticleBlock[]** (04), SEO title/meta → **ArticleSeo**
  (05/06), `imageSeoTitle` (07), `imageAltText` (08). `slug` is separate unique
  metadata. `workflowStatus` drives publication. FKs: `author` → **Author**,
  `category` → **Category**.
- **ArticleBlock** — ordered structured body rows (`blockType` + `data` JSON);
  unique `(articleId, sortOrder)`. JSON is used for the flexible block union only.
- **ArticleSeo** — 1:1 with Article (`seoTitle`, `metaDescription`, `canonicalUrl`,
  `ogImage`, `robots`, `structuredDataType`).
- **ArticleRevision** — content snapshots, unique `(articleId, revisionNo)`.
- **EditorialWorkflowHistory** — status-transition log (distinct from revisions).
- **Category** (5 primary sections), **Tag** + **ArticleTag** (M:N).
- **ArticleRelation** — curated article↔article links (replaces a JSON id array).
- **Author** — editorial byline identity (separate from auth **User**).

### Evidence & media
- **Source** (reusable directory) + **ArticleSource** (M:N with per-article note).
- **MediaAsset** (unique `storageKey`) + **ArticleMedia** (usage-keyed, e.g. `hero`).

### Rodeo coverage (Master Reqs §2.1 entity distinctions)
- **Discipline** — the 7 NFR disciplines; core columns + rich evergreen `guide` JSON.
- **RodeoHub** — permanent editorial landing (geographic/thematic).
- **RodeoEvent** — **stable recurring event identity, independent of any hub**.
- **RodeoEventEdition** — specific occurrence; **unique `(eventId, editionSlug)`**
  (not `(eventId, year)`), optional **Venue** FK, verified dates.
- **Venue**, **EventDiscipline**.
- Article↔rodeo junctions: **ArticleDiscipline / ArticleHub / ArticleEvent /
  ArticleEdition**, each with a composite PK (Master Reqs §7.3).

### Publishing & SEO foundation
- **ArticleRedirect** — normalized redirect registry, unique active `sourcePath`.
- **SeoRule / SeoAuditRun / SeoFinding** — rule/scan/finding model (unique finding
  `fingerprint`); no scanner runs in this batch.

### Identity foundation (no auth yet)
- **User**, **Role**, **Permission**, **UserRole**, **RolePermission**, **AuditLog**.

## Integrity & indexing highlights
- Unique slugs on Article, Category, Tag, Author, Discipline, RodeoHub, RodeoEvent,
  Venue; unique `storageKey` (MediaAsset), `code` (SeoRule), `key` (Role/Permission),
  `sourcePath` (ArticleRedirect), `fingerprint` (SeoFinding).
- Composite PKs on all junction tables; `(eventId, editionSlug)` on editions.
- Indexes on `Article.workflowStatus`, `categoryId`, `publishedAt` (and composite
  `workflowStatus+publishedAt`) for fast published feeds.
- Cascade deletes from Article to its children/junctions; `SetNull` where a parent
  may outlive the reference (SeoFinding.article, AuditLog.actor).

## Access model
- All public reads go through the **server-only** repository
  [apps/web/lib/content.ts](apps/web/lib/content.ts), which constrains article reads to
  `workflowStatus = PUBLISHED`. `lib/db.ts` (`server-only`) owns the single Prisma
  client. UI never imports Prisma; it receives mapped domain objects
  ([apps/web/lib/mappers.ts](apps/web/lib/mappers.ts)).

---

# Phase 1 / Batch 03 — Identity & concurrency (addendum)

> Added 2026-10-29. Additive migration `20261029000000_batch03_auth_rbac`.

- **Session** table (server-side sessions): `tokenHash` unique (SHA-256 of an opaque
  token), `expiresAt` (indexed), `userId` (cascade), optional ip/user-agent.
- **User**: `passwordHash`, `lastLoginAt`.
- **Article**: `version` (optimistic lock), `createdById` → User (ownership; SetNull).
- **ArticleRevision.actorId**, **EditorialWorkflowHistory.actorId** → User (SetNull).
- Identity tables (User/Role/Permission/UserRole/RolePermission/AuditLog) are now active:
  roles/permissions seeded from the code matrix; audit logging writes real entries.

## Batch 04 (2026-10-29)
- **NavigationItem** (new): DB-backed site navigation; `(location, sortOrder)` index;
  `isSystem` marks canonical/protected rows. Migration
  `20261029100000_batch04_navigation`, generated offline and applied to dev + test
  (least-privilege roles cannot create the shadow DB `migrate dev` needs — see
  MIGRATION_STATUS.md).
- Batch 04 adds five RBAC permissions (`rodeo.manage`, `taxonomy.manage`,
  `author.manage`, `source.manage`, `navigation.manage`) to the `Permission`/
  `RolePermission` tables via `roleSync`.
- All Batch 04 mutations write `AuditLog` rows via the shared `lib/cms/guard.ts`.
- No existing tables altered; no data reset.
# Batch 05 media schema addendum (2026-10-29)

Migration `20261029200000_batch05_media` additively extends `MediaAsset` with
storage identity, validated file facts, checksums, reusable editorial/licensing
metadata, ownership, processing/visibility state and derivative JSON. It adds
`RodeoHubMedia`, `RodeoEventMedia`, `RodeoEventEditionMedia`, `DisciplineMedia`
and `VenueMedia`. Existing `ArticleMedia` stores featured/inline placements and
contextual ALT/caption. PostgreSQL never stores binary image bodies. Legacy seed
rows retain their IDs and URLs with `storageProvider=legacy-local`.

## Batch 06 (2026-10-31)
SEO Intelligence persistence: extended `SeoRule`/`SeoAuditRun`/`SeoFinding` +
new `SeoConfig`; additive enums. Findings keyed by a stable unique `fingerprint`
(dedup across runs), with reopen + verified auto-resolve. New SEO RBAC perms
(`seo.audit.run`/`.view`/`seo.finding.manage`) mirror into Role/Permission via
roleSync; every SEO mutation writes an `AuditLog` row. No tables dropped; no data
reset. Migration `20261031000000_batch06_seo` (dev + test).

## Batch 07 (2026-10-31)
Analytics & Search Intelligence. New tables: `SearchQueryEvent`,
`SearchResultClickEvent`, `ContentViewEvent` (minimal, short-lived raw events — NO IP,
NO PII, NO persistent id), `AnalyticsDailyAggregate` (durable rollup, unique
`(day, metric, entityType, entityId)`), `AnalyticsProviderConnection` +
`AnalyticsSyncRun` (external provider foundation — credentials never stored; `lastError`
is a category only), and `AnalyticsConfig` (key→JSON settings; collection disabled by
default). New enums `AnalyticsEntityType`, `AnalyticsProvider`,
`ProviderConnectionStatus`. Full-text search is backed by a **generated `tsvector`
column** on `Article` (`searchVector`, weighted title=A/deck+excerpt=B/
subcategory+articleType=C) with a GIN index — created in raw migration SQL and queried
via parameterized `$queryRaw` (not a Prisma field). All timestamps UTC. Migration
`20261031100000_batch07_analytics_search` (dev + test). No existing table altered
destructively; no data reset.

## Batch 08 (2026-10-31)
Monetization & Affiliate Management. New models: `AffiliatePartner`, `AffiliateProgram`,
`AffiliateLink`, `AffiliatePlacement` (→ Article), `AdPlacement`, `MonetizationDisclosure`,
`SponsoredContentRelationship` (→ Article), `CommercialEntityAssociation` (rodeo/editorial
entities, event-vs-edition preserved), `MonetizationConfiguration` (key→JSON, adsense/click
OFF by default), `AffiliateClickAggregate` (per-link/day, no identifiers). New enums
`AffiliateCategory`, `PartnerVerificationStatus`, `MonetizationStatus`,
`AffiliateRelAttribute`, `AdPlacementSlot`, `CommercialEntityType`. Commercial data is kept
separate from editorial facts; no credentials/secrets are stored (`lastError` category only).
Reference-safe deletion is service-enforced (partner↔links Restrict; placement/sponsorship
cascade with their Article). Migration `20261031200000_batch08_monetization` (dev + test);
additive, no data reset. `Article.searchVector` is now declared `Unsupported("tsvector")` so
`migrate diff` no longer tries to drop the FTS column (see MIGRATION_STATUS.md).

## Batch 09 (2026-10-31)
Admin governance. New tables: `StaffInvitation` (single-use, time-limited invite; stores only
the token SHA-256 hash), `PasswordResetToken` (hashed, short-lived, single-use; FK → User,
cascade), `SystemSetting` (typed key→JSON site/editorial/rodeo config). Identity tables
(User/Role/UserRole/Session/AuditLog) are otherwise unchanged — account status reuses the
existing `UserAccountStatus` (INVITED/ACTIVE/SUSPENDED). All governance mutations are audited
via `AuditLog`. Migration `20261031300000_batch09_admin_governance` (dev + test); additive, no
data reset; the FTS `searchVector` column + GIN index are preserved and now protected by the
`npm run test:migration` replay gate.

## Batch 10 (2026-11-01)
Public rodeo entity pages. New junction `RodeoHubEvent` (hub↔recurring-event M:N, cascade both
sides) so a hub can list its associated events while event URLs stay hub-independent. No other
schema change — existing `RodeoHub`/`RodeoEvent`/`RodeoEventEdition`/`Venue` + `Article*`
junctions back the public pages; only PUBLISHED articles are surfaced. Hubs and events share the
public `/rodeo-events/<slug>/` namespace, so slugs are unique across both tables (enforced in
`rodeoService` on create). Migration `20261101000000_batch10_rodeo_hub_event` (dev + test);
additive, FTS preserved.

## Batch 11 (2026-11-01)
Landing-page SEO + FAQ. New enum `LandingEntityType` + polymorphic tables `EntitySeo`
(editor SEO overrides + plain-text intro; unique per entity) and `EntityFaq` (entity-specific
FAQs; unique question per entity). Polymorphic by `(entityType, entityId)` with no FK — the
services enforce existence/type/authorization and clean up orphan rows when an owning entity is
deleted (wired into `rodeoService`/`taxonomyService`). Migration
`20261101100000_batch11_entity_seo_faq` (dev + test); additive, FTS + GIN preserved. Note: the
development database had been reset by a prior session and was restored via the idempotent seed
(test DB untouched); dev user accounts require re-bootstrapping.

## Batch 12 (2026-11-01)
Venue & Competitor entities. **`Venue`** extended additively (nickname, summary, description,
websiteUrl, capacity, openedYear, latitude, longitude, sortOrder — all nullable except
`sortOrder` default 0). New model **`Competitor`** (rodeo athlete; slug unique; verified-facts
fields + evergreen `guide` JSON). New junctions: **`CompetitorDiscipline`** (competitor↔discipline),
**`CompetitorParticipation`** (competitor↔**edition** only — authoritative at the annual-occurrence
grain, never the recurring event; optional `result`/`placement`), **`ArticleCompetitor`**
(article↔competitor, mirrors `ArticleDiscipline`), **`CompetitorMedia`** (mirrors `VenueMedia`).
Enum **`LandingEntityType`** extended with `VENUE` and `COMPETITOR` so the existing polymorphic
`EntitySeo`/`EntityFaq` layer is reused (no competing SEO system). Edition↔venue relationship is
unchanged (`RodeoEventEdition.venueId`); recurring `RodeoEvent` gets **no** permanent venue.
Reference-safe deletion: a competitor with published-article links is blocked; junctions cascade
via FK; polymorphic SEO/FAQ rows are cleaned up in the service delete paths (no orphans). Migration
`20261101200000_batch12_venue_competitor` (dev + test); additive — zero DROP/column-type changes;
`Article.searchVector` + GIN + FTS preserved. The dev DB (which lacked `_prisma_migrations` after a
prior `db push` reset) was **baselined** by marking migrations 01–11 `--applied`, then batch12 was
applied via `migrate deploy` (no re-run, no data loss). A durable `pg_dump` backup was taken first.
