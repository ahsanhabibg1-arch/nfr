-- Batch 24 — Reader accounts, email verification, article comments (ADDITIVE, backward-compatible).
-- No existing column dropped/renamed; existing Admin accounts and sessions are untouched.

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- AlterTable: reader email-verification timestamp (nullable; not required for login)
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable: EmailVerificationToken (hash-only, single-use, expiring)
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateTable: ArticleComment (flat, plain-text body, PENDING by default)
CREATE TABLE "ArticleComment" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderationReason" TEXT,

    CONSTRAINT "ArticleComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticleComment_articleId_status_idx" ON "ArticleComment"("articleId", "status");
CREATE INDEX "ArticleComment_authorId_idx" ON "ArticleComment"("authorId");
CREATE INDEX "ArticleComment_status_idx" ON "ArticleComment"("status");

-- Foreign keys
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
