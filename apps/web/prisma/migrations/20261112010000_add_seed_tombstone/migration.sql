-- Durable seed tombstones (owner-approved, Decision A).
--
-- Records that a seeded foundational entity was deliberately deleted, so a
-- later `prisma db seed` does not recreate it. `key` stores the seed's STABLE
-- primary key (e.g. `disc-bull-riding`), never the editable slug.
--
-- NON-DESTRUCTIVE BY CONSTRUCTION:
--   * creates one new table and one index; touches no existing table;
--   * reads and writes no existing row;
--   * no column is added, dropped, renamed or retyped anywhere else;
--   * an empty tombstone table means "nothing was deliberately deleted", which
--     is exactly the behaviour of every current deployment, so existing
--     installations are unaffected until an admin actually deletes something.
--
-- UNIQUENESS: (kind, key) is unique, so a repeated delete of the same logical
-- record cannot create duplicate tombstones and the seed's lookup is exact.
--
-- ROLLBACK (reverses this migration completely):
--   DROP TABLE "SeedTombstone";
-- Rolling back loses only the record of which seeded entities were deleted,
-- which would allow the seed to recreate them again. No other data is affected.

-- CreateTable
CREATE TABLE "SeedTombstone" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeedTombstone_kind_key_key" ON "SeedTombstone"("kind", "key");
