-- Batch 28: CMS gap remediation — section config, info pages, quick-access support.
-- All operations are additive (no destructive changes to existing tables or data).

-- 1. Add SECTION to LandingEntityType enum
ALTER TYPE "LandingEntityType" ADD VALUE 'SECTION';

-- 2. Add nullable description column to NavigationItem (for quick-access card text)
ALTER TABLE "NavigationItem" ADD COLUMN "description" TEXT;

-- 3. Create SectionConfig table for CMS-editable section display metadata
CREATE TABLE "SectionConfig" (
    "id" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "displayName" TEXT,
    "tagline" TEXT,
    "description" TEXT,
    "heroImage" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionConfig_sectionKey_key" ON "SectionConfig"("sectionKey");

-- 4. Create InfoPageStatus enum
CREATE TYPE "InfoPageStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED');

-- 5. Create InfoPage table for CMS-editable legal/informational pages
CREATE TABLE "InfoPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "status" "InfoPageStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfoPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InfoPage_slug_key" ON "InfoPage"("slug");
