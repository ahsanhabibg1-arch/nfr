-- Add provenance and administrative metadata without reclassifying historical rows.
CREATE TYPE "RedirectOrigin" AS ENUM ('AUTOMATIC', 'MANUAL', 'LEGACY');

ALTER TABLE "ArticleRedirect"
  ADD COLUMN "origin" "RedirectOrigin" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

CREATE INDEX "ArticleRedirect_status_updatedAt_idx" ON "ArticleRedirect"("status", "updatedAt");
CREATE INDEX "ArticleRedirect_origin_updatedAt_idx" ON "ArticleRedirect"("origin", "updatedAt");

ALTER TABLE "ArticleRedirect"
  ADD CONSTRAINT "ArticleRedirect_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArticleRedirect"
  ADD CONSTRAINT "ArticleRedirect_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
