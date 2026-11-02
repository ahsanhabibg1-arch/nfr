# 07 — Recommended Batch Roadmap

Evidence-based, smallest-sensible batches with clear dependencies. The previously-assumed Batch 13–16
scopes are **not** treated as final. Nothing here is implemented in this audit.

**Guiding order:** security blockers → deployment safety → NFR-2026 launch-essential → public experience →
SEO/content → post-launch. Credential rotation (P0) is an **owner action**, not a batch.

---

### Batch 13 — Production Hardening & Deploy Readiness (P0/P1)
- **Objective:** make the platform safe to deploy.
- **Includes:** env-var validation at boot; an **environment-mixing guard** (assert `MEDIA_STORAGE_PROVIDER`
  ↔ `DATABASE_URL` environment agree); health-check endpoint; error monitoring wiring (Sentry or chosen
  vendor); connection-pooling config; dedicated least-privilege Aiven app role; documented backup/PITR +
  rollback runbook; production bootstrap runbook; CI (typecheck + tests + build).
- **Excludes:** new editorial features; actual deploy; monetization.
- **Depends on:** owner credential rotation (P0); host/monitoring/pooling decisions.
- **Risks:** host-specific config; pooling choice affects Prisma client setup.
- **Acceptance:** boot fails fast on bad/missing env; guard blocks mixed storage/DB; health endpoint green;
  CI runs tsc+vitest+build; least-privilege role verified read/write; docs complete. **No prod data touched.**
- **Complexity:** M. **Testing:** unit for env/guard; CI dry-run; read-only cloud verify.

### Batch 14 — NFR-2026 Core Coverage Data Models (P1)
- **Objective:** structure the launch-critical NFR-2026 surface.
- **Includes:** additive models `Schedule` (per edition/day), `Result`, `Standing/Ranking` (edition-scoped,
  verified-only, no fabrication) + admin CMS + public rendering + JSON-LD where valid; an **NFR-2026
  landing hub** page (reuse Hub/Event + EntitySeo/EntityFaq). Broadcast/streaming + tickets handled as
  **editorial articles + existing affiliate links** (decision: model vs content — see owner decisions).
- **Excludes:** inventing any schedule/result/standing/broadcast/ticket data.
- **Depends on:** Batch 13 (safe env); **verified official NFR-2026 data** (editorial).
- **Risks:** data availability/verification; schema must stay additive + preserve FTS/GIN.
- **Acceptance:** editors can create/edit/publish schedules/results/standings; public pages render only
  published+verified data; empty states clean; FTS/GIN intact; migration additive (no DROP).
- **Complexity:** M–L. **Testing:** unit + DB-gated service tests; route/admin smoke; FTS gate.

### Batch 15 — Public Discoverability & Media Delivery (P2)
- **Objective:** crawlable, linkable public surface + CDN.
- **Includes:** `/competitors/` and `/venues/` index pages; cross-linking/breadcrumbs; sitemap additions;
  public **CDN delivery** for published derivatives only (custom domain, private originals preserved);
  extend `AnalyticsEntityType` for venue/competitor views.
- **Excludes:** exposing drafts; direct public originals.
- **Depends on:** Batch 13 (delivery/env), owner domain decision.
- **Risks:** public/private split must not leak originals.
- **Acceptance:** index pages list only indexable entities; sitemap updated; published media served via
  CDN; drafts still gated; tests for visibility.
- **Complexity:** M. **Testing:** route smoke; visibility tests; sitemap assertions.

### Batch 16 — Editorial Content Production & SEO Finalization (P1, editorial-led)
- **Objective:** replace seed/demo with real verified content; finalize SEO.
- **Includes:** author NFR-2026 + evergreen content from verified sources; per-entity SEO/FAQ; internal
  linking; post-deploy SEO verification (Search Console, sitemap submission, CWV monitoring); SEO
  Intelligence scheduled scans.
- **Excludes:** code redesign; fabricated facts.
- **Depends on:** Batches 13–15; deployed site for SEO outcome verification.
- **Risks:** content accuracy (human verification required).
- **Acceptance:** launch content set published + reviewed; SEO controls confirmed on the live site.
- **Complexity:** L (mostly editorial). **Testing:** publication-gate + eligibility regression; smoke.

### Batch 17 (post-launch) — Monetization & Enhancements (P2/P3)
- Enable AdSense/affiliate **only when approved**; disclosures/labeling already exist. Plus a11y
  automation, richer media UX, standings history, advanced search. **Not a launch prerequisite.**

---
## Sequencing summary
P0 rotation (owner) → **B13 hardening** → **B14 NFR models** (parallel editorial research) →
**B15 discoverability/CDN** → **B16 content + SEO finalize + deploy** → **B17 post-launch**.
Each batch is independently testable and additive; none requires a platform redesign.
