-- Subcategory becomes a public entity with a FLAT route.
--
-- Owner decision (supersedes Issue 04 §6.2 option A): the archive lives at
-- `/<subcategory>/` and an article inside it at `/<subcategory>/<article>/`.
-- The primary section does not appear in the URL.
--
-- Every statement here is additive except the slug-uniqueness widening, which
-- is checked before it is applied. Nothing is rewritten and no row is deleted.

-- 1. Landing-page content, matching what a Discipline guide carries.
--    All nullable: existing rows stay valid and read as "not filled in yet".
ALTER TABLE "Subcategory"
  ADD COLUMN "summary"     TEXT,
  ADD COLUMN "image"       TEXT,
  ADD COLUMN "imageCredit" TEXT,
  ADD COLUMN "guide"       JSONB;

-- 2. Slug uniqueness widens from per-section to global, because a flat route
--    identifies the row by slug alone.
--
--    This is the one statement that can fail on real data, so it fails LOUDLY
--    and before any change, rather than letting PostgreSQL report a duplicate
--    index entry with no explanation of what to do about it. Checked against
--    production on 2026-11-14: 14 subcategories, zero collisions.
DO $$
DECLARE dupes TEXT;
BEGIN
  SELECT string_agg(slug, ', ') INTO dupes
    FROM (SELECT slug FROM "Subcategory" GROUP BY slug HAVING count(*) > 1) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot make Subcategory.slug globally unique: these slugs exist in more than one section (%). Re-slug the duplicates in Editorial Organization, then run this migration again.', dupes;
  END IF;
END $$;

DROP INDEX "Subcategory_categoryId_slug_key";
CREATE UNIQUE INDEX "Subcategory_slug_key" ON "Subcategory"("slug");

-- 3. A subcategory can now own admin SEO (title/meta/canonical/OG/intro) and
--    FAQs, exactly as a discipline does. Both read LandingEntityType.
ALTER TYPE "LandingEntityType" ADD VALUE IF NOT EXISTS 'SUBCATEGORY';

-- 4. ...and can be the subject of a page-view beacon.
ALTER TYPE "AnalyticsEntityType" ADD VALUE IF NOT EXISTS 'SUBCATEGORY';
