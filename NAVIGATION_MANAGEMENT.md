# Navigation Management (Batch 04 — Phase F)

> Audience: engineers and admins. Covers the database-backed site navigation,
> its static fallback, canonical-route protection, and how the public header /
> footer consume it.

Model: `NavigationItem` (new in Batch 04). Service: `lib/cms/navigationService.ts`.
Shared types: `lib/cms/navTypes.ts`. Actions: `app/admin/navigation-actions.ts`.
UI: `views/admin/AdminWebsiteNavPage.tsx`. Route:
`app/admin/(dashboard)/website/page.tsx`. Permission: **`navigation.manage`**
(Administrator and Super Admin only).

## 1. Data model

```prisma
model NavigationItem {
  id String @id @default(uuid())
  location   String   // 'header' | 'footer-sections' | 'footer-academy'
  label      String
  url        String   // internal path ('/plan-watch/') or absolute https URL
  sortOrder  Int      @default(0)
  isExternal Boolean  @default(false)
  isSystem   Boolean  @default(false)  // canonical link — protected
  visible    Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([location, sortOrder])
}
```

Migration: `prisma/migrations/20261029100000_batch04_navigation/` (applied to
dev and test DBs via offline `migrate diff` + `migrate deploy` — see
[MIGRATION_STATUS.md](MIGRATION_STATUS.md)).

## 2. Three menu locations

- `header` — the primary top-nav (the five canonical sections).
- `footer-sections` — the footer "Editorial Sections" column.
- `footer-academy` — the footer "Spectator Academy" column.

## 3. Static fallback (the site is never empty)

`getPublicNavigation()` reads visible rows grouped by location. **If a location
has no rows, it returns a built-in static menu** (`CANONICAL` in the service,
mirroring the pre-DB header/footer exactly). So:

- Fresh database (no rows) → the site renders the original canonical menus.
- As soon as rows exist for a location, they take over for that location.

The public client components (`SiteHeader`, `SiteFooter`) ALSO keep their own
static fallback constants and use them when the prop is empty/undefined (e.g.
`not-found.tsx`, which renders chrome without fetching nav). Fallback therefore
exists at both the data layer and the component layer.

## 4. Canonical-route protection

- `restoreCanonicalNav()` idempotently materializes the static menus into the
  DB as **system rows** (`isSystem = true`, deterministic ids `nav-<location>-<n>`),
  15 rows total. Admins click "Import canonical links" to start managing them.
- System rows **cannot be deleted** (`forbidden`) — only hidden (`visible=false`).
- Updating a system row **keeps its `url` and `location`**; only label, order
  and visibility are editable. This guarantees the five primary-section routes
  (`/competition/`, `/entertainment/`, `/events-shopping/`, `/plan-watch/`,
  `/rodeo-events/`) and the discipline routes are never renamed or removed via
  the CMS.

## 5. URL validation

`validateUrl(url, isExternal)`: internal links must start with `/` (and contain
no `//` or `javascript:`); external links must parse as a URL with the `https:`
protocol. Invalid input is rejected with `validation` before any write.

## 6. Public integration & cache

`app/(public)/layout.tsx` calls `getPublicNavigation()` and passes the three
lists into `PublicChrome` → `SiteHeader` (header) and `SiteFooter`
(sections + academy). Navigation mutations call `revalidatePath('/', 'layout')`
so every public page's chrome updates. The public layout keeps
`revalidate = 300`.

## 7. Tests

`tests/batch04.test.ts`: `navigation.manage` enforcement (Editor forbidden,
Admin allowed); URL validation (internal/external); static fallback when empty;
`restoreCanonicalNav` creates 15 protected rows a public read then uses;
system-row delete refusal; system-row update keeps url/location.
