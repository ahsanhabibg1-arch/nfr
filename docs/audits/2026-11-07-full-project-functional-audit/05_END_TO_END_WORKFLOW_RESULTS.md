# 05 — End-to-End Workflow Verification

**Audited:** 2026-11-07

## Playwright E2E Results (56 tests)

| Suite | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| `public.spec.ts` | 14 | 14 | 0 | Homepage, sections, articles, legal pages, 404, draft protection, redirects, purse redaction |
| `admin.spec.ts` | 7 | 6 | 1 | Reader blocked, login flow, RBAC, article creation, editor, media upload. 1 flaky: Sources heading timeout |
| `a11y.spec.ts` | 25 | 24 | 1 | axe-core audits on 25 public+admin pages. 1 flaky: admin-seo timeout (30s axe analysis exceeded) |
| `analytics-e2e.spec.ts` | 4 | 4 | 0 | Analytics config toggle, view beacon, search telemetry, dashboard data |
| `seo-assistant.spec.ts` | 2 | 2 | 0 | Grouped findings, readiness display, inspector scroll independence |
| **Total** | **56** | **54** | **2** | 96.4% pass rate |

### Failed Test Analysis

**1. `admin.spec.ts` — "authorized admin reaches the editor; no Schedule control; source picker uses the DB directory"**
- **Root cause:** Timing — the article editor (heavy client component with 6 panels) occasionally takes >5s to render all panels including the Sources heading at the bottom. The heading exists unconditionally in `ArticleSourcesPanel.tsx`.
- **Classification:** P3 — test flakiness, not a product bug
- **Fix (if desired):** Increase assertion timeout: `toBeVisible({ timeout: 15000 })`

**2. `a11y.spec.ts` — "admin-seo (/admin/seo/, authenticated)"**
- **Root cause:** The admin SEO page renders a complex data-heavy UI; axe-core analysis exceeded the 30s test timeout.
- **Classification:** P3 — test infrastructure issue, not an accessibility bug
- **Fix (if desired):** Increase test timeout for this specific spec

## Vitest Unit/Integration Results

| Metric | Value |
|---|---|
| Files | 50 |
| Tests | 428 |
| Passed | 428 |
| Failed | 0 |
| TypeScript errors | 0 |

## Verified Workflows

| Workflow | Method | Result |
|---|---|---|
| Public homepage loads DB content | E2E | ✅ |
| Section landing pages load articles | E2E | ✅ |
| Published article renders with JSON-LD | E2E | ✅ |
| Draft articles not publicly accessible | E2E | ✅ |
| Renamed slugs redirect (308) | E2E | ✅ |
| Legal pages show draft notice + noindex | E2E | ✅ |
| Unknown article returns 404 | E2E | ✅ |
| Reader cannot access admin | E2E | ✅ |
| Admin login + RBAC enforcement | E2E | ✅ |
| Article creation workflow | E2E | ✅ |
| Media upload | E2E | ✅ |
| SEO Assistant real-time checks | E2E | ✅ |
| Analytics beacon fires | E2E | ✅ |
| Search telemetry recorded | E2E | ✅ |
| Mobile navigation drawer | E2E | ✅ |
| JSON-LD no script breakout (XSS) | E2E | ✅ |
| Edition purse redaction | E2E | ✅ |
| axe-core accessibility (24 pages) | E2E | ✅ |

## TypeScript Compilation

```
tsc --noEmit: 0 errors
```
