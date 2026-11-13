-- Batch 04-E — managed Article Type taxonomy.
--
-- PURELY ADDITIVE. One enum, one table, five indexes. It does not touch
-- "Article", so no article row is read, rewritten or locked for update by this
-- migration, and `Article"."articleType"` keeps its existing TEXT column and
-- every value it holds.
--
-- ORDERING. This migration comes after 20261113071524_add_managed_subcategory
-- and is independent of it: neither references the other's objects, so either
-- order would apply cleanly. The timestamp keeps the recorded history linear.
--
-- ROLLBACK. `DROP TABLE "ArticleType"; DROP TYPE "ArticleSchemaType";` restores
-- the prior schema exactly, because nothing outside these two objects changed.
-- Application code falls back to the in-repository compatibility registry when
-- the table is absent, so the rollback does not require a code rollback.

-- CreateEnum
CREATE TYPE "ArticleSchemaType" AS ENUM ('ARTICLE', 'NEWS_ARTICLE');

-- CreateTable
CREATE TABLE "ArticleType" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "selectable" BOOLEAN NOT NULL DEFAULT true,
    "evergreen" BOOLEAN NOT NULL DEFAULT false,
    "schemaType" "ArticleSchemaType" NOT NULL DEFAULT 'ARTICLE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Exact uniqueness, not case-folded: the compatibility vocabulary legitimately
-- contains both "News" and the legacy "news", so lower(value) cannot be unique
-- in this column. Case-collision on CREATE is refused in the service layer.
CREATE UNIQUE INDEX "ArticleType_value_key" ON "ArticleType"("value");

-- CreateIndex
CREATE INDEX "ArticleType_sortOrder_idx" ON "ArticleType"("sortOrder");

-- CreateIndex
CREATE INDEX "ArticleType_selectable_idx" ON "ArticleType"("selectable");

-- CreateIndex
CREATE INDEX "ArticleType_archivedAt_idx" ON "ArticleType"("archivedAt");
