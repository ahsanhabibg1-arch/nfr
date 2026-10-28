-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ImageRightsStatus" AS ENUM ('STAFF_PHOTO', 'EDITORIAL_POOL', 'PRCA_ARCHIVE', 'LICENSED_CREATIVE', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "SourceClassification" AS ENUM ('OFFICIAL', 'INDEPENDENT_REFERENCE', 'HISTORICAL_ARCHIVE');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('VERIFIED', 'NEEDS_REVIEW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SeoSeverity" AS ENUM ('CRITICAL', 'WARNING', 'NOTICE', 'PASSED');

-- CreateEnum
CREATE TYPE "SeoFindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "RedirectStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "avatar" TEXT,
    "bio" TEXT,
    "credentials" TEXT,
    "editorialBeat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deck" TEXT,
    "excerpt" TEXT NOT NULL,
    "imageSeoTitle" TEXT,
    "imageAltText" TEXT,
    "subcategory" TEXT,
    "articleType" TEXT NOT NULL,
    "workflowStatus" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "readTime" TEXT,
    "wordCount" INTEGER,
    "isLeadHero" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "heroImageUrl" TEXT,
    "imageCredit" TEXT,
    "imageCaption" TEXT,
    "imageRightsStatus" "ImageRightsStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "disclosureType" TEXT NOT NULL DEFAULT 'editorial-independent',
    "disclosureNote" TEXT,
    "takeaways" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRelation" (
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "ArticleRelation_pkey" PRIMARY KEY ("sourceId","targetId")
);

-- CreateTable
CREATE TABLE "ArticleBlock" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "blockType" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "ArticleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSeo" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "ogImage" TEXT,
    "robots" TEXT NOT NULL DEFAULT 'index, follow',
    "structuredDataType" TEXT NOT NULL DEFAULT 'Article',

    CONSTRAINT "ArticleSeo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRevision" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialWorkflowHistory" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "fromStatus" "WorkflowStatus",
    "toStatus" "WorkflowStatus" NOT NULL,
    "actorName" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialWorkflowHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTag" (
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publisher" TEXT,
    "type" TEXT,
    "classification" "SourceClassification" NOT NULL DEFAULT 'INDEPENDENT_REFERENCE',
    "status" "SourceStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "verificationDate" TIMESTAMP(3),

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSource" (
    "articleId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleSource_pkey" PRIMARY KEY ("articleId","sourceId")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "dimensions" TEXT,
    "bytes" INTEGER,
    "format" TEXT,
    "seoTitle" TEXT,
    "altText" TEXT,
    "credit" TEXT,
    "rightsStatus" "ImageRightsStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleMedia" (
    "articleId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "usageKey" TEXT NOT NULL,
    "altText" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleMedia_pkey" PRIMARY KEY ("articleId","usageKey")
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "category" TEXT,
    "tagline" TEXT,
    "summary" TEXT NOT NULL,
    "image" TEXT,
    "imageCredit" TEXT,
    "guide" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RodeoHub" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "region" TEXT,
    "circuitType" TEXT,
    "description" TEXT,
    "annualEventsCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RodeoHub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RodeoEvent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "traditionalMonth" TEXT,
    "status" TEXT,
    "description" TEXT,
    "organizerName" TEXT,
    "officialUrl" TEXT,
    "isFlagship" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RodeoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RodeoEventEdition" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "editionSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "timezone" TEXT,
    "purseBenchmark" TEXT,
    "venueId" TEXT,

    CONSTRAINT "RodeoEventEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDiscipline" (
    "disciplineId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventSlugRef" TEXT NOT NULL,

    CONSTRAINT "EventDiscipline_pkey" PRIMARY KEY ("disciplineId","eventId")
);

-- CreateTable
CREATE TABLE "ArticleDiscipline" (
    "articleId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "ArticleDiscipline_pkey" PRIMARY KEY ("articleId","disciplineId")
);

-- CreateTable
CREATE TABLE "ArticleHub" (
    "articleId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,

    CONSTRAINT "ArticleHub_pkey" PRIMARY KEY ("articleId","hubId")
);

-- CreateTable
CREATE TABLE "ArticleEvent" (
    "articleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "ArticleEvent_pkey" PRIMARY KEY ("articleId","eventId")
);

-- CreateTable
CREATE TABLE "ArticleEdition" (
    "articleId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,

    CONSTRAINT "ArticleEdition_pkey" PRIMARY KEY ("articleId","editionId")
);

-- CreateTable
CREATE TABLE "ArticleRedirect" (
    "id" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 308,
    "status" "RedirectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "severity" "SeoSeverity" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "SeoRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAuditRun" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'completed',

    CONSTRAINT "SeoAuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoFinding" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "auditRunId" TEXT,
    "articleId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "severity" "SeoSeverity" NOT NULL,
    "status" "SeoFindingStatus" NOT NULL DEFAULT 'OPEN',
    "evidence" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "UserAccountStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Author_slug_key" ON "Author"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_workflowStatus_idx" ON "Article"("workflowStatus");

-- CreateIndex
CREATE INDEX "Article_categoryId_idx" ON "Article"("categoryId");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

-- CreateIndex
CREATE INDEX "Article_workflowStatus_publishedAt_idx" ON "Article"("workflowStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "ArticleBlock_articleId_idx" ON "ArticleBlock"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleBlock_articleId_sortOrder_key" ON "ArticleBlock"("articleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleSeo_articleId_key" ON "ArticleSeo"("articleId");

-- CreateIndex
CREATE INDEX "ArticleRevision_articleId_createdAt_idx" ON "ArticleRevision"("articleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRevision_articleId_revisionNo_key" ON "ArticleRevision"("articleId", "revisionNo");

-- CreateIndex
CREATE INDEX "EditorialWorkflowHistory_articleId_createdAt_idx" ON "EditorialWorkflowHistory"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_status_idx" ON "Source"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ArticleMedia_mediaId_idx" ON "ArticleMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_slug_key" ON "Discipline"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RodeoHub_slug_key" ON "RodeoHub"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RodeoEvent_slug_key" ON "RodeoEvent"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RodeoEventEdition_eventId_editionSlug_key" ON "RodeoEventEdition"("eventId", "editionSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRedirect_sourcePath_key" ON "ArticleRedirect"("sourcePath");

-- CreateIndex
CREATE UNIQUE INDEX "SeoRule_code_key" ON "SeoRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SeoFinding_fingerprint_key" ON "SeoFinding"("fingerprint");

-- CreateIndex
CREATE INDEX "SeoFinding_status_idx" ON "SeoFinding"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_createdAt_idx" ON "AuditLog"("entityType", "createdAt");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRelation" ADD CONSTRAINT "ArticleRelation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRelation" ADD CONSTRAINT "ArticleRelation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleBlock" ADD CONSTRAINT "ArticleBlock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSeo" ADD CONSTRAINT "ArticleSeo_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevision" ADD CONSTRAINT "ArticleRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialWorkflowHistory" ADD CONSTRAINT "EditorialWorkflowHistory_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleMedia" ADD CONSTRAINT "ArticleMedia_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleMedia" ADD CONSTRAINT "ArticleMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoEventEdition" ADD CONSTRAINT "RodeoEventEdition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RodeoEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoEventEdition" ADD CONSTRAINT "RodeoEventEdition_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDiscipline" ADD CONSTRAINT "EventDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleDiscipline" ADD CONSTRAINT "ArticleDiscipline_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleDiscipline" ADD CONSTRAINT "ArticleDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleHub" ADD CONSTRAINT "ArticleHub_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleHub" ADD CONSTRAINT "ArticleHub_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "RodeoHub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEvent" ADD CONSTRAINT "ArticleEvent_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEvent" ADD CONSTRAINT "ArticleEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RodeoEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEdition" ADD CONSTRAINT "ArticleEdition_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEdition" ADD CONSTRAINT "ArticleEdition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "RodeoEventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoFinding" ADD CONSTRAINT "SeoFinding_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SeoRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoFinding" ADD CONSTRAINT "SeoFinding_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "SeoAuditRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoFinding" ADD CONSTRAINT "SeoFinding_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

