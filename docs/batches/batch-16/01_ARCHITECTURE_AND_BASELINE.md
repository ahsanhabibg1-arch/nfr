# Batch 16 — Architecture & Baseline

Baseline: branch `batch-01-nextjs-migration`, local HEAD `8323a7e` (Batch 15), clean tree. Remote
`origin/batch-01-nextjs-migration` was at `4f41120` (Batch 15 `8323a7e` NOT yet pushed). Reported 242/242
tests confirmed as the starting point.

## Existing author architecture (discovered — reused, no new model)
- A real **`Author`** model already exists (Batch 02): `id, slug, name, role, avatar?, bio?, credentials?,
  editorialBeat?, articles[]`. `Article.authorId` is a real FK.
- `articleService.resolveAuthorId(name, role)` **upserts** an `Author` by `author-<slug(name)>` on save,
  so saved bylines already become real Author records.
- `taxonomyService` already has `listAuthors / createAuthor / updateAuthor / deleteAuthor`
  (zod-validated, `author.manage`-gated, audited; **deleteAuthor blocks orphaning** — refuses while
  articles reference the byline).
- The **editorial-organization** admin page already exposes an "Author Bylines" tab (create/edit/delete).
- `author.manage` permission already exists in RBAC.

**Conclusion:** Workstream B (author management) was already implemented. The only real gap was the
article **editor dropdown**, which still used a Phase-0 mock `AUTHORS` map.

## Reuse decisions / schema impact
- **No schema change.** Wired the editor to the existing DB authors; reused existing CRUD, RBAC, audit.
- No duplicate author identity or ownership relationship introduced. `Article.searchVector` + GIN
  untouched (no migration this batch).
