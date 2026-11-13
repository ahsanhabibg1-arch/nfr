-- Batch 05 — managed Discipline Classification taxonomy.
--
-- PURELY ADDITIVE. One table, four indexes, one nullable column on
-- "Discipline" and one foreign key. No row is rewritten: the new column is
-- NULLABLE with no default, so adding it is a catalog-only change in
-- PostgreSQL 11+ and "Discipline" is not rewritten or scanned for a backfill.
-- "Discipline"."category" keeps its TEXT column and every value it holds.
--
-- ORDERING. This migration comes after 20261113071524_add_managed_subcategory
-- and 20261113090000_add_managed_article_type. It is independent of both —
-- neither references this table and this references neither of theirs — so the
-- timestamp exists only to keep the recorded history linear. No existing
-- migration file was edited.
--
-- WHY THE FOREIGN KEY POINTS AT AN ID. The previous design stored the display
-- label itself in "Discipline"."category", which made the name the relationship
-- key: renaming a classification orphaned every discipline still holding the
-- old string. "classificationId" references a stable id, so a rename is one
-- UPDATE to one row in "DisciplineClassification" and every discipline follows.
--
-- ON DELETE RESTRICT is the deletion guard, enforced here rather than only in
-- the service: a classification that any discipline still references cannot be
-- deleted, by any route. ON UPDATE RESTRICT matches, since ids never change.
--
-- ROLLBACK. The exact inverse, and it needs no code rollback because the
-- application falls back to the legacy "category" text when this table is
-- absent or empty:
--
--   ALTER TABLE "Discipline" DROP CONSTRAINT "Discipline_classificationId_fkey";
--   DROP INDEX "Discipline_classificationId_idx";
--   ALTER TABLE "Discipline" DROP COLUMN "classificationId";
--   DROP TABLE "DisciplineClassification";
--
-- SEEDING is deliberately NOT part of this migration. The two existing
-- classifications are created, and existing disciplines attached, by the
-- separate idempotent bootstrap (lib/cms/disciplineClassificationBootstrap.ts),
-- so that applying the schema and changing data stay two reviewable steps.

-- AlterTable
ALTER TABLE "Discipline" ADD COLUMN     "classificationId" TEXT;

-- CreateTable
CREATE TABLE "DisciplineClassification" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pluralName" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisciplineClassification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The immutable machine identity. Exact-unique; for the two pre-existing
-- classifications it equals the legacy "Discipline"."category" text, which is
-- what lets the bootstrap match existing rows without rewriting them.
CREATE UNIQUE INDEX "DisciplineClassification_value_key" ON "DisciplineClassification"("value");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineClassification_slug_key" ON "DisciplineClassification"("slug");

-- CreateIndex
CREATE INDEX "DisciplineClassification_sortOrder_idx" ON "DisciplineClassification"("sortOrder");

-- CreateIndex
CREATE INDEX "DisciplineClassification_active_idx" ON "DisciplineClassification"("active");

-- CreateIndex
CREATE INDEX "Discipline_classificationId_idx" ON "Discipline"("classificationId");

-- AddForeignKey
ALTER TABLE "Discipline" ADD CONSTRAINT "Discipline_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "DisciplineClassification"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
