-- Rodeo Coverage archive lifecycle (owner-approved).
--
-- Adds a nullable `archivedAt` timestamp to the five Rodeo Coverage entity
-- families, plus a supporting index on each.
--
-- NON-DESTRUCTIVE BY CONSTRUCTION:
--   * every column is NULLable and has NO DEFAULT, so PostgreSQL records a
--     catalog-only change and does not rewrite the table;
--   * existing rows therefore read as `archivedAt IS NULL`, which the
--     application treats as ACTIVE — current behaviour is preserved exactly;
--   * no column is dropped, renamed or retyped, and no row is written;
--   * `CREATE INDEX` is additive and affects no row data.
--
-- ROLLBACK (verified safe, reverses this migration completely):
--   DROP INDEX "Discipline_archivedAt_idx";
--   DROP INDEX "RodeoHub_archivedAt_idx";
--   DROP INDEX "RodeoEvent_archivedAt_idx";
--   DROP INDEX "RodeoEventEdition_archivedAt_idx";
--   DROP INDEX "Venue_archivedAt_idx";
--   ALTER TABLE "Discipline"        DROP COLUMN "archivedAt";
--   ALTER TABLE "RodeoHub"          DROP COLUMN "archivedAt";
--   ALTER TABLE "RodeoEvent"        DROP COLUMN "archivedAt";
--   ALTER TABLE "RodeoEventEdition" DROP COLUMN "archivedAt";
--   ALTER TABLE "Venue"             DROP COLUMN "archivedAt";
-- Rolling back loses only which records were archived; no other data.

-- AlterTable
ALTER TABLE "Discipline" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RodeoHub" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RodeoEvent" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RodeoEventEdition" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Discipline_archivedAt_idx" ON "Discipline"("archivedAt");

-- CreateIndex
CREATE INDEX "RodeoHub_archivedAt_idx" ON "RodeoHub"("archivedAt");

-- CreateIndex
CREATE INDEX "RodeoEvent_archivedAt_idx" ON "RodeoEvent"("archivedAt");

-- CreateIndex
CREATE INDEX "RodeoEventEdition_archivedAt_idx" ON "RodeoEventEdition"("archivedAt");

-- CreateIndex
CREATE INDEX "Venue_archivedAt_idx" ON "Venue"("archivedAt");
