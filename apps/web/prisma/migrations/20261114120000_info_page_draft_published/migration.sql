-- Information pages gain a published/draft split, protection, archival and
-- revision history (Stage 1 of the Page Manager work; implements S-1 / D-09).
--
-- Every statement is additive. No column is dropped, no row is deleted, and the
-- two backfills below only WRITE values that preserve existing behaviour.

-- 1. Page family. SYSTEM pages own a route the application depends on.
CREATE TYPE "InfoPageType" AS ENUM ('SYSTEM', 'CUSTOM');

ALTER TABLE "InfoPage"
  ADD COLUMN "publishedSnapshot" JSONB,
  ADD COLUMN "pageType"          "InfoPageType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "isProtected"       BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt"        TIMESTAMP(3),
  ADD COLUMN "version"           INTEGER        NOT NULL DEFAULT 1;

CREATE INDEX "InfoPage_pageType_archivedAt_idx" ON "InfoPage"("pageType", "archivedAt");

-- 2. BACKFILL ONE — a page that is live today must still be live afterwards.
--
--    The public renderer reads `publishedSnapshot` from here on. Without this
--    statement every already-published page would go dark the moment the new
--    code deployed, because its snapshot would be NULL. The snapshot is built
--    from the row's own current values, so the live page is byte-identical
--    before and after.
UPDATE "InfoPage"
   SET "publishedSnapshot" = jsonb_build_object(
         'title',           "title",
         'body',            "body",
         'seoTitle',        "seoTitle",
         'metaDescription', "metaDescription",
         'publishedAt',     COALESCE("publishedAt", "updatedAt")
       )
 WHERE "status" = 'PUBLISHED'
   AND "publishedSnapshot" IS NULL;

-- 3. BACKFILL TWO — the seven policy slugs are SYSTEM pages and are protected.
--
--    These URLs are referenced by the footer, the policy cross-navigation and
--    the sitemap, so losing one to a slug rename or a delete would break links
--    that are not in this table. Rows for other slugs stay CUSTOM.
UPDATE "InfoPage"
   SET "pageType" = 'SYSTEM', "isProtected" = true
 WHERE "slug" IN (
   'about', 'editorial-policy', 'corrections',
   'affiliate-disclosure', 'privacy', 'terms', 'contact'
 );

-- 4. Revision history, shaped exactly like ArticleRevision.
CREATE TABLE "InfoPageRevision" (
  "id"         TEXT NOT NULL,
  "pageId"     TEXT NOT NULL,
  "revisionNo" INTEGER NOT NULL,
  "actorId"    TEXT,
  "actorName"  TEXT NOT NULL,
  "status"     "InfoPageStatus" NOT NULL,
  "summary"    TEXT NOT NULL,
  "snapshot"   JSONB NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InfoPageRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InfoPageRevision_pageId_revisionNo_key" ON "InfoPageRevision"("pageId", "revisionNo");
CREATE INDEX "InfoPageRevision_pageId_createdAt_idx" ON "InfoPageRevision"("pageId", "createdAt");

ALTER TABLE "InfoPageRevision"
  ADD CONSTRAINT "InfoPageRevision_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "InfoPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
