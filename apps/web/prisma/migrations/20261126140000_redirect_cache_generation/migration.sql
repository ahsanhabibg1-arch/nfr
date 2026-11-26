CREATE TABLE "RedirectCacheState" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "version" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "RedirectCacheState_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RedirectCacheState" ("id", "version") VALUES (1, 0);
