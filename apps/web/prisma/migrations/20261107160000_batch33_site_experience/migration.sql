-- Batch 33: Unified Site Experience — Announcements, Global Blocks, SiteConfig, PageLayout extensions

-- Announcement type enum
CREATE TYPE "AnnouncementType" AS ENUM ('BREAKING', 'INFO');

-- Global block type enum
CREATE TYPE "GlobalBlockType" AS ENUM ('MESSAGE', 'CTA', 'FEATURED_STORY');

-- Extend PageLayout with scheduling and concurrency
ALTER TABLE "PageLayout" ADD COLUMN "scheduledSections" JSONB;
ALTER TABLE "PageLayout" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "PageLayout" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Announcement table
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL DEFAULT 'INFO',
    "text" TEXT NOT NULL,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "articleId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- GlobalBlock table
CREATE TABLE "GlobalBlock" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "type" "GlobalBlockType" NOT NULL DEFAULT 'MESSAGE',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaAlt" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "articleId" TEXT,
    "placements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalBlock_pkey" PRIMARY KEY ("id")
);

-- SiteConfig table (keyed documents for footer, appearance, etc.)
CREATE TABLE "SiteConfig" (
    "key" TEXT NOT NULL,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "published" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("key")
);
