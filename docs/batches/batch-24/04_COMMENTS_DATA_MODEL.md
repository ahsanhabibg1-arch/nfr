# 04 — Comments Data Model

## Schema additions (`prisma/schema.prisma`)

```prisma
model User {
  emailVerifiedAt   DateTime?
  emailVerifications EmailVerificationToken[]
  comments          ArticleComment[] @relation("CommentAuthor")
  moderatedComments ArticleComment[] @relation("CommentModerator")
  // ...existing fields unchanged
}

model EmailVerificationToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model ArticleComment {
  id               String        @id @default(cuid())
  articleId        String
  authorId         String
  body             String
  status           CommentStatus @default(PENDING)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  moderatedById    String?
  moderatedAt      DateTime?
  moderationReason String?
  article     Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  author      User    @relation("CommentAuthor",    fields: [authorId],      references: [id], onDelete: Cascade)
  moderatedBy User?   @relation("CommentModerator", fields: [moderatedById], references: [id], onDelete: SetNull)
  @@index([articleId, status])
  @@index([authorId])
  @@index([status])
}

enum CommentStatus { PENDING APPROVED REJECTED HIDDEN }
```

`Article` gains `comments ArticleComment[]`.

## Design notes

- **Body is plain text.** It is stored verbatim and rendered as escaped React
  children — there is no `dangerouslySetInnerHTML` path, so stored markup never
  executes (XSS test in report 08).
- **PENDING by default** — nothing a reader writes is public until a moderator
  approves it.
- **Moderation trail** on the row itself: who (`moderatedById`, `SetNull` so
  deleting a moderator never cascades to comments), when, and why.
- **Indexes** target the real queries: `(articleId, status)` for the public
  "approved comments for this article" read, `authorId` for "my comments",
  `status` for the moderation queue counts.

## Migration

`prisma/migrations/20261105120000_batch24_reader_comments/migration.sql` —
**purely additive** hand-written SQL (CREATE TYPE, ADD COLUMN, CREATE TABLE +
indexes + 4 FKs). No column is dropped or altered destructively; existing Admin
accounts, sessions, and data are untouched. Applied cleanly to the local dev and
test databases. See report 09 for the safety rules that governed it.
