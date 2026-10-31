# NFRGuide.com — Data Models & Schema Contracts

This document details the TypeScript contracts used in Phase 0 alongside the planned relational schema (PostgreSQL DDL and Prisma ORM models) for Phase 1.

---

## 1. Core TypeScript Contracts (Phase 0)

All primary contracts reside in `src/types/index.ts` and `src/types/admin.ts`.

### Article (`src/types/index.ts`)
```ts
export type ArticleType =
  | 'feature'
  | 'analysis'
  | 'guide'
  | 'news'
  | 'opinion'
  | 'interview'
  | 'historical'
  | 'Event Guide'
  | 'Shopping Guide'
  | 'Entertainment Guide'
  | 'Logistics Guide'
  | 'Round Recap'
  | 'Aggregate Analysis'
  | 'Discipline Primer'
  | 'Athlete Profile'
  | 'Stock Contractor Profile'
  | 'Gear & Tack Review'
  | 'Travel & Hospitality';

export type ArticleWorkflowStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived';

export interface Article {
  id: string;
  slug: string;
  title: string;
  headline?: string;
  deck: string;
  excerpt: string;
  category: PrimarySection;
  subcategory?: string;
  articleType: ArticleType;
  status: 'published' | 'draft' | 'archived';
  workflowStatus?: ArticleWorkflowStatus;
  readTime: string;
  author: Author;
  publishedAt: string;
  updatedAt?: string;
  reviewedAt?: string;
  scheduledAt?: string;
  heroImage: string;
  imageRightsStatus?: MediaRightsStatus;
  imageSeoTitle?: string;
  imageAltText?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  seo?: {
    title?: string;
    description?: string;
  };
  disclosure?: string;
  disclosureNote?: string;
  relatedArticleIds?: string[];
  associatedDisciplineIds?: string[];
  associatedHubIds?: string[];
  associatedEventIds?: string[];
  associatedEditionIds?: string[];
  sources?: SourceCitation[];
  structuredBody?: ContentBlock[];
}
```

### Structured Content Blocks (`ContentBlock`)
```ts
export type ContentBlock =
  | { type: 'paragraph'; text: string; dropCap?: boolean }
  | { type: 'heading'; level: 2 | 3; text: string; id?: string }
  | { type: 'quote'; quote: string; citation: string; role?: string }
  | { type: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | { type: 'callout'; text: string; style: 'info' | 'warning' | 'stat' | 'neutral' }
  | { type: 'image'; url: string; caption: string; altText: string; photographer?: string }
  | { type: 'sourceLink'; title: string; url: string; organization: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'divider' };
```

### Article Revisions & Audit Log (`ArticleRevision`)
```ts
export interface ArticleRevision {
  id: string;
  articleId: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  status: ArticleWorkflowStatus;
  summary: string;
  snapshot: Partial<Article>;
}
```

---

## 2. Relational Mapping Blueprint (Phase 1 PostgreSQL / Prisma)

When migrating to a persistent PostgreSQL database, the TypeScript interfaces map cleanly to the following relational models:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum WorkflowStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  SCHEDULED
  PUBLISHED
  ARCHIVED
}

enum ImageRightsStatus {
  STAFF_PHOTO
  EDITORIAL_POOL
  PRCA_ARCHIVE
  LICENSED_CREATIVE
  UNRESOLVED
}

model Article {
  id                 String             @id @default(uuid())
  slug               String             @unique
  title              String
  deck               String?
  excerpt            String
  category           String
  subcategory        String?
  articleType        String
  workflowStatus     WorkflowStatus     @default(DRAFT)
  readTime           String?
  publishedAt        DateTime?
  scheduledAt        DateTime?
  updatedAt          DateTime           @updatedAt
  heroImageUrl       String?
  imageRightsStatus  ImageRightsStatus  @default(UNRESOLVED)
  imageSeoTitle      String?
  imageAltText       String?
  seoTitle           String?
  seoDescription     String?
  canonicalUrl       String?
  disclosureType     String             @default("editorial-independent")
  disclosureNote     String?

  // Relations
  authorId           String
  author             User               @relation(fields: [authorId], references: [id])
  revisions          ArticleRevision[]
  contentBlocks      ArticleBlock[]
  sources            ArticleSource[]
  disciplines        ArticleDiscipline[]
  events             ArticleEvent[]
  hubs               ArticleHub[]
  editions           ArticleEdition[]

  @@index([slug])
  @@index([workflowStatus])
  @@index([category])
}

model ArticleBlock {
  id         String   @id @default(uuid())
  articleId  String
  article    Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  sortOrder  Int
  blockType  String   // paragraph, heading, quote, table, callout, image, sourceLink, list, divider
  data       Json     // Typed structured content payload

  @@index([articleId, sortOrder])
}

model ArticleRevision {
  id         String         @id @default(uuid())
  articleId  String
  article    Article        @relation(fields: [articleId], references: [id], onDelete: Cascade)
  actorId    String
  actor      User           @relation(fields: [actorId], references: [id])
  status     WorkflowStatus
  summary    String
  snapshot   Json
  createdAt  DateTime       @default(now())

  @@index([articleId, createdAt])
}

model User {
  id           String            @id @default(uuid())
  email        String            @unique
  name         String
  role         String            // ADMIN, EDITOR, CONTRIBUTOR
  credentials  String?
  bio          String?
  articles     Article[]
  revisions    ArticleRevision[]
}

model RodeoHub {
  id          String         @id
  slug        String         @unique
  title       String
  city        String
  state       String
  description String
  articles    ArticleHub[]
}

model RecurringRodeoEvent {
  id               String         @id
  slug             String         @unique
  name             String
  location         String
  traditionalMonth String
  description      String
  articles         ArticleEvent[]
}

model EventEdition {
  id             String           @id
  slug           String           @unique
  year           Int
  name           String
  totalPurse     String
  venue          String
  articles       ArticleEdition[]
}

model Discipline {
  id          String              @id
  slug        String              @unique
  name        String
  summary     String
  articles    ArticleDiscipline[]
}

// Join Tables for Many-to-Many Relationships
model ArticleDiscipline {
  articleId    String
  disciplineId String
  article      Article    @relation(fields: [articleId], references: [id], onDelete: Cascade)
  discipline   Discipline @relation(fields: [disciplineId], references: [id])

  @@id([articleId, disciplineId])
}

model ArticleHub {
  articleId String
  hubId     String
  article   Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  hub       RodeoHub @relation(fields: [hubId], references: [id])

  @@id([articleId, hubId])
}

model ArticleEvent {
  articleId String
  eventId   String
  article   Article             @relation(fields: [articleId], references: [id], onDelete: Cascade)
  event     RecurringRodeoEvent @relation(fields: [eventId], references: [id])

  @@id([articleId, eventId])
}

model ArticleEdition {
  articleId String
  editionId String
  article   Article      @relation(fields: [articleId], references: [id], onDelete: Cascade)
  edition   EventEdition @relation(fields: [editionId], references: [id])

  @@id([articleId, editionId])
}

model ArticleSource {
  id          String  @id @default(uuid())
  articleId   String
  article     Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  title       String
  url         String
  publisher   String
  year        String?

  @@index([articleId])
}
```

---

# Phase 1 / Batch 02 — Executable Prisma Schema (addendum)

> Added 2026-10-28. The Phase 0 blueprint above has been superseded by an
> executable, normalized schema at `apps/web/prisma/schema.prisma` and its
> committed initial migration at `apps/web/prisma/migrations/`.

Key refinements over the Phase 0 blueprint:
- Editorial byline **Author** is modeled separately from the future auth **User**.
- Structured body is relational **ArticleBlock** rows (`blockType` + `data` JSON,
  ordered), not a JSON blob on Article.
- Per-article SEO is a 1:1 **ArticleSeo** table; the eight editor fields map as
  documented in `DATABASE_ARCHITECTURE.md`.
- Rodeo model preserves the recurring-event vs edition distinction:
  **RodeoEvent** is hub-independent; **RodeoEventEdition** is unique on
  `(eventId, editionSlug)` with an optional **Venue**.
- All article↔entity relationships use junction tables with composite PKs;
  curated related articles use **ArticleRelation** (not a JSON id array).
- Added foundation tables: **ArticleRedirect**, **SeoRule/SeoAuditRun/SeoFinding**,
  **User/Role/Permission/UserRole/RolePermission/AuditLog** (no auth logic yet).

See `DATABASE_ARCHITECTURE.md` for the full entity/relationship walkthrough.

---

# Phase 1 / Batch 03 — Auth/Identity schema additions (addendum)

> Added 2026-10-29. Migration `20261029000000_batch03_auth_rbac` (additive).

- `User.passwordHash` (bcrypt), `User.lastLoginAt`.
- New `Session` (opaque token → SHA-256 `tokenHash`, `expiresAt`, server-side revocable).
- `Article.version` (optimistic-concurrency counter), `Article.createdById` → `User` (ownership).
- `ArticleRevision.actorId` → `User`, `EditorialWorkflowHistory.actorId` → `User`.
- Role / Permission / RolePermission are populated from the code RBAC matrix via `roleSync`.
Existing seeded data preserved (no reset).

## Batch 04 additions
> Added 2026-10-29. Migration `20261029100000_batch04_navigation` (additive — one new table).

- New **`NavigationItem`**: `location` (`header` | `footer-sections` |
  `footer-academy`), `label`, `url`, `sortOrder`, `isExternal`, `isSystem`
  (canonical/protected), `visible`, `createdAt`, `updatedAt`; indexed on
  `(location, sortOrder)`. Backs the DB-driven header/footer with static fallback.
- No other tables changed. The Batch 04 editorial modules operate over existing
  tables: `Category`/`Tag`/`Author` (taxonomy), `Source`/`ArticleSource`
  (references), `RodeoHub`/`RodeoEvent`/`RodeoEventEdition`/`Venue`/`Discipline`
  and their `Article*` junctions (rodeo coverage), and `AuditLog` (activity feed).
- Referential rule: `RodeoEventEdition` is unique per `(eventId, editionSlug)` —
  the recurring-event vs. annual-edition split. Deletes are restrict-on-delete for
  entities referenced by articles/editions (service-enforced).
# Phase 1 / Batch 05 media model addendum

The implemented model is documented in `MEDIA_DATA_MODEL.md`. `MediaAsset` is
the single asset record; `ArticleMedia` and five rodeo junctions reuse it without
binary duplication. Asset metadata is global, while `ArticleMedia.altText` and
`caption` are placement-specific. New uploads begin `DRAFT`, `READY`, and
rights-unconfirmed. `checksum` is SHA-256 of original bytes; `derivatives` stores
provider keys and dimensions, not blobs.

## Batch 06 additions
Migration `20261031000000_batch06_seo` (additive). Extended `SeoRule` (category,
title, defaultKind, ruleVersion, config JSON, appliesTo), `SeoAuditRun`
(triggeredById, totalFindings, summary JSON), and `SeoFinding` (ruleCode,
ruleVersion, kind, category, entityType/entityId, affectedUrl, recommendation,
detail JSON, assignedToId, resolvedById/At, resolutionNote). New enums
`SeoFindingKind` (DEFECT/RECOMMENDATION/OPPORTUNITY/NOT_PERFORMED), `SeoSeverity`
+= HIGH/MEDIUM/LOW/INFO, `SeoFindingStatus` += REOPENED. New `SeoConfig`
(key→JSON) for rule/threshold config. `fingerprint` stays unique (dedup).

## Batch 07 additions
Migration `20261031100000_batch07_analytics_search` (additive). New models:
- **SearchQueryEvent** — `normalizedQuery` (redacted), `queryLength`, `resultCount`,
  `zeroResult`, `contentType?`, `source`, `createdAt`. Indexed on `createdAt`,
  `normalizedQuery`, `(zeroResult, createdAt)`.
- **SearchResultClickEvent** — `normalizedQuery`, `entityType`, `entityId`, `position`,
  `createdAt`.
- **ContentViewEvent** — `entityType`, `entityId`, `path`, `source`, `createdAt`.
- **AnalyticsDailyAggregate** — `day` (Date), `metric`, `entityType` (default ''),
  `entityId` (default ''), `count`; unique `(day, metric, entityType, entityId)`.
- **AnalyticsProviderConnection** — `provider` (unique), `displayName`, `status`,
  `propertyRef?` (non-secret), `lastError?` (category only), timestamps.
- **AnalyticsSyncRun** — `connectionId`→connection, `provider`, `status`, counts, error
  category.
- **AnalyticsConfig** — `key`→JSON settings (collection flags, retention, redaction, tz).

New enums `AnalyticsEntityType` (ARTICLE/DISCIPLINE/CATEGORY/SECTION/RODEO_HUB/
RODEO_EVENT/RODEO_EDITION), `AnalyticsProvider` (FIRST_PARTY/INTERNAL_SEARCH/
GOOGLE_SEARCH_CONSOLE/GOOGLE_ANALYTICS_4), `ProviderConnectionStatus`. A generated
`tsvector` column `Article.searchVector` + GIN index back full-text search and are
intentionally **not** modeled in Prisma (raw-SQL + `$queryRaw`). No personal identifiers
are stored in any analytics table.
