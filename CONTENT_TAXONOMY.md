# Content Taxonomy — Categories, Tags & Author Bylines (Batch 04 — Phase E)

> Audience: editors and engineers. Covers the editorial organization module:
> categories (incl. the protected primary sections), tags, and author bylines
> as distinct public identities.

Service: `lib/cms/taxonomyService.ts`. Actions: `app/admin/taxonomy-actions.ts`.
UI: `views/admin/AdminEditorialOrgPage.tsx` (tabbed: Categories / Tags / Authors).
Route: `app/admin/(dashboard)/editorial-organization/page.tsx`.

## 1. Categories

- Fields: `name`, `slug` (derived), `description`, `sortOrder`, article count.
- Permission: **`taxonomy.manage`** (Editor and above).
- **Protected primary sections.** The five canonical sections are seeded with
  `cat-*` ids (`cat-competition`, `cat-entertainment`, `cat-events-shopping`,
  `cat-plan-watch`, `cat-rodeo-events`). The service treats any `cat-*` id as
  protected: its label/description/order can be edited, but its **slug is never
  changed** and it **cannot be deleted** (`forbidden`). This preserves the five
  canonical section routes.
- Non-protected categories can be deleted only when they have **zero** articles
  (`conflict` otherwise). Duplicate name/slug on create is refused (`conflict`).

## 2. Tags

- Fields: `name`, `slug`/`id` (`tag-<slug>`), article count.
- Permission: `taxonomy.manage`.
- Create (inline add) and delete. Deleting a tag removes only the
  `ArticleTag` associations (cascade) — never the articles themselves.

## 3. Author bylines (distinct from login users — Master Reqs §9)

Author bylines (`Author` table) are **public editorial identities** — a name,
role/title, bio and credentials shown on articles. They are deliberately
**separate from CMS login users** (`User`/auth): an author byline has no
password, no session and no permissions; a `User` is who signs in. One does not
imply the other. Byline email/PII is never shown publicly.

- Permission: **`author.manage`** (Editor and above; separate from
  `taxonomy.manage` so the two can be granted independently later).
- Create/edit (name, role, bio, credentials). Delete refused when the byline is
  used by ≥1 article (`conflict`) — bylines on published work are preserved.

## 3.1 Why separate from users?

- A staff writer may leave (user deactivated) while their byline must remain on
  published articles for the historical record.
- Guest contributors get a byline without ever getting a login.
- Attribution and access control are different concerns with different
  lifecycles.

## 4. Public impact & cache

Taxonomy mutations call `revalidatePath('/', 'layout')` so category/section
pages reflect changes. Protected-section slugs never change, so canonical
routes and existing links stay valid.

## 5. Tests

`tests/batch04.test.ts`: category create + duplicate rejection; protected
`cat-*` delete refusal; tag create/delete; `author.manage` enforcement (SEO
Manager forbidden, Editor allowed).
