-- Batch 08 — Monetization & Affiliate Management (additive).
-- New enums + 10 monetization models + 2 Article back-relations (FKs only).
-- No existing table altered destructively; no data reset. Generated offline,
-- applied via migrate deploy to dev + test. Commercial data is kept separate
-- from editorial facts; no credentials/secrets are stored.

-- CreateEnum
CREATE TYPE "AffiliateCategory" AS ENUM ('STREAMING', 'TICKETS', 'TRAVEL', 'APPAREL', 'BOOTS', 'ACCESSORIES', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MonetizationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AffiliateRelAttribute" AS ENUM ('SPONSORED', 'NOFOLLOW', 'SPONSORED_NOFOLLOW', 'UGC');

-- CreateEnum
CREATE TYPE "AdPlacementSlot" AS ENUM ('HOMEPAGE', 'ARTICLE_HEADER', 'ARTICLE_INCONTENT', 'ARTICLE_FOOTER', 'CATEGORY', 'RODEO_EVENT', 'SIDEBAR');

-- CreateEnum
CREATE TYPE "CommercialEntityType" AS ENUM ('ARTICLE', 'RODEO_HUB', 'RODEO_EVENT', 'RODEO_EDITION', 'DISCIPLINE', 'CATEGORY');

-- NOTE: `migrate diff` wanted to DROP "Article"."searchVector" (the Batch 07 FTS
-- generated column) because it is a DB-managed column intentionally not declared in
-- the Prisma schema. Those DROP statements were removed so this migration stays
-- additive and never breaks full-text search. The column is now declared as
-- Unsupported("tsvector") in the schema so future diffs no longer try to drop it.

-- CreateTable
CREATE TABLE "AffiliatePartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "category" "AffiliateCategory" NOT NULL DEFAULT 'OTHER',
    "programType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "PartnerVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "complianceNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programType" TEXT,
    "category" "AffiliateCategory" NOT NULL DEFAULT 'OTHER',
    "defaultRel" "AffiliateRelAttribute" NOT NULL DEFAULT 'SPONSORED_NOFOLLOW',
    "status" "MonetizationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "programId" TEXT,
    "label" TEXT NOT NULL,
    "merchantUrl" TEXT NOT NULL,
    "trackingUrl" TEXT,
    "category" "AffiliateCategory" NOT NULL DEFAULT 'OTHER',
    "rel" "AffiliateRelAttribute" NOT NULL DEFAULT 'SPONSORED_NOFOLLOW',
    "status" "MonetizationStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "editorialContext" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePlacement" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "entityType" "CommercialEntityType" NOT NULL DEFAULT 'ARTICLE',
    "entityId" TEXT NOT NULL,
    "articleId" TEXT,
    "position" TEXT,
    "status" "MonetizationStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "proposedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPlacement" (
    "id" TEXT NOT NULL,
    "slot" "AdPlacementSlot" NOT NULL,
    "name" TEXT NOT NULL,
    "pageScope" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "device" TEXT NOT NULL DEFAULT 'all',
    "position" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "responsive" BOOLEAN NOT NULL DEFAULT true,
    "adUnitConfig" JSONB,
    "complianceNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetizationDisclosure" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requiredProminent" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "partnerId" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetizationDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsoredContentRelationship" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "partnerId" TEXT,
    "sponsorName" TEXT NOT NULL,
    "disclosureLabel" TEXT NOT NULL DEFAULT 'Sponsored',
    "rel" "AffiliateRelAttribute" NOT NULL DEFAULT 'SPONSORED',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "status" "MonetizationStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsoredContentRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialEntityAssociation" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "entityType" "CommercialEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "note" TEXT,
    "status" "MonetizationStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialEntityAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetizationConfiguration" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetizationConfiguration_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AffiliateClickAggregate" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClickAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePartner_slug_key" ON "AffiliatePartner"("slug");

-- CreateIndex
CREATE INDEX "AffiliatePartner_isActive_verificationStatus_idx" ON "AffiliatePartner"("isActive", "verificationStatus");

-- CreateIndex
CREATE INDEX "AffiliatePartner_category_idx" ON "AffiliatePartner"("category");

-- CreateIndex
CREATE INDEX "AffiliateProgram_partnerId_idx" ON "AffiliateProgram"("partnerId");

-- CreateIndex
CREATE INDEX "AffiliateLink_partnerId_idx" ON "AffiliateLink"("partnerId");

-- CreateIndex
CREATE INDEX "AffiliateLink_isActive_status_idx" ON "AffiliateLink"("isActive", "status");

-- CreateIndex
CREATE INDEX "AffiliateLink_category_idx" ON "AffiliateLink"("category");

-- CreateIndex
CREATE INDEX "AffiliatePlacement_entityType_entityId_idx" ON "AffiliatePlacement"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AffiliatePlacement_articleId_idx" ON "AffiliatePlacement"("articleId");

-- CreateIndex
CREATE INDEX "AffiliatePlacement_linkId_idx" ON "AffiliatePlacement"("linkId");

-- CreateIndex
CREATE INDEX "AdPlacement_pageScope_enabled_idx" ON "AdPlacement"("pageScope", "enabled");

-- CreateIndex
CREATE INDEX "AdPlacement_slot_idx" ON "AdPlacement"("slot");

-- CreateIndex
CREATE UNIQUE INDEX "MonetizationDisclosure_key_key" ON "MonetizationDisclosure"("key");

-- CreateIndex
CREATE INDEX "MonetizationDisclosure_scope_idx" ON "MonetizationDisclosure"("scope");

-- CreateIndex
CREATE INDEX "SponsoredContentRelationship_articleId_idx" ON "SponsoredContentRelationship"("articleId");

-- CreateIndex
CREATE INDEX "SponsoredContentRelationship_partnerId_idx" ON "SponsoredContentRelationship"("partnerId");

-- CreateIndex
CREATE INDEX "CommercialEntityAssociation_entityType_entityId_idx" ON "CommercialEntityAssociation"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CommercialEntityAssociation_partnerId_idx" ON "CommercialEntityAssociation"("partnerId");

-- CreateIndex
CREATE INDEX "AffiliateClickAggregate_day_idx" ON "AffiliateClickAggregate"("day");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateClickAggregate_linkId_day_key" ON "AffiliateClickAggregate"("linkId", "day");

-- AddForeignKey
ALTER TABLE "AffiliateProgram" ADD CONSTRAINT "AffiliateProgram_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePlacement" ADD CONSTRAINT "AffiliatePlacement_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePlacement" ADD CONSTRAINT "AffiliatePlacement_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationDisclosure" ADD CONSTRAINT "MonetizationDisclosure_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredContentRelationship" ADD CONSTRAINT "SponsoredContentRelationship_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsoredContentRelationship" ADD CONSTRAINT "SponsoredContentRelationship_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialEntityAssociation" ADD CONSTRAINT "CommercialEntityAssociation_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClickAggregate" ADD CONSTRAINT "AffiliateClickAggregate_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

