-- Batch 07 — Analytics & Search Intelligence (additive).
-- New enums + analytics/search event, aggregate, provider and config tables, plus a
-- DB-managed full-text search vector on Article. No existing table is altered
-- destructively and no data is reset. Generated offline (least-privilege roles
-- cannot create the shadow DB `migrate dev` needs) and applied via `migrate deploy`.

-- CreateEnum
CREATE TYPE "AnalyticsEntityType" AS ENUM ('ARTICLE', 'DISCIPLINE', 'CATEGORY', 'SECTION', 'RODEO_HUB', 'RODEO_EVENT', 'RODEO_EDITION');

-- CreateEnum
CREATE TYPE "AnalyticsProvider" AS ENUM ('FIRST_PARTY', 'INTERNAL_SEARCH', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE_ANALYTICS_4');

-- CreateEnum
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONFIGURED', 'CONNECTED', 'SYNCING', 'ERROR', 'DISABLED');

-- CreateTable
CREATE TABLE "SearchQueryEvent" (
    "id" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "queryLength" INTEGER NOT NULL DEFAULT 0,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "zeroResult" BOOLEAN NOT NULL DEFAULT false,
    "contentType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQueryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchResultClickEvent" (
    "id" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "entityType" "AnalyticsEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchResultClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentViewEvent" (
    "id" TEXT NOT NULL,
    "entityType" "AnalyticsEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyAggregate" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDailyAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsProviderConnection" (
    "id" TEXT NOT NULL,
    "provider" "AnalyticsProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "propertyRef" TEXT,
    "configuredById" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "AnalyticsProvider" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rowsIngested" INTEGER NOT NULL DEFAULT 0,
    "errorCategory" TEXT,

    CONSTRAINT "AnalyticsSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SearchQueryEvent_createdAt_idx" ON "SearchQueryEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SearchQueryEvent_normalizedQuery_idx" ON "SearchQueryEvent"("normalizedQuery");

-- CreateIndex
CREATE INDEX "SearchQueryEvent_zeroResult_createdAt_idx" ON "SearchQueryEvent"("zeroResult", "createdAt");

-- CreateIndex
CREATE INDEX "SearchResultClickEvent_createdAt_idx" ON "SearchResultClickEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SearchResultClickEvent_normalizedQuery_idx" ON "SearchResultClickEvent"("normalizedQuery");

-- CreateIndex
CREATE INDEX "SearchResultClickEvent_entityType_entityId_idx" ON "SearchResultClickEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ContentViewEvent_createdAt_idx" ON "ContentViewEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ContentViewEvent_entityType_entityId_createdAt_idx" ON "ContentViewEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsDailyAggregate_metric_day_idx" ON "AnalyticsDailyAggregate"("metric", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyAggregate_day_metric_entityType_entityId_key" ON "AnalyticsDailyAggregate"("day", "metric", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsProviderConnection_provider_key" ON "AnalyticsProviderConnection"("provider");

-- CreateIndex
CREATE INDEX "AnalyticsSyncRun_provider_startedAt_idx" ON "AnalyticsSyncRun"("provider", "startedAt");

-- AddForeignKey
ALTER TABLE "AnalyticsSyncRun" ADD CONSTRAINT "AnalyticsSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AnalyticsProviderConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Full-text search: a DB-managed generated tsvector column on Article + GIN index.
-- STORED + generated-always so it is always consistent with the row and needs no
-- trigger. `to_tsvector` is IMMUTABLE here because it is given an explicit regconfig
-- literal ('english'::regconfig), which a generated column requires. Weighting:
--   A = title, B = deck + excerpt, C = subcategory + articleType.
-- Queried with parameterized websearch_to_tsquery via $queryRaw (see
-- lib/search/publicSearch.ts). Intentionally not represented in the Prisma model.
-- ----------------------------------------------------------------------------
ALTER TABLE "Article" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce("deck", '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("subcategory", '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, coalesce("articleType", '')), 'C')
  ) STORED;

-- GIN index for fast full-text matching against the weighted vector.
CREATE INDEX "Article_searchVector_idx" ON "Article" USING GIN ("searchVector");
