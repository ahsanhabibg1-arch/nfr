-- CreateEnum
CREATE TYPE "SeoFindingKind" AS ENUM ('DEFECT', 'RECOMMENDATION', 'OPPORTUNITY', 'NOT_PERFORMED');

-- AlterEnum
ALTER TYPE "SeoFindingStatus" ADD VALUE 'REOPENED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SeoSeverity" ADD VALUE 'HIGH';
ALTER TYPE "SeoSeverity" ADD VALUE 'MEDIUM';
ALTER TYPE "SeoSeverity" ADD VALUE 'LOW';
ALTER TYPE "SeoSeverity" ADD VALUE 'INFO';

-- AlterTable
ALTER TABLE "SeoAuditRun" ADD COLUMN     "summary" JSONB,
ADD COLUMN     "totalFindings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "triggeredById" TEXT;

-- AlterTable
ALTER TABLE "SeoFinding" ADD COLUMN     "affectedUrl" TEXT,
ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'technical',
ADD COLUMN     "detail" JSONB,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT NOT NULL DEFAULT 'article',
ADD COLUMN     "kind" "SeoFindingKind" NOT NULL DEFAULT 'DEFECT',
ADD COLUMN     "recommendation" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "ruleCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ruleVersion" TEXT NOT NULL DEFAULT '1';

-- AlterTable
ALTER TABLE "SeoRule" ADD COLUMN     "appliesTo" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'technical',
ADD COLUMN     "config" JSONB,
ADD COLUMN     "defaultKind" "SeoFindingKind" NOT NULL DEFAULT 'DEFECT',
ADD COLUMN     "ruleVersion" TEXT NOT NULL DEFAULT '1',
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "SeoConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SeoAuditRun_startedAt_idx" ON "SeoAuditRun"("startedAt");

-- CreateIndex
CREATE INDEX "SeoFinding_severity_idx" ON "SeoFinding"("severity");

-- CreateIndex
CREATE INDEX "SeoFinding_entityType_entityId_idx" ON "SeoFinding"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SeoFinding_category_idx" ON "SeoFinding"("category");

