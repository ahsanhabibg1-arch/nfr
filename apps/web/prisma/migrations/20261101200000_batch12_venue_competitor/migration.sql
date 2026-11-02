-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LandingEntityType" ADD VALUE 'VENUE';
ALTER TYPE "LandingEntityType" ADD VALUE 'COMPETITOR';

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "openedYear" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "knownAs" TEXT,
    "summary" TEXT,
    "guide" JSONB,
    "hometownCity" TEXT,
    "state" TEXT,
    "country" TEXT,
    "birthYear" INTEGER,
    "status" TEXT,
    "heroImage" TEXT,
    "imageCredit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorDiscipline" (
    "competitorId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,

    CONSTRAINT "CompetitorDiscipline_pkey" PRIMARY KEY ("competitorId","disciplineId")
);

-- CreateTable
CREATE TABLE "CompetitorParticipation" (
    "competitorId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "result" TEXT,
    "placement" INTEGER,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompetitorParticipation_pkey" PRIMARY KEY ("competitorId","editionId")
);

-- CreateTable
CREATE TABLE "ArticleCompetitor" (
    "articleId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,

    CONSTRAINT "ArticleCompetitor_pkey" PRIMARY KEY ("articleId","competitorId")
);

-- CreateTable
CREATE TABLE "CompetitorMedia" (
    "competitorId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompetitorMedia_pkey" PRIMARY KEY ("competitorId","mediaId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_slug_key" ON "Competitor"("slug");

-- CreateIndex
CREATE INDEX "CompetitorDiscipline_disciplineId_idx" ON "CompetitorDiscipline"("disciplineId");

-- CreateIndex
CREATE INDEX "CompetitorParticipation_editionId_idx" ON "CompetitorParticipation"("editionId");

-- CreateIndex
CREATE INDEX "ArticleCompetitor_competitorId_idx" ON "ArticleCompetitor"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitorMedia_mediaId_idx" ON "CompetitorMedia"("mediaId");

-- AddForeignKey
ALTER TABLE "CompetitorDiscipline" ADD CONSTRAINT "CompetitorDiscipline_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorDiscipline" ADD CONSTRAINT "CompetitorDiscipline_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorParticipation" ADD CONSTRAINT "CompetitorParticipation_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorParticipation" ADD CONSTRAINT "CompetitorParticipation_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "RodeoEventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCompetitor" ADD CONSTRAINT "ArticleCompetitor_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCompetitor" ADD CONSTRAINT "ArticleCompetitor_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorMedia" ADD CONSTRAINT "CompetitorMedia_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorMedia" ADD CONSTRAINT "CompetitorMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

