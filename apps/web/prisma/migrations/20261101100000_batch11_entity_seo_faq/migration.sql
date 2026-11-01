-- Batch 11 — Editorial landing-page SEO & FAQ (additive).
-- New enum LandingEntityType + polymorphic EntitySeo and EntityFaq tables. No
-- existing table altered; no data reset. The generated diff's DROP INDEX / ALTER
-- COLUMN on Article.searchVector (Prisma cannot model the generated tsvector column
-- + GIN index) was STRIPPED by hand per MIGRATION_STATUS.md — FTS fully preserved.

-- CreateEnum
CREATE TYPE "LandingEntityType" AS ENUM ('DISCIPLINE', 'CATEGORY', 'RODEO_HUB', 'RODEO_EVENT', 'RODEO_EDITION');



-- CreateTable
CREATE TABLE "EntitySeo" (
    "id" TEXT NOT NULL,
    "entityType" "LandingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalOverride" TEXT,
    "ogImage" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "intro" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitySeo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityFaq" (
    "id" TEXT NOT NULL,
    "entityType" "LandingEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntitySeo_entityType_idx" ON "EntitySeo"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "EntitySeo_entityType_entityId_key" ON "EntitySeo"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityFaq_entityType_entityId_sortOrder_idx" ON "EntityFaq"("entityType", "entityId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "EntityFaq_entityType_entityId_question_key" ON "EntityFaq"("entityType", "entityId", "question");

