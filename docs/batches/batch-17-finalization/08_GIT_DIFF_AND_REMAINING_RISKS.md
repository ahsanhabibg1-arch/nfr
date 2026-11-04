# Finalization §8-diff — Git Diff & Remaining Risks

## Git state
- Branch `main`, HEAD `6da137d` — **unchanged**. Nothing committed or pushed.
- Working tree carries Batch 17 + finalization changes (uncommitted).

## Modified (tracked, 12)
```
.github/workflows/ci.yml                        +10   (audit gate)
KNOWN_LIMITATIONS.md                            +59/- (status banner, Batch 17)
apps/web/app/admin/auth-actions.ts              login → durable limiter
apps/web/app/admin/competition-actions.ts       expectedVersion required
apps/web/app/api/admin/media/upload/route.ts     upload rate limit (429)
apps/web/components/SiteHeader.tsx               overflow fix (nav breakpoint)
apps/web/lib/auth/rateLimit.ts                   deprecation note (kept as fallback)
apps/web/lib/cms/competitionService.ts           version guard + requireVersion
apps/web/next.config.mjs                          CSP report-only
apps/web/prisma/schema.prisma                     version ×3 + RateLimitHit
apps/web/tests/batch15.test.ts                    pass expectedVersion
apps/web/views/admin/AdminCompetitionPage.tsx     version capture + conflict UX
```
Total code diff ≈ 216 insertions / 44 deletions.

## New (untracked)
```
apps/web/lib/auth/durableRateLimit.ts
apps/web/prisma/migrations/20261104120000_batch17_hardening/migration.sql
apps/web/tests/batch17-concurrency.test.ts
apps/web/tests/batch17-ratelimit.test.ts
apps/web/tests/batch17-sanitization.test.ts
docs/batches/batch-17/            (12 reports)
docs/batches/batch-17-finalization/ (this set)
docs/audits/2026-11-04-full-project-audit/ (prior audit)
```
No untracked secrets. `.env` unchanged and gitignored. Backup dump lives in the scratchpad, outside the repo.

## Remaining risks
**Introduced / accepted (Batch 17):**
- CSP is report-only (not enforcing); limiter fails open on storage error; fixed-window limiter; global `overflow-x:hidden` retained as backstop.
- Login limiter is per IP+email → distributed brute-force against one account is not fully stopped (documented mitigation in report 02; not implemented to avoid a victim-lockout DoS).

**Environmental (not code):**
- Pre-existing Prisma **5s interactive-transaction timeout** in `articleService` can flake under heavy local load (not a Batch 17 regression; passes in isolation + clean full run; CI unaffected). Raising that timeout is a possible future hardening, out of scope here.

**Out of scope — still required before launch (owner/ops):**
- Apply the migration to **Aiven**; rotate Admin/Aiven/R2 credentials; least-privilege Aiven role; host/CD/staging; backup/PITR + rollback; Aiven CA verification; source-verified NFR 2026 content.
- Follow-ups: CSP enforcing (nonce); live manual a11y pass; `prisma@7`/`vitest@5` upgrades to clear dev advisories.
