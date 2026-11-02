# 08 — Verification Evidence

Exact commands, environment/isolation, results, and limitations. No secrets printed. No mutation of real
databases, media, sessions or external services.

## Environment / isolation
- **Unit/integration tests** run against `TEST_DATABASE_URL` (a **disposable local** `nfrguide_test` DB —
  the harness truncates it), **never** the dev or Aiven DB. Forced `MEDIA_STORAGE_PROVIDER=local` so no
  R2 write could occur.
- **Read-only cloud checks** use `CLOUD_DATABASE_URL` with `SELECT`/`count(*)` only.
- All helper scripts redact hosts and never print URIs/passwords.

## Commands & results (actual)
| Check | Command | Result |
|---|---|---|
| Git baseline | `git rev-parse --abbrev-ref HEAD` / `git log -1` / `git status` | branch `batch-01-nextjs-migration`, HEAD `a0c0190`, **clean** |
| Prisma schema | `npx prisma validate` | **valid** |
| TypeScript | `npx tsc --noEmit` | **exit 0 (clean)** |
| Unit+integration tests | `MEDIA_STORAGE_PROVIDER=local npx vitest run` | **27 files, 212 tests, all passed** (~55s) |
| Migration inventory | `ls prisma/migrations` | **11** (init → batch12), + lock |
| Dependency versions | `package.json` | next 16.4.3, react 19.2.0, prisma/@prisma 6.19.3, zod 4, sharp 0.33.5, @aws-sdk/client-s3 3.x, vitest 3.2.4 |
| Public routes | `find app/(public) -name page.tsx` | 11 route families (home, [section], articles, categories, disciplines, rodeo-events + edition, venues, competitors, search) + sitemap/robots |
| Admin modules | `find app/admin/(dashboard) -name page.tsx` | 16 modules + overview |
| API routes | `find app/api -name route.ts` | media delivery, media upload, analytics event |
| Server actions | `ls app/admin/*.ts` | 16 action files |
| NFR-2026 models | `grep -ciE 'model (Schedule|Result|Standing|Ranking|Broadcast|Ticket|Stream)' schema.prisma` | **0** (not modeled) |
| Rate limiting | `grep -rln rateLimit lib/` | `lib/auth/rateLimit.ts`, `lib/analytics/rateLimit.ts` present |
| Env validation module | `ls lib/env*.ts config/env*.ts` | **none** |
| Competitor/venue index | `ls app/(public)/competitors/page.tsx …/venues/page.tsx` | **none** (only `[slug]`) |
| Cookie flags | `grep httpOnly/sameSite/secure lib/auth` | HttpOnly, SameSite=Lax, secure present |
| bcrypt cost | `grep COST lib/auth/password*` | **12** |
| Deploy config | `ls next.config.* Dockerfile vercel.json .github/workflows` | only `next.config.mjs` (no CI/Docker/vercel/health) |
| Monetization/analytics default | `grep 'disabled by default' lib/*` | collection/monetization **disabled by default** |

## Read-only cloud verification (from prior migration/verify, re-confirmed read-only)
- `scripts/cloud-db.mts verify` → all 17 expected tables, `Article.searchVector` tsvector + GENERATED,
  **GIN index**, `websearch_to_tsquery` works, `LandingEntityType` has VENUE+COMPETITOR, **70 FKs**, 11
  migrations applied / 0 rolled back. **ALL PASSED.**
- Local↔cloud parity (post-migration): all content/identity tables match; cloud `Session`=0 (excluded).
  → currently **synchronized** (will diverge on edit; no auto-sync).

## Limitations (not verified here — by design or constraint)
- **`next build` was not re-run in this audit** (to avoid any env-dependent side effects per the read-only
  mandate); it **passed at `a0c0190`** and earlier commits. Re-run with `MEDIA_STORAGE_PROVIDER=local` if a
  fresh build confirmation is wanted.
- **No browser/E2E** was performed in this audit — no such claim is made.
- **SEO outcomes, Core Web Vitals field data, crawl/index coverage, a11y conformance** require a deployed
  site + external tools; only the **controls** are verified.
- **Monetization** flows are present but **not exercised live** (disabled by default).
- **R2 live writes** were not performed in this audit (read-only ListObjectsV2 earlier showed bucket `nfr`
  = 0 objects).

## Integrity statement
No application code, schema, migration, database record, media object, environment variable, credential,
branch or deployment was modified by this audit. All findings are from inspection, non-mutating tests, and
read-only queries. No secret, password hash, session token or connection string is included in these docs.
