# Batch 16 — Database & Safety Report

## Schema changes
**None.** No Prisma model/enum/field was added or changed. No migration was created. The existing `Author`
model + `Article.authorId` FK satisfied the database-backed-author requirement.

## Migration SQL review
N/A — no migration this batch.

## Local/test DB verification
- `npx prisma validate` → valid. `npm run test:migration` → **5/5** (searchVector tsvector + GIN +
  `websearch_to_tsquery` preserved) on the isolated test DB.
- All DB-mutating tests ran against the disposable TEST database (`TEST_DATABASE_URL`), cleaned up after.
- A temporary admin session + a QA author were created in the **local dev** DB purely for browser QA (the
  session expires in 1h; authors are legitimate byline records). No editorial content was created.

## Aiven / R2 — untouched
No connection to Aiven PostgreSQL; no write to Cloudflare R2; no cloud credential used or rotated; no
bucket policy changed. Browser QA used the local dev DB + local media storage only.

## FTS/GIN preservation
Confirmed intact (gate 5/5). No change to the generated `Article.searchVector` column or its GIN index.

## Secrets
`.env*` remains gitignored; no secret in tracked files (scanned); documentation contains no credentials,
hashes or tokens.
