# 03 — Test Results, Limitations & Remaining Work

## Test results (Phase H — all executed)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx vitest run tests/seoValidator.test.ts` | ✅ 8/8 |
| `npm run test` (full Vitest) | ✅ **428 / 428** (50 files) |
| `npx next build` (dev DB + test DB) | ✅ clean |
| `npx playwright test` (full e2e + axe) | ✅ **53 / 53** |

### Regression coverage added (maps to the Phase H list)
- **Unit (`tests/seoValidator.test.ts`):** passed checks; failed checks; warnings (non-blocking); not-evaluated (scheduled-time when not scheduled); publication blockers; Go-to-Field anchor mapping; empty/incomplete article; blocks-publication flag; evaluated-only tallies. (Existing headline/image-rights/all-pass gate tests retained.)
- **e2e (`e2e/seo-assistant.spec.ts`):** panel + counts + readiness render; **Check SEO** does not save or navigate; **Go-to-Field** focuses the SEO-title input.
- **Server-side enforcement** is covered by the existing article/workflow suites (`tests/cms.test.ts`, `tests/batch15-editor.test.ts`, governance) — the publish gate reuses the same engine and was not weakened.
- **Permission boundaries:** the editor is reachable only by staff with `cms.access` (Batch 24 fix) + the article-edit permissions; the SEO panel is part of that gated editor.

No existing test was weakened to make the new code pass.

### Desktop & mobile
The panel lives in the editor's right inspector column. On desktop it sits beside the fields; at narrow widths the editor's two-column grid collapses to a single column (`grid-cols-1 lg:grid-cols-12`), so the panel stacks below the fields and remains fully usable (counts grid is 3-up, findings are full-width expandable rows). Verified via the e2e viewport + screenshot.

## Known limitations
- **Client checks ≠ full server gate.** The panel validates editor content; the server additionally verifies managed-image `rightsConfirmed`, and that linked relationships/sources still exist. The panel says so and never guarantees publication — but it cannot show those DB-only failures until a publish attempt returns them.
- **Broken-internal-link checking** is heuristic (presence of related/internal links), not a live crawl — consistent with the spec's "where reliably verifiable" caveat; no network link-checking was added.
- **Duplicate-metadata detection** across articles is not performed client-side (no DB evidence available in the editor snapshot); it remains out of scope absent a server endpoint.
- **"Why it matters"** text is a static one-line rationale per category (editorial guidance), not a per-article computed value.

## Remaining work / possible follow-ups
- Optional: a server action to return the DB-backed publish checks (unconfirmed rights, deleted relations/sources) so the panel can surface them *before* a publish attempt.
- Optional: surface the persisted **SEO Intelligence** findings (system #1) inside the same panel as a separate "Audit findings" tab.
- Optional: duplicate SEO-title/meta detection via a server query.

## Safety / scope confirmation
Batch 23 & 24 changes preserved. No unrelated redesign. Existing validation engine reused (no new engine). No Git commit/push, no deployment, no cloud changes, no DB migration, no DB reset, no destructive operations.
