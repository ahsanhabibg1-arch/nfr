# 13 — Remaining Work Backlog (Prioritized)

**Mode:** READ-ONLY (planning only). Complexity: S/M/L/XL. Priorities: P0 launch blocker · P1 pre-launch · P2 post-launch.

---

## P0 — Launch blockers

### P0-SEC-ROTATE — Rotate previously-exposed credentials
- **State:** NOT DONE (owner-deferred). **Never mark complete until actually rotated.**
- **Missing:** rotate Super Admin password, Aiven DB password, R2 access key/secret; invalidate old.
- **Why:** secrets were exposed in chat; live credentials must not reach production.
- **Deps:** none. **Risk:** HIGH. **Complexity:** S. **Approval:** user-performed (secrets). **Batch:** Launch-Prep.
- **Acceptance:** all three rotated; app still connects with new values; old creds revoked.
- **Verify:** login with new admin pw; app DB connectivity; R2 round-trip with new keys.

### P0-DB-LEASTPRIV — Least-privilege Aiven app role
- **State:** MISSING. **Missing:** dedicated non-superuser DB role for app `DATABASE_URL`.
- **Why:** app should not run as DB admin. **Deps:** P0-SEC-ROTATE. **Risk:** MED. **Complexity:** S. **Approval:** yes (cloud). **Batch:** Launch-Prep.
- **Acceptance:** app connects via scoped role; migrations run via separate privileged role. **Verify:** read-only `migrate status` + app smoke.

### P0-DB-AIVEN-VERIFY — Verify Aiven migration + data state
- **State:** claimed, UNVERIFIED. **Missing:** read-only `prisma migrate status` against Aiven; confirm 12 migrations applied + row parity.
- **Why:** cannot infer applied-state from Git. **Deps:** creds. **Risk:** MED. **Complexity:** S. **Approval:** yes (connect). **Batch:** Launch-Prep.
- **Acceptance:** `migrate status` = up-to-date, no pending. **Verify:** command output captured.

### P0-INFRA-HOST — Choose host + CD + staging
- **State:** MISSING. **Missing:** hosting platform, deploy/CD workflow, isolated staging env.
- **Why:** no path to ship safely/repeatably. **Deps:** none. **Risk:** HIGH. **Complexity:** L. **Approval:** yes. **Batch:** Deploy.
- **Acceptance:** staging deploy green; CD pipeline from `main`. **Verify:** route-smoke against staging URL.

### P0-INFRA-BACKUP — Backup/PITR + rollback runbook
- **State:** DOCS-ONLY. **Missing:** verified Aiven backup/PITR schedule + written rollback procedure.
- **Why:** data-loss / bad-deploy recovery. **Deps:** host. **Risk:** HIGH. **Complexity:** M. **Approval:** yes. **Batch:** Deploy.
- **Acceptance:** restore test documented; rollback steps validated on staging.

### P0-CONTENT-NFR2026 — Verified NFR 2026 editorial content
- **State:** MISSING / content-blocked. **Missing:** source-verified dates/venue/broadcast/contestants/schedule/tickets (report 10 checklist).
- **Why:** site's launch purpose; must be accurate, never fabricated. **Deps:** external official sources. **Risk:** HIGH (editorial/legal). **Complexity:** XL (human). **Approval:** editorial. **Batch:** Content.
- **Acceptance:** each published item cites a verified `Source`; `verification=VERIFIED`. **Verify:** editorial review + JSON-LD only on verified data.

---

## P1 — High-priority pre-launch

### P1-CONC-01 — Optimistic concurrency for competition
- **State:** CONFIRMED gap (last-write-wins). **Missing:** `version` field + conflict check on CompetitionSession/Result/Standing, mirroring Article.
- **Why:** concurrent edits silently overwrite results/corrections. **Deps:** additive migration. **Risk:** MED. **Complexity:** M. **Approval:** no (local). **Batch:** Next.
- **Acceptance:** concurrent save returns conflict, not overwrite. **Verify:** unit test for version mismatch.

### P1-SEC-01 — Content-Security-Policy header
- **State:** MISSING. **Missing:** CSP (report-only → enforce) in `next.config.mjs`; add HSTS `preload`.
- **Why:** XSS blast-radius reduction. **Risk:** MED. **Complexity:** M. **Approval:** no. **Batch:** Next.
- **Acceptance:** CSP present; no console CSP breakage on key pages. **Verify:** browser skill render + header check.

### P1-SEC-02 — Rate limiting (login/upload)
- **State:** MISSING. **Why:** brute-force/abuse. **Risk:** MED. **Complexity:** M. **Approval:** no. **Batch:** Next.
- **Acceptance:** throttling on `/admin/login/` + upload. **Verify:** test burst → 429.

### P1-SEC-03 — Body-HTML sanitization + `npm audit` in CI
- **State:** POTENTIAL / NOT RUN. **Missing:** confirm article body render doesn't inject untrusted HTML; wire `npm audit` gate.
- **Risk:** MED. **Complexity:** S. **Approval:** no. **Batch:** Next.

### P1-UI-01 — Root-cause horizontal overflow
- **State:** masked by `globals.css overflow-x:hidden`. **Missing:** find + constrain the overflowing element at 360–390px.
- **Risk:** LOW. **Complexity:** S. **Approval:** no. **Batch:** Next. **Verify:** browser skill at 360/390/768.

### P1-A11Y-01 — Live axe + manual a11y pass
- **State:** CI axe present; live/manual not re-verified. **Risk:** LOW-MED. **Complexity:** M. **Batch:** Next.

### P1-SSL-01 — Proper Aiven CA verification
- **State:** `rejectUnauthorized:false` in scripts. **Missing:** pin Aiven CA, enable verification in prod.
- **Risk:** MED. **Complexity:** S. **Approval:** yes (cloud). **Batch:** Deploy.

### P1-DOC-01 — Fix stale `KNOWN_LIMITATIONS.md` Phase 0 preamble
- **State:** stale. **Risk:** LOW. **Complexity:** S. **Batch:** Next.

---

## P2 — Post-launch

- **P2-CLEANUP-01** — Remove leftover Phase 0 Vite SPA from repo root (`src/`,`dist/`,`index.html`,`vite.config.ts`,`bun.lock`, root `package.json`). Complexity S.
- **P2-OBS-01** — External error tracking / APM / uptime monitoring. Complexity M.
- **P2-AUTHORPROF-01** — Optional public author profile pages. Complexity M.
- **P2-ANALYTICS-01** — Advanced analytics dashboards / provider sync depth. Complexity M.
- **P2-PERF-01** — ISR/caching tuning + image CDN optimization review. Complexity M.
