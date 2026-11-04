# 09 — Responsive UI, Accessibility & Browser QA

**Mode:** READ-ONLY. Evidence: Tailwind usage in `components/**`, `app/(public)/**`, `app/globals.css`, `e2e/*.spec.ts`. Local dev server liveness verified (HTTP 200 on `/`, `/competitors/`, `/venues/`, `/rodeo-events/`, `/admin/login/`).

## 1. Browser QA actually performed in THIS audit
- **HTTP route smoke only** (GET status codes against local dev server). This is liveness, **not** a rendered-pixel or interaction audit.
- **Full multi-viewport browser rendering (360/390/768/1024/1440) was NOT executed in this pass.** Not claiming it was. Prior sessions ran the `browser-automation` skill and the Playwright+axe e2e suite; those are referenced but not re-run here.
- Playwright + axe e2e is wired into CI (`e2e/a11y.spec.ts`, `e2e/admin.spec.ts`, `e2e/public.spec.ts`) with `a11y-known-issues.json = []` (no accepted violations).

## 2. Responsive implementation (static review)
- Tailwind v4 responsive utilities used throughout; admin tables and wide blocks wrap in `overflow-x-auto` containers (`AdminTabs`, `RichBlockEditor`, `ArticleBody`, `LatestCoverage`, results/standings tables). This is the correct pattern — wide content scrolls within a bounded region rather than pushing the page.
- Public filter bars (`competitors`/`venues`) use `grow min-w-[200px]` inside a flex row — wraps on narrow screens.

## 3. Horizontal-overflow investigation (prior "global minor overflow")
- **Root finding:** `app/globals.css:36` sets `overflow-x: hidden` globally. This **masks** horizontal overflow rather than eliminating its source — the page won't show a horizontal scrollbar, but some child element can still exceed the viewport width (clipped, not reflowed).
- No `100vw` or `w-screen` offenders found in public components; the likely contributors are fixed `min-w-[…]` regions and wide tables, which are already wrapped. The residual "minor overflow" is therefore **cosmetic/clamped**, low severity.
- **Recommendation (P1):** instead of relying on `overflow-x:hidden`, identify the specific overflowing element at 360–390px via the browser skill and constrain it, so the clamp is defensive, not the primary fix. Backlog `P1-UI-01`.

## 4. Accessibility (static + CI evidence)
- Admin a11y (Batch D): keyboard support, focus management, form labels, error announcements reported implemented. axe gating present with zero accepted issues (`a11y-known-issues.json = []`).
- **Not re-verified live** in this pass. Contrast, focus indicators, touch-target sizes, and screen-reader flow should be confirmed with a live axe + manual pass before launch (backlog `P1-A11Y-01`).

## 5. Viewport-by-viewport status (honest)
| Viewport | This audit | Notes |
|----------|-----------|-------|
| 360 px | NOT rendered here | overflow clamp via globals.css; verify true fix |
| 390 px | NOT rendered here | filter bars wrap; verify |
| 768 px | NOT rendered here | admin tables scroll-wrapped |
| 1024 px | NOT rendered here | — |
| 1440 px | NOT rendered here | — |

## 6. Findings
- ✅ Correct scroll-container pattern for wide content.
- ✅ axe gate with no accepted violations.
- ⚠️ `overflow-x:hidden` masks rather than fixes the overflow source (P1).
- ⚠️ Live multi-viewport + manual a11y pass still owed before launch.
