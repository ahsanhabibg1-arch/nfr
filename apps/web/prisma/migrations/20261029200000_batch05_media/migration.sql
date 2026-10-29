-- CreateEnum
CREATE TYPE "MediaLicenseType" AS ENUM ('OWNED', 'LICENSED', 'PERMISSION_GRANTED', 'PUBLIC_DOMAIN', 'OTHER', 'UNCONFIRMED');

-- CreateEnum
CREATE TYPE "MediaProcessingStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('DRAFT', 'PUBLIC', 'ARCHIVED');

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "copyrightHolder" TEXT,
ADD COLUMN     "derivatives" JSONB,
ADD COLUMN     "extension" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "licenseSourceUrl" TEXT,
ADD COLUMN     "licenseType" "MediaLicenseType" NOT NULL DEFAULT 'UNCONFIRMED',
ADD COLUMN     "processingStatus" "MediaProcessingStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "rightsConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rightsConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "rightsConfirmedById" TEXT,
ADD COLUMN     "safeFilename" TEXT,
ADD COLUMN     "sourceAttribution" TEXT,
ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'legacy-local',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploadedById" TEXT,
ADD COLUMN     "usageRestrictions" TEXT,
ADD COLUMN     "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "RodeoHubMedia" (
    "hubId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RodeoHubMedia_pkey" PRIMARY KEY ("hubId","mediaId")
);

-- CreateTable
CREATE TABLE "RodeoEventMedia" (
    "eventId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RodeoEventMedia_pkey" PRIMARY KEY ("eventId","mediaId")
);

-- CreateTable
CREATE TABLE "RodeoEventEditionMedia" (
    "editionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RodeoEventEditionMedia_pkey" PRIMARY KEY ("editionId","mediaId")
);

-- CreateTable
CREATE TABLE "DisciplineMedia" (
    "disciplineId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DisciplineMedia_pkey" PRIMARY KEY ("disciplineId","mediaId")
);

-- CreateTable
CREATE TABLE "VenueMedia" (
    "venueId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VenueMedia_pkey" PRIMARY KEY ("venueId","mediaId")
);

-- CreateIndex
CREATE INDEX "RodeoHubMedia_mediaId_idx" ON "RodeoHubMedia"("mediaId");

-- CreateIndex
CREATE INDEX "RodeoEventMedia_mediaId_idx" ON "RodeoEventMedia"("mediaId");

-- CreateIndex
CREATE INDEX "RodeoEventEditionMedia_mediaId_idx" ON "RodeoEventEditionMedia"("mediaId");

-- CreateIndex
CREATE INDEX "DisciplineMedia_mediaId_idx" ON "DisciplineMedia"("mediaId");

-- CreateIndex
CREATE INDEX "VenueMedia_mediaId_idx" ON "VenueMedia"("mediaId");

-- CreateIndex
CREATE INDEX "MediaAsset_visibility_processingStatus_idx" ON "MediaAsset"("visibility", "processingStatus");

-- CreateIndex
CREATE INDEX "MediaAsset_uploadedById_idx" ON "MediaAsset"("uploadedById");

-- CreateIndex
CREATE INDEX "MediaAsset_checksum_idx" ON "MediaAsset"("checksum");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoHubMedia" ADD CONSTRAINT "RodeoHubMedia_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "RodeoHub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoHubMedia" ADD CONSTRAINT "RodeoHubMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoEventMedia" ADD CONSTRAINT "RodeoEventMedia_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RodeoEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoEventMedia" ADD CONSTRAINT "RodeoEventMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoEventEditionMedia" ADD CONSTRAINT "RodeoEventEditionMedia_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "RodeoEventEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoEventEditionMedia" ADD CONSTRAINT "RodeoEventEditionMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineMedia" ADD CONSTRAINT "DisciplineMedia_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineMedia" ADD CONSTRAINT "DisciplineMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueMedia" ADD CONSTRAINT "VenueMedia_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueMedia" ADD CONSTRAINT "VenueMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

