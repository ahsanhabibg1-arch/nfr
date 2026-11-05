# 10 — Remaining Work & Follow-ups

## Owner review gate (immediate)

- Review Batch 24, then **commit and push** (no commit was made this session). All
  changes are in the working tree (see `git status`; file inventory in report 00 /
  the final chat report).

## Test suites — all green (nothing outstanding)

- The Batch 24 DB suite (14 tests) and the full Playwright + axe e2e (49 tests) **ran
  and passed** this session; `TEST_DATABASE_URL` is already in `apps/web/.env`. No
  follow-up needed. (An earlier draft wrongly called these "blocked" — corrected in
  reports 00 and 08.)

## Before production launch

1. **Secret rotation** (carried from earlier batches) — rotate any Aiven / R2 /
   admin credentials that were ever exposed. Owner-only. Not complete.
2. **Email provider** — wire a provider so email verification and password-reset
   links actually send. Today the token lifecycle is implemented and unit-tested
   but delivery is intentionally disabled. Decide the activation policy (e.g.
   require verification before commenting, or keep comments open to ACTIVE readers).
3. Apply the additive Batch 24 migration to the production (Aiven) database **via
   `prisma migrate deploy`** during a controlled deploy — never reset.

## Possible future enhancements (not in scope for Batch 24)

- Reader-facing "edit / delete my own pending comment" affordance.
- Comment threading / replies (current model is flat).
- Moderator email notifications when a comment is pending.
- Rate-limit tuning and a soft "comment cooldown" message with retry timing.
- A reader "verify your email" banner once delivery is enabled.
- Pagination on the public comment list for very active articles.

## Known, accepted characteristics

- Migration-replay runs in FTS-fallback mode locally (role lacks CREATEDB);
  CI does the full from-zero replay. Documented, not a defect.
- Account/auth pages are `noindex`; account pages are `force-dynamic` and redirect
  to `/login/` when unauthenticated — by design.
