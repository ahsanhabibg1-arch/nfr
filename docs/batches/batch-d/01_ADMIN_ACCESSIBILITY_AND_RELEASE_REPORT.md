# Batch D — Admin Accessibility, Regression Verification and Main Release

**Date:** 2026-11-04
**Scope:** accessibility of the admin Media, SEO, Monetization, Team and Settings areas (and the shared admin components they render), full regression verification of Phase 2 and Batches A–C, and release of that work to `main`.
**Runtime:** Node 22.23.4 (project pin), npm 10.9.9, Windows x64.
**Test database:** `localhost:5433/nfrguide_test` (isolated, guard-confirmed). No other database was used.

## 1. Starting state

- Branch `feature/nfr-phase2-foundation-public-fixes`; HEAD, local `main` and `origin/main` were all `4ad0ae4` (no divergence).
- The working tree held the uncommitted Phase 2, Batch A, B and C work (78 tracked files changed, plus untracked deliverables). All of it was preserved and is released in this batch.

## 2. Accessibility findings (before)

Authenticated axe-core scan (WCAG 2.0/2.1/2.2 A + AA tags), serious/critical only:

| Page | Findings |
|---|---|
| `/admin/media/` | `color-contrast` ×3; `label` ×9 (metadata form inputs); `select-name` ×6 (4 filter selects, licence select, visibility select) |
| `/admin/seo/` | `color-contrast` ×10; heading jump h1 → h3 |
| `/admin/monetization/` | `color-contrast` ×15; heading jump h1 → h4 |
| `/admin/team/` | `color-contrast` ×11; `select-name` ×2 (role/status filters) |
| `/admin/settings/` | `color-contrast` ×9; `label` ×8 (site-identity inputs and textarea) |

Manual code review of the same areas found further issues that axe does not report on the default view:
- SEO findings rows and Media list rows were selectable only by mouse (`onClick` on `<tr>`).
- The Media grid/list toggles were icon glyphs named only by `title`, with no pressed state.
- Toasts and notices were not announced to assistive technology.
- `AdminModal` was a `role="dialog"` with no accessible name, used an `h3` title, and did not move focus into the dialog or return it to the opener.
- Unlabelled controls existed on non-default tabs and forms: SEO filters, thresholds, rule toggles and resolution note; Team per-row role select and invite-link field; Settings audit filters; Monetization ad-placement form.

## 3. Fixes

All fixes use the existing design tokens from `app/globals.css` (`text-ink-muted` for light surfaces, `text-ink-inverse-muted` for dark surfaces) and existing markup conventions.

| Area | Change |
|---|---|
| Contrast | Bare `text-stone-400/500` text replaced by `text-ink-muted` in `AdminPageHeader`, `AdminBreadcrumbs`, `AdminTabs`, `AdminStatCard`, `AdminFilterBar`, `AdminModal` and the five views (101 tokens). The one muted line on a dark surface (the Monetization status banner, `bg-stone-900`) uses `text-ink-inverse-muted`. Every swapped token was checked against its surface first. |
| Labels | Visible labels are associated by `htmlFor`/`id`: Media metadata fields (`media-<field>`) and licence select (`media-license`); all 16 Settings fields (`settings-*`); the Team invite form (`invite-*`); the Monetization forms (`monetization-*`); SEO thresholds (`seo-threshold-<key>`). |
| Accessible names | `aria-label` was added only where no visible label exists: filter selects and search fields (Media, SEO, Team, Settings audit log), the per-row role select ("Role for <name>"), the asset visibility select, the invite-link field, rule toggles ("Enable rule <title>"), the resolution note, and the ad-placement form. |
| Headings | SEO section headings h3 → h2; Monetization section headings h4 → h2; the `AdminModal` title h3 → h2. |
| Keyboard | SEO finding titles and Media list titles are now `<button type="button">` elements with `aria-pressed`, performing the same selection as the row click. Media grid cards expose `aria-pressed`. |
| Toggles | Media view toggles have `aria-label="Grid view"` / `"List view"` and `aria-pressed`. |
| Status messages | Toasts (Monetization, Team, Settings) and notices (Media, SEO) are `role="status" aria-live="polite"`. |
| Dialog | `AdminModal` has `aria-labelledby` (title) and `aria-describedby` (subtitle). Focus moves into the panel on open and returns to the opener on close. That focus effect is keyed on `isOpen` only, so re-renders with a new `onClose` cannot steal focus from fields. The close button is `type="button"` and labelled "Close dialog". This applies to every admin modal (Team, Monetization, Sources, Rodeo coverage, Editorial org, Website nav, editor pickers). |

**No axe rule was disabled or suppressed.** `e2e/a11y-known-issues.json` remains `[]`, and a unit test now enforces that.

## 4. Accessibility findings (after)

The same authenticated axe scan reports **0 serious/critical violations** on all five pages. Headings are now:
- SEO: h1 → h2, h2;
- Monetization: h1 → h2;
- Media, Team and Settings: a single h1.

**Limits:** axe covers only a subset of WCAG. Screen-reader walkthroughs, zoom/reflow, and every non-default tab or modal state were not exhaustively audited by tooling. The tab and modal code paths were reviewed by hand, and the Team invite dialog is browser-tested. This is not a WCAG 2.2 AA conformance claim.

## 5. Tests added

- **`apps/web/tests/batchD.test.ts`** (11 static tests):
  - no light-only greys remain in the audited files;
  - the dark-banner token is used;
  - every `<input>/<select>/<textarea>` in the five views has an accessible name (verified by a mutation check: removing one `aria-label` makes the test fail);
  - label targets exist and ids are unique;
  - the Media form associations are in place;
  - no h3–h6 remain in SEO/Monetization;
  - keyboard selection buttons exist;
  - the toggles are named;
  - the live regions are present;
  - the dialog contract holds;
  - the a11y baseline is empty.
- **`apps/web/e2e/a11y.spec.ts`** (+9 browser tests):
  - authenticated axe + heading-structure audits for the five admin pages;
  - labelled-control checks for Media, Team and Settings;
  - the Team invite dialog: accessible name, focus moved inside, its own axe pass, Escape closes it and focus returns to the opener.

## 6. Regression verification

All of these were run on Node 22.23.4 in `apps/web`.

| Check | Result |
|---|---|
| Focused (`batchD`, `batchB`) | 29 passed |
| Full Vitest, `REQUIRE_DB_TESTS=1` | **102 suites / 364 tests: 364 passed, 0 failed, 0 skipped, 0 todo** |
| Skip gate (`assert-no-skipped-tests.mjs`, allow-list `[]`) | pass: 0 intentionally skipped, 0 unexpectedly not run |
| TypeScript (`tsc --noEmit --incremental false`) | pass |
| `prisma validate` | valid |
| Production build (test DB, `APP_ENV=test`) | pass |
| Route smoke (`SMOKE_BASE_URL=http://localhost:3100`) | **37 passed, 0 failed** |
| HTTP media upload check | **7 passed, 0 failed** |
| Playwright (public, admin, a11y) | **45 passed, 0 failed, 0 skipped, 0 flaky** |
| `npm ls sharp --all` | single `sharp@0.35.5` (deduped under `next`) |
| `npm audit` | 6 (1 moderate, 3 high, 2 critical), all in the Vitest 3 and Prisma 6 dev/CLI chains; each fix needs a major upgrade (out of scope). No `sharp` advisory |
| `git diff --check` | clean |
| Lint | not configured (no `lint` script) |
| Cleanup | 0 leftover rows from e2e, media checks or diagnostics; only the 6 seeded `fixture-` articles remain in the test DB |

## 7. Safeguards reconfirmed

| Safeguard | Evidence |
|---|---|
| Sharp 0.35.5 | dependency tree above; `media-processing.test.ts` asserts ≥ 0.35.5 |
| Purse values never exposed | Playwright "edition pages never expose a purse figure" |
| Safe JSON-LD | Playwright "JSON-LD script bodies contain no raw `<`"; `serializeJsonLd` unit tests |
| Fixture exclusion in production | `batchB.test.ts` production-mode article, rodeo, search and redirect tests |
| Scheduled publishing disabled | Playwright "no Schedule control" and "legacy SCHEDULED article shows Manual publish required"; service tests |
| Database guards | `test-db-guard.test.ts`; guarded scripts refuse non-isolated targets (`batchB.test.ts`) |
| Upload restrictions | `media.test.ts` (types, size, signature, corrupt body); HTTP check (401 unauthenticated, draft hidden) |
| Derivative metadata stripping | `media-processing.test.ts`: no EXIF/GPS/XMP/ICC in WebP derivatives |

## 8. Migration inventory

- **No migrations were added in Phase 2 or Batches A–D.**
- `apps/web/prisma/schema.prisma` and `apps/web/prisma/migrations/` are byte-identical to `4ad0ae4`.
- There are 0 untracked migration files. The existing directory has 12 migrations plus `migration_lock.toml`, the latest being `20261102120000_batch14_competition_coverage`.
- `prisma/seed.ts` changed: it is create-only, and fixtures are seeded only into isolated databases. This is not a migration.
- Nothing needs to be applied to production for this release.

## 9. Documentation released

These are the batch reports:
- `docs/batches/batch-a/01_AUDIT_AND_PLAN.md`
- `docs/batches/batch-a/02_IMPLEMENTATION_REPORT.md`
- `docs/batches/batch-b/01_ACCESSIBILITY_AND_DEMO_SAFETY_REPORT.md`
- `docs/batches/batch-c/01_SHARP_SECURITY_UPGRADE_REPORT.md`
- this report.

All were scanned for credentials before committing.

The Phase 1 audit and the Gap audit were **deliberately not committed**: this repository is public, and those audits describe credential-exposure and production-access details. They remain with the owner.

## 10. Safety

- No database reset, seed, clean, migration or `db push` was run.
- No production connection was made.
- No change was made to `.env` or credentials.
- No Docker.
- No dependency changes in this batch.
- No force-push or history rewrite.
- No deployment.

## 11. Remaining risks

1. **Credentials:** rotation of the Aiven, R2, local-role and admin credentials is still outstanding (owner action).
2. **Production data:** the production database still holds the legacy demo corpus. It is hidden from public reads by the fixture and purse safeguards, but not removed.
3. **Advisories:** the Vitest 3 → 5 and Prisma 6 → 7 upgrades remain open; each needs its own batch.
4. **Accessibility outside this batch:** admin areas not in this batch (for example Analytics, Competitors, Landing SEO) have not been axe-audited; known grey tokens remain there.
5. **Original uploads** keep their EXIF metadata by design (see the Batch C report §8).
6. **CI:** the release is the first CI run with these changes; its result is reported separately in the release summary.
