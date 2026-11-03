# Batch 16 — Final Report

**Branch:** `batch-01-nextjs-migration` · **Commit:** recorded on the Batch 16 commit · **Baseline:** `8323a7e`.
Working tree clean after commit. No Aiven/R2 write; no deploy; no credential rotation; no CDN; no schema
change; no GitHub default-branch change; not pushed (awaiting approval).

## Completed features
- **Database-backed author bylines in the editor** (replaced the Phase-0 mock `AUTHORS`); real author list
  from the DB; no preselected author; byline resolves to the real Author (no duplicates).
- **Author management** confirmed functional (already existed; `author.manage`-gated, audited, orphan-safe).
- **Legacy byline compatibility** (match-or-preserve; amber review warning; no silent reassignment; no bulk
  migration).
- **Article editor production readiness** verified: new=blank, existing=preserved, publication gate intact.
- **Footer directory links** fixed to always surface `/competitors/` + `/venues/`.
- **Real browser QA** performed (public + authenticated admin) — see `07`.

## Content status
- **Implemented & verified:** author system, editor, directories, workflow gate, internal links, SEO
  controls, browser QA of the above.
- **Prepared but not published:** NFR 2026 page structure + source-research checklist.
- **Blocked by missing verification:** all NFR 2026 official facts (dates, venue, schedule, contestants,
  broadcast, tickets) — no web-source tooling this session; **nothing fabricated or published**.
- **Deferred:** public author profile pages; competition optimistic-concurrency version field (see below);
  tablet/mobile screenshot pass; cloud migration apply (none needed this batch).

## Competition concurrency (Workstream G)
Current Admin edits are last-write-wins at the row level (Prisma `update`). A focused optimistic-concurrency
safeguard would require an additive `version` column + widespread wiring — out of the "no broad redesign /
prefer no schema change" scope. **Mitigation documented:** result **corrections are append-only** (a
correction creates a new linked record and archives the original — the published official value is never
silently overwritten), so authoritative-result integrity is preserved. Recommended as a Batch 17 item.

## Tests / build
prisma valid; tsc clean; vitest **249/249** (33 files, +7); FTS gate 5/5; next build PASS; browser QA done.

## Data/storage safety
No schema change; no Aiven/R2 write; FTS/GIN preserved; local dev + test data intact; no secrets committed.

## Remaining risks / launch blockers (unchanged, owner)
Credential rotation (Admin/Aiven/R2) — mandatory pre-launch; hosting selection; least-privilege DB role;
cloud migration apply (Batch 14); **verified NFR 2026 content** (editorial, source-gated).

## Recommended Batch 17
1. NFR 2026 content entry once official sources are human-verifiable (dates/venue/schedule/contestants) —
   via the CMS, source-registered, verification-gated.
2. Competition optimistic concurrency (additive `version` + conflict handling) + tablet/mobile QA pass +
   fix the global horizontal-overflow.
3. Public author profile pages (if attribution/SEO warrants) + author avatars via the Media Library.
4. Deployment readiness execution: credential rotation, least-privilege role, hosting + cloud migration
   apply, monitoring.

Not production-ready.
