# Editorial CMS Architecture (Batch 04)

> Audience: engineers maintaining the NFRGuide custom CMS. Describes the
> service → Server Action → view → route pattern that all Batch 04 editorial
> management modules share, and the cross-cutting authorization, validation,
> audit and cache-invalidation layers.

## 1. Layered design

Every Batch 04 module (Overview dashboard, Advanced Article Management, Rodeo
Coverage, Editorial Organization, Sources & References, Website & Navigation)
is built from the same four layers:

```
 app/admin/(dashboard)/<module>/page.tsx   ← Server Component (route)
        │  requireUser() + roleHasPermission(...)  → read via service, pass props
        ▼
 views/admin/Admin<Module>Page.tsx          ← Client Component (UI)
        │  calls Server Actions, useTransition, router.refresh()
        ▼
 app/admin/<module>-actions.ts              ← 'use server' Server Actions
        │  requireActor(permission) → service call → revalidatePath()
        ▼
 lib/cms/<module>Service.ts                 ← 'server-only' domain service
           re-checks permission, validates (zod), mutates (Prisma), audits
```

Key rule: **the service is the enforcement point.** Actions resolve the actor
and revalidate caches; the service independently re-checks the permission,
validates input, performs the mutation, and writes the audit row. A view
hiding a button is cosmetic only — the server always re-checks.

## 2. Authorization guard (`lib/cms/guard.ts`)

A single shared guard backs every module:

- `Actor { id, roles }` — the resolved current user.
- `getActor()` / `requireActor(permission)` — resolve from the session cookie;
  throw `AuthzError('unauthenticated' | 'forbidden')` on failure (default-deny).
- `audit(actorId, action, entityType, entityId?, detail?)` — append an
  `AuditLog` row for every mutation.
- `toActionError(e)` — normalize thrown `AuthzError` / service `ServiceError`
  into a typed `ActionResult` (`{ ok:false, code, error }`) the client renders.
- `ActionResult<T>` — discriminated union (`{ ok:true } & T | { ok:false … }`).

Services throw `ServiceError(code, message)` (re-used from `articleService.ts`)
with codes `forbidden | validation | conflict | not_found`. Actions catch and
convert; the UI shows `error` inline and only `router.refresh()` on `ok`.

## 3. Permissions (Batch 04 additions)

Added to the default-deny matrix in `lib/auth/rbac.ts`:

| Permission          | Granted to                          | Governs |
|---------------------|-------------------------------------|---------|
| `rodeo.manage`      | Editor, Administrator, Super Admin  | Hubs, events, editions, venues |
| `taxonomy.manage`   | Editor, Administrator, Super Admin  | Categories, tags |
| `author.manage`     | Editor, Administrator, Super Admin  | Author bylines |
| `source.manage`     | Editor, Administrator, Super Admin  | Sources & references |
| `navigation.manage` | Administrator, Super Admin **only** | Header/footer navigation |

Navigation is Admin-and-above because it changes site structure. Content
management (rodeo/taxonomy/authors/sources) is available to Editors. Authors
and SEO Managers get none of these (verified by tests). See
[RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md).

## 4. Validation

All input is parsed with **zod** inside the service before any DB write.
URL-bearing fields are additionally checked: sources via `isSafeHref` (safe
protocols only), navigation via `validateUrl` (internal must start with `/`,
external must be `https:`). Invalid input throws `ServiceError('validation')`.

## 5. Referential protection (no silent cascades)

Deletions are **restrict-on-delete** for anything referenced by editorial
content, satisfying Master Reqs §7:

- Source cited by ≥1 article → delete refused (`conflict`).
- Rodeo hub/event/edition referenced by ≥1 article → delete refused.
- Recurring event with ≥1 edition → delete refused (remove editions first).
- Venue used by ≥1 edition → delete refused.
- Category with ≥1 article, or a foundational `cat-*` primary section → refused.
- Author byline used by ≥1 article → refused.
- Canonical (`isSystem`) navigation links → cannot be deleted, only hidden.

Nothing cascade-deletes published editorial content.

## 6. Audit trail

Every create/update/delete/status-change calls `audit(...)`, writing an
`AuditLog` row (`actorId`, `action`, `entityType`, `entityId`, `detail`,
`createdAt`). The Overview dashboard reads the most recent rows as the activity
feed.

## 7. Cache invalidation

Mutating actions call `revalidatePath()`:
- the admin module path (so the admin list refreshes), and
- `revalidatePath('/', 'layout')` when the change can affect public pages
  (taxonomy, rodeo, navigation).

Article publish/unpublish invalidation is covered by `article-actions.ts` and
verified end-to-end over HTTP (see
[BATCH04_TEST_REPORT.md](BATCH04_TEST_REPORT.md) and
`scripts/cache-invalidation.mts`).

## 8. Files

| Concern | Files |
|---------|-------|
| Guard | `lib/cms/guard.ts` |
| Dashboard | `lib/cms/adminQueries.ts` (`getDashboardData`), `app/admin/(dashboard)/page.tsx` |
| Articles | `lib/cms/adminQueries.ts` (`getAdminArticleList`), `views/admin/AdminArticlesPage.tsx` |
| Rodeo | `lib/cms/rodeoService.ts`, `app/admin/rodeo-actions.ts`, `views/admin/AdminRodeoCoveragePage.tsx` |
| Taxonomy | `lib/cms/taxonomyService.ts`, `app/admin/taxonomy-actions.ts`, `views/admin/AdminEditorialOrgPage.tsx` |
| Sources | `lib/cms/sourceService.ts`, `app/admin/source-actions.ts`, `views/admin/AdminSourcesPage.tsx` |
| Navigation | `lib/cms/navigationService.ts`, `lib/cms/navTypes.ts`, `app/admin/navigation-actions.ts`, `views/admin/AdminWebsiteNavPage.tsx` |

See the per-module docs: [RODEO_ENTITY_MANAGEMENT.md](RODEO_ENTITY_MANAGEMENT.md),
[CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md),
[SOURCES_REFERENCE_SYSTEM.md](SOURCES_REFERENCE_SYSTEM.md),
[NAVIGATION_MANAGEMENT.md](NAVIGATION_MANAGEMENT.md).
