# Batch 19 — Remaining Limitations

## Admin (non-blocking enhancements)
- **Unsaved-change guard** — long editor/competition forms do not warn before navigating away with unsaved input. Enhancement, not a defect. → Batch 20.
- **Per-module error granularity** — one error boundary covers the whole `(dashboard)` content area; per-module boundaries could localize failures further. Current coverage is adequate.
- **Scheduled publishing** — intentionally manual-publish only (no cron auto-publish); surfaced honestly in the UI. Deferred by design (Batch A/D8).

## Carried from earlier batches (unchanged by Batch 19)
- CSP is **report-only** (Batch 17) — enforce via nonce later.
- Rate limiter **fails open** on storage error; login key is per IP+email (distributed brute-force documented in Batch 17 finalization).
- Global `overflow-x: hidden` retained as a backstop (Batch 18).
- Pre-existing Prisma 5s interactive-transaction timeout can flake under heavy local load (not a regression; CI unaffected).

## Blocked (content / owner-ops — not code)
- **NFR 2026 editorial content** — ⛔ source-verified human entry; never fabricated. Infrastructure ready.
- **P0 launch blockers:** rotate Admin/Aiven/R2 credentials; least-privilege Aiven role; apply the Batch 17 migration to Aiven; host + CD + staging; backup/PITR + rollback; Aiven CA verification.

## Explicitly out of scope / not done
- No schema change, no public-facing change, no new admin modules, no external services.
- No commit/push; Batch 17 + 18 uncommitted work preserved intact.
