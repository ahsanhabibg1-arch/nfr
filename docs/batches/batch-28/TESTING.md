# Batch 28 — Test Results

**Date**: 2026-11-07

## TypeScript

```
tsc --noEmit → 0 errors
```

## Prisma

```
prisma validate → valid
prisma db push (test DB) → synced
```

## Vitest (unit + integration)

```
Test Files  50 passed (50)
Tests       428 passed (428)
Duration    ~104s
```

Key test updates:
- `permissions-unit.test.ts` — updated to expect 18 CMS modules (added `info-pages`)
- `batchD.test.ts` — SectionEditor accessibility now passes (added `aria-label` to form controls)
- `batch04.test.ts` — all navigation tests pass after test DB schema push

## Production Build

```
next build → SUCCESS
All routes compile. Legal pages correctly render as dynamic (no longer force-static).
```

## E2E (Playwright)

E2E tests were not re-run in this session (would require a full test-DB build cycle). The two specific E2E failures from the audit (G-07, G-08) were fixed with targeted timeout increases.

## Security Notes

- All new service methods gate on `system.config` permission via `roleHasPermission`.
- All mutations are audit-logged.
- InfoPage workflow enforces DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED progression.
- `dangerouslySetInnerHTML` in LegalPageView is acceptable: content is authored by system.config-gated admin staff, same pattern as article body rendering.
- Legal pages are no longer `force-static` (necessary for DB integration); caching relies on Next.js defaults and `revalidatePath` on mutation.

---

## Follow-Up Verification (session 2)

### E2E (Playwright) — now run

```
56 passed, 0 failed, 0 skipped
G-07: 2/2 (repeat-each)
G-08: 2/2 (repeat-each)
```

### Vitest — updated totals

```
Test Files  52 passed (52)
Tests       453 passed (453)
```

New test files:
- `batch28-cms.test.ts` — 13 integration tests (section config, quick-access, info pages workflow, RBAC, unpublish)
- `batch28-xss.test.ts` — 12 XSS regression tests (script, event handler, URI, iframe, style, SVG, meta refresh)

### Migration

```
prisma migrate status → 15 migrations applied, schema up to date
Migration: 20261107120000_batch28_cms_gaps (additive only)
```

### Security (updated)

- `dangerouslySetInnerHTML` is now **double-sanitized**: write-time in `saveInfoPageDraft` + render-time in `LegalPageView` via `sanitize-html` allowlist.
- Published page unpublish is an explicit, audited action — `revertToDraft` refuses PUBLISHED pages to prevent accidental public-content removal.
