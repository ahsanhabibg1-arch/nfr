-- CreateTable
CREATE TABLE "PageLayoutRevision" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageLayoutRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageLayoutRevision_pageKey_revisionNo_key" ON "PageLayoutRevision"("pageKey", "revisionNo");

-- CreateIndex
CREATE INDEX "PageLayoutRevision_pageKey_createdAt_idx" ON "PageLayoutRevision"("pageKey", "createdAt");

-- AddForeignKey
ALTER TABLE "PageLayoutRevision" ADD CONSTRAINT "PageLayoutRevision_pageKey_fkey" FOREIGN KEY ("pageKey") REFERENCES "PageLayout"("pageKey") ON DELETE CASCADE ON UPDATE CASCADE;
