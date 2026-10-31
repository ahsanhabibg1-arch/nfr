# Batch 06 — Test Report

> Audience: reviewers verifying Batch 06. What was tested, how, and the actual
> results on 2026-10-31 (Windows 10, PostgreSQL 17, Next.js 16.4.3).

## 1. Summary

| Suite | Command | Result |
|---|---|---|
| Prisma schema validation | `npx prisma validate` | **PASS** |
| Prisma client generation | `npx prisma generate` | **PASS** (v6.19.3) |
| Type checking | `npm run typecheck` | **PASS** (0 errors) |
| Unit + integration (all) | `DATABASE_URL=<test> npx vitest run` | **PASS** — 106/106 across 13 files, deterministic ×2 |
| SEO Intelligence integration | `… vitest run tests/seo-intel.test.ts` | **PASS** — 11/11 |
| Production build | `npm run build` | **PASS** — all routes incl `/admin/seo` |
| Public route smoke (prod) | `npm run test:routes` | **PASS** — 24/24 |
| Authenticated admin routes (prod) | `tsx scripts/admin-auth-smoke.mts` | **PASS** — 8/8 (incl `/admin/seo`, `/admin/media`) |
| Media upload/delivery (prod) | `tsx scripts/media-http-check.mts` | **PASS** — 7/7 |
| Publish/unpublish cache (dev) | `npm run test:cache` | **PASS** — 10/10 |

Vitest runs against the **test** database; HTTP smoke/media against the
**production** server (`npm run start`); the cache harness against **dev** (its
design target — see BATCH04/05 reports). No production data modified; no
migrations reset.

## 2. SEO integration suite (`tests/seo-intel.test.ts`, 11 tests → §22's 25 areas)

- **RBAC (§22.1, .2, .24):** Author cannot run audits; Editor + SEO Manager can;
  Editor cannot change thresholds, SEO Manager can.
- **Analyzer coverage (§22.3–.16):** one assertion group verifies the expected
  findings are produced for crafted defects — missing SEO title/meta/excerpt,
  duplicate SEO title + meta description, missing/mismatched canonical, published
  `noindex`, future publish date, broken internal link, image private-on-
  published + no-ALT + unconfirmed-rights, rodeo edition/event mismatch, duplicate
  entity slug, orphan article, and link opportunity.
- **Persistence/dedup (§22.17, .18):** repeated runs keep a single finding per
  stable fingerprint (no duplicates).
- **Resolution + reopening (§22.19):** fixing the defect auto-resolves the
  finding (verified); reintroducing it **reopens the same finding**.
- **Audit history (§22.20):** each run is recorded with a completed status.
- **Concurrency (§22.21):** a `running` audit blocks a new one (`conflict`).
- **Scope (§22.22):** an article-scoped audit writes findings only for that
  article.
- **Workflow (§14):** manage permission required; status + resolver recorded.
- **Author-owned visibility (§22.23):** an Author's finding list contains only
  findings on articles they created.
- **Publication workflow intact (§22.25):** SEO is advisory — a normal article
  still transitions to PUBLISHED unaffected.

## 3. Hardening found during verification

The full audit scans all articles; under the parallel test runner a concurrently
deleted article could cause an FK error on finding insertion. The orchestrator
now **tolerates an entity deleted mid-scan** (skips that finding and does not
count it as seen), which fixed the flaky parallel failure and is a real
production hardening for long audits. The full suite is deterministic (106/106
on two consecutive runs).

## 4. Analysis-mode honesty

The SEO technical checks are **static/database analysis**, not HTTP-verified
crawls — see TECHNICAL_SEO_AUDIT.md. Real HTTP behavior is verified separately by
the route/admin/media/cache smoke suites above. The engine makes no network
requests. No Google rankings, impressions, clicks, CTR, traffic, Search Console,
AdSense or backlink data is produced (out of scope; shown as "not connected").

## 5. How to reproduce

```bash
cd apps/web
npx prisma validate && npx prisma generate && npm run typecheck
DATABASE_URL="$TEST_DATABASE_URL" npx vitest run        # 106/106
npm run build                                           # stop any dev server first (Windows)
npm run start & ; npm run test:routes ; npx tsx scripts/admin-auth-smoke.mts ; npx tsx scripts/media-http-check.mts
# then (dev):
npm run dev & ; npm run test:cache
```
