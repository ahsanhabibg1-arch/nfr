# Stage 09 — Handover

**State:** PARTIAL — OWNER DECISION REQUIRED. Engineering verified; approval gates open.
**Code:** `main` at `f24af32` + **uncommitted** continuation changes. Ask the owner before
committing — the no-commit rule was lifted only for the earlier `bce3b1c` push.

## Read first

1. `STAGE_09_COMPLETION_REPORT.md` — matrix and what changed.
2. `STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md` — the three owner packages.
3. `STAGE_09_TEST_AND_MUTATION_REPORT.md` — exact gate numbers and the two open browser items.
4. The Stage 09 suites: `apps/web/tests/stage09-*.test.ts`, `apps/web/e2e/stage09-seo-admin.spec.ts`.

## How to re-run the gate (from `apps/web`)

1. Isolated test DB only (`TEST_DATABASE_URL` in `.env`, `localhost:5433/nfrguide_test`).
   It now has all 19 migrations.
2. `npx tsc --noEmit`
3. `APP_ENV=test npx vitest run` — expect 116 files / 2560 tests.
4. Build and serve on the test DB: set `DATABASE_URL` to the test URL, `APP_ENV=test`,
   a throwaway `INTERNAL_REVALIDATE_SECRET`; `npx next build`; `npx next start -p 3100`.
5. `SMOKE_BASE_URL=http://localhost:3100 npx tsx scripts/route-smoke.mts` (37) and, with
   `TEST_DATABASE_URL` + the same secret, `npx tsx scripts/cache-invalidation.mts` (10).
6. `E2E_BASE_URL=http://localhost:3100 npx playwright test` — expect 124 with the Stage 09
   spec; `a11y › home` currently fails (pre-existing h1→h3).
7. Never run DB-writing Vitest and Playwright together.

## When the owner answers

| Decision | Then do |
|---|---|
| S-1 approved | Create the migration exactly as in Package 1 §1.4, implement §1.6–1.10, add the §1.12 tests, replace the `DEFECT:` pins in `stage09-infopage-publication.test.ts` with isolation tests |
| D-13 privacy wording approved | Update `config/legalPages.ts` Privacy → Readers; update the pinned finding test; decide deletion/retention |
| D-13 affiliate fallback approved | Replace the hardcoded sentence in `DisclosureBanner.tsx`; update `stage09-ownership-and-privacy` |
| D-13 pages approved | Flip `review: 'approved'` per page (makes it indexable + sitemap-listed) |
| D-14 confirmed | One publisher builder with `@id`, fed by `SiteIdentity`; homepage Organization/WebSite only with confirmed fields; replace the two hardcoded nodes; update the D-14 pins |

## Stage 10 readiness register (do not start without instruction)

- Homepage hero heading structure (a11y h1→h3) — currently failing in `e2e/a11y.spec.ts`.
- Builder device-width e2e flake.
- `ArticleSeo.robots` editor control (policy: who may noindex an article).
- `ArticleSeo.structuredDataType` drop (D-10, schema change).
- `ogImage` URL validation; stored SEO fallback indistinguishable from deliberate values.
- CSP report-only → nonce inline scripts → enforce.
- D-06 tab rename; D-05 footer ownership migration.
- Development DB: apply the 2 Stage 08 migrations (`migrate deploy`) when the owner says.
- Toolchain: Node 24 in use vs `engines` `>=22.23.4 <23`.

## Carried corrections

- Stage 08 S08-5 diagnosis was wrong (the write coerced to `JsonNull`); corrected in code
  comments and tests.
- Stage 08 claimed `schedulePublish`/`cancelSchedule` increment `version`; they do not.
- An earlier Stage 09 pass said no Organization markup existed; nested publisher nodes do.
- "87 Stage 09 tests all green" was per suite; the full run had 9 failures, now fixed.
