-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CoverageVerification" AS ENUM ('UNVERIFIED', 'VERIFIED', 'CORRECTION_REQUIRED');

-- CreateEnum
CREATE TYPE "CompetitionSessionStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'POSTPONED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CompetitionResultType" AS ENUM ('TIME', 'SCORE', 'NO_TIME', 'NO_SCORE', 'DISQUALIFIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "StandingCategory" AS ENUM ('ROUND', 'AGGREGATE', 'CHAMPIONSHIP', 'SEASON');

-- CreateTable
CREATE TABLE "CompetitionSession" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "disciplineId" TEXT,
    "venueId" TEXT,
    "date" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "sessionType" TEXT NOT NULL,
    "roundNumber" INTEGER,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "timezone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "CompetitionSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "coverageStatus" "CoverageStatus" NOT NULL DEFAULT 'DRAFT',
    "verification" "CoverageVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionResult" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "sessionId" TEXT,
    "competitorId" TEXT NOT NULL,
    "resultType" "CompetitionResultType" NOT NULL,
    "scoreNumeric" DECIMAL(10,3),
    "timeSeconds" DECIMAL(10,3),
    "placement" INTEGER,
    "isTie" BOOLEAN NOT NULL DEFAULT false,
    "coverageStatus" "CoverageStatus" NOT NULL DEFAULT 'DRAFT',
    "verification" "CoverageVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "correctionOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionStanding" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "disciplineId" TEXT,
    "competitorId" TEXT NOT NULL,
    "category" "StandingCategory" NOT NULL,
    "rankPosition" INTEGER,
    "aggregateValue" DECIMAL(12,3),
    "earnings" DECIMAL(14,2),
    "points" DECIMAL(12,3),
    "coverageStatus" "CoverageStatus" NOT NULL DEFAULT 'DRAFT',
    "verification" "CoverageVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionStanding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionSession_editionId_sortOrder_idx" ON "CompetitionSession"("editionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CompetitionSession_editionId_disciplineId_idx" ON "CompetitionSession"("editionId", "disciplineId");

-- CreateIndex
CREATE INDEX "CompetitionResult_editionId_disciplineId_idx" ON "CompetitionResult"("editionId", "disciplineId");

-- CreateIndex
CREATE INDEX "CompetitionResult_competitorId_idx" ON "CompetitionResult"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitionResult_sessionId_idx" ON "CompetitionResult"("sessionId");

-- CreateIndex
CREATE INDEX "CompetitionStanding_editionId_category_disciplineId_idx" ON "CompetitionStanding"("editionId", "category", "disciplineId");

-- CreateIndex
CREATE INDEX "CompetitionStanding_competitorId_idx" ON "CompetitionStanding"("competitorId");

-- AddForeignKey
ALTER TABLE "CompetitionSession" ADD CONSTRAINT "CompetitionSession_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "RodeoEventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionSession" ADD CONSTRAINT "CompetitionSession_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionSession" ADD CONSTRAINT "CompetitionSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResult" ADD CONSTRAINT "CompetitionResult_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "RodeoEventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResult" ADD CONSTRAINT "CompetitionResult_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResult" ADD CONSTRAINT "CompetitionResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CompetitionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResult" ADD CONSTRAINT "CompetitionResult_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResult" ADD CONSTRAINT "CompetitionResult_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "CompetitionResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionStanding" ADD CONSTRAINT "CompetitionStanding_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "RodeoEventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionStanding" ADD CONSTRAINT "CompetitionStanding_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionStanding" ADD CONSTRAINT "CompetitionStanding_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

