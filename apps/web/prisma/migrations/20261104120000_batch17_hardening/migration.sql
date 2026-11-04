-- Batch 17 — Pre-Launch Security & Integrity Hardening (ADDITIVE, backward-compatible).
-- Safe to apply on top of existing data: every change is an ADD; no column is
-- dropped, renamed or retyped, and no existing row is modified beyond receiving the
-- new column default. Must NOT be applied to local development or Aiven production in
-- this batch — verified against a disposable test database only.

-- Workstream A: optimistic-concurrency row version for competition coverage.
-- Existing rows default to version 1; the application increments atomically on edit.
ALTER TABLE "CompetitionSession"  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompetitionResult"   ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompetitionStanding" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Workstream C: durable, multi-instance fixed-window rate limiter.
CREATE TABLE "RateLimitHit" (
    "key"     TEXT NOT NULL,
    "count"   INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitHit_resetAt_idx" ON "RateLimitHit"("resetAt");
