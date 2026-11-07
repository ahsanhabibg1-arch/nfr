-- Batch 31: Admin-controlled page composition layout
CREATE TABLE "PageLayout" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "draftSections" JSONB NOT NULL DEFAULT '[]',
    "publishedSections" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageLayout_pageKey_key" ON "PageLayout"("pageKey");
