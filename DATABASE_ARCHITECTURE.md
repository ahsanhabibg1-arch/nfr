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
