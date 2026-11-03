# Batch 16 — Author Identity & Management

## Database-backed authors in the editor (the implemented change)
- `AdminArticleEditorShell` no longer imports the mock `data/mockEditorialData` `AUTHORS` map. It receives
  a server-provided `authors: { id, name, role }[]` prop.
- The byline dropdown is rendered from that list; default option is "Select author…" (no preselected
  author); empty state reads "No authors — add one in Organization & Taxonomy".
- `app/admin/(dashboard)/articles/new/page.tsx` and `.../[id]/edit/page.tsx` load `listAuthors()` and pass
  it in.
- On save, the selected author's `name` + `role` are sent; `articleService.resolveAuthorId` resolves to the
  existing Author id (verified by test: byline resolves to the matching Author, **no duplicate id**).

## Management (already present; reused)
Authorized `author.manage` users create/edit/delete author bylines in **Admin → Organization & Taxonomy →
Author Bylines**: display name, role, bio, credentials; linked article count shown. All mutations are
server-side + audited.

## Permissions
`author.manage` gates all author mutations (verified: an `author`-role user is rejected). Ordinary authors
cannot modify staff identities.

## Orphan safety
`deleteAuthor` refuses while any article uses the byline ("Cannot delete: used by N article(s)") — historical
attribution is preserved; reattribute first. (Verified by test.)

## Legacy byline compatibility
When editing an existing article whose saved byline name matches a current Author, the dropdown preselects
it (match by name → id). When it does **not** match any current author, the editor **preserves the legacy
byline text** on save and shows an amber warning ("Legacy byline '…' — preserved on save. Pick a database
author to update it.") — never silently reassigned. No bulk migration was performed.

## Public author pages
None exist and none were added (authors are byline attribution, not public profiles) — avoids empty
indexable author pages. Can be added later if trustworthy attribution/SEO needs them.
