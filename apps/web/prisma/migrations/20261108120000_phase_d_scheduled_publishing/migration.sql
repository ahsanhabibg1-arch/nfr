-- Phase D: Add scheduledById to PageLayout for audit trail on scheduled publications.
-- The scheduledSections and scheduledAt columns already exist from the initial PageLayout migration.
ALTER TABLE "PageLayout" ADD COLUMN "scheduledById" TEXT;
