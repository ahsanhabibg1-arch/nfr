-- CreateTable
CREATE TABLE "ArticleDraftSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT,
    "composerKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleDraftSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleDraftSnapshot_userId_updatedAt_idx" ON "ArticleDraftSnapshot"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ArticleDraftSnapshot_articleId_idx" ON "ArticleDraftSnapshot"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleDraftSnapshot_userId_composerKey_key" ON "ArticleDraftSnapshot"("userId", "composerKey");

-- AddForeignKey
ALTER TABLE "ArticleDraftSnapshot" ADD CONSTRAINT "ArticleDraftSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleDraftSnapshot" ADD CONSTRAINT "ArticleDraftSnapshot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
