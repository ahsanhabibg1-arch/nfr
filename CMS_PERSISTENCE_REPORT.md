# NFRGuide.com — CMS Persistence Report (Phase 1 / Batch 03)

The admin CMS now persists to PostgreSQL through an authenticated, RBAC-enforced service.
The Phase 0 `sessionStorage` `articleStore` has been **removed**.

## Layers
- **Service** `lib/cms/articleService.ts` — `server-only`; the acting user is passed in
  (`ActorContext`), so it is directly unit/integration-testable. Enforces permissions +
  ownership, validates input with **zod**, writes in a **transaction**, detects concurrent
  edits via an optimistic `version` check, and records revisions / workflow history / audit.
- **Actions** `app/admin/article-actions.ts` — `'use server'`; resolve the session → actor,
  call the service, and revalidate public caches. Return UI-friendly results
  (`{ ok, ... } | { ok:false, code, error, details }`).
- **Admin reads** `lib/cms/adminQueries.ts` — `server-only`; return content in ANY workflow
  state for the CMS (distinct from the published-only public repository).
- **UI** — `app/admin/(dashboard)/articles/*` server pages load data + compute permissions
  and render the existing editor/list (now DB/action-backed).

## Operations & guarantees
| Operation | Permission | Notes |
|---|---|---|
| Create | `article.create` | sets `createdById`, version 1, DRAFT; revision + audit |
| Update / Save Draft | `edit.any`, or `edit.own` + ownership (draft/in_review) | optimistic `version` lock → stale = `conflict` |
| Submit / Review / Approve / Schedule / Publish / Unpublish / Archive | per transition (see RBAC matrix) | server-validated transition map; publish runs the Category A/B gate |
| Delete | `article.delete` | audit entry then delete (cascades children) |
| Restore revision | `edit.any` / `edit.own` | creates a NEW revision; never rewrites history |

- **Eight editor fields + structured body preserved.** The URL slug stays separate.
- **Concurrency:** multi-field writes use `updateMany … where { id, version }` then
  `version: { increment: 1 }`; a mismatch returns `conflict` — newer edits are never
  silently overwritten.
- **Revisions are append-only** (`revisionNo` increments); editing does not wipe history.
- **Audit:** `auth.login`, `article.create|update|workflow.*|delete|revision.restore`,
  and `bootstrap.super_admin.create` are written to `AuditLog`.

## Public integration & cache invalidation
Publishing/unpublishing calls `revalidatePath('/', 'layout')` + the article path +
`/sitemap.xml`, so public listings, the article page and the sitemap reflect the change
immediately rather than waiting for the ISR interval. Integration tests assert draft →
private, publish → public, unpublish → private.

## Boundary (documented)
Only **Articles + Editor + workflow** are DB-backed in Batch 03. Admin modules 3–12 and
the Overview remain Phase 0 UI/mock (Batch 03 §10 permits this). Typed server-side
mutation interfaces exist only for articles; there are **no anonymous or public write
endpoints**, and no admin DB mutation runs without an authenticated, permitted session.
