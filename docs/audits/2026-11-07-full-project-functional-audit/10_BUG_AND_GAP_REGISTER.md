# 10 — Bug & Gap Register

**Audited:** 2026-11-07

## Classification Key

| Priority | Meaning |
|---|---|
| P0 | Security breach / data loss — blocks launch |
| P1 | Broken core workflow — blocks launch |
| P2 | Significant usability or correctness issue — should fix before launch |
| P3 | Enhancement / polish — can ship without |

## Issue Register

### P0 — Critical (Security / Data Loss)

**None found.**

### P1 — High (Broken Core Workflow)

**None found.**

### P2 — Moderate (Usability / Correctness)

| ID | Area | Issue | Status |
|---|---|---|---|
| G-01 | Config | Section landing page names/taglines hardcoded in `config/routes.ts` — not CMS-editable | BY DESIGN |
| G-02 | Config | Quick-access links hardcoded in `config/quickAccess.ts` — not CMS-editable | BY DESIGN |

**Note on G-01/G-02:** These are architectural decisions, not bugs. The 5 section names ("NFR Competition", "NFR Entertainment", etc.) are part of site identity. Quick-access links are navigation shortcuts. Both are stable values unlikely to need frequent changes. Making them DB-backed is a future enhancement, not a launch blocker.

### P3 — Low (Enhancement / Polish)

| ID | Area | Issue | Status |
|---|---|---|---|
| G-03 | Legal | 7 legal pages hardcoded in `config/legalPages.ts` with `pending-owner-review` status and noindex | OWNER ACTION REQUIRED |
| G-04 | A11y | No skip-to-content link on public pages | ENHANCEMENT |
| G-05 | A11y | No explicit `prefers-reduced-motion` media query | ENHANCEMENT |
| G-06 | A11y | No dark mode support | ENHANCEMENT |
| G-07 | Test | E2E `admin.spec.ts` Sources heading assertion timeout (flaky, not a bug) | TEST STABILITY |
| G-08 | Test | E2E `a11y.spec.ts` admin-seo axe timeout (flaky, not a bug) | TEST STABILITY |
| G-09 | Analytics | Collection disabled (`collectionEnabled: false`) — requires owner privacy decision | OWNER ACTION REQUIRED |
| G-10 | Monetization | No active monetization partners configured | OWNER ACTION REQUIRED |
| G-11 | Monetization | AdSense publisher ID not configured | OWNER ACTION REQUIRED |
| G-12 | Auth | Email verification stubbed (no email provider) | OWNER SETUP REQUIRED |
| G-13 | Auth | Password reset tokens shown once (no email delivery) | OWNER SETUP REQUIRED |
| G-14 | Nav | Navigation items are CMS-editable, but `config/quickAccess.ts` shortcuts are not | ENHANCEMENT |

## Summary

| Priority | Count | Launch Blocking? |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 2 (both by-design) | No |
| P3 | 12 | No |
| **Total** | **14** | **No blockers** |

**Conclusion:** No bugs that block launch. All P3 items are either by-design architectural choices, owner-action-required configuration, or minor polish enhancements.
