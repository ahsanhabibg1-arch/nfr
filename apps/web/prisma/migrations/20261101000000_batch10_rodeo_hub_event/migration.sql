-- Batch 10 — Public rodeo entity pages: additive hub<->event junction.
-- The generated diff's DROP INDEX / ALTER COLUMN on Article.searchVector (Prisma
-- cannot model the generated tsvector column + GIN index) was STRIPPED by hand per
-- MIGRATION_STATUS.md — the FTS column/index are preserved. No data reset.

-- CreateTable
CREATE TABLE "RodeoHubEvent" (
    "hubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RodeoHubEvent_pkey" PRIMARY KEY ("hubId","eventId")
);

-- CreateIndex
CREATE INDEX "RodeoHubEvent_eventId_idx" ON "RodeoHubEvent"("eventId");

-- AddForeignKey
ALTER TABLE "RodeoHubEvent" ADD CONSTRAINT "RodeoHubEvent_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "RodeoHub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodeoHubEvent" ADD CONSTRAINT "RodeoHubEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RodeoEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

