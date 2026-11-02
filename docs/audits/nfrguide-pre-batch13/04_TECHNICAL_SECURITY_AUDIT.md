# 04 — Technical & Security Audit

Read-only. No secrets printed. Evidence = files/tests/read-only queries.

## Authentication
- **DB-session model:** opaque token (SHA-256 hashed in `Session.tokenHash`), `nfrguide_session` cookie
  **HttpOnly**, **SameSite=Lax**, `secure` set (confirm it resolves true under HTTPS in production).
- **Passwords:** bcrypt **cost 12** (`lib/auth/password*.ts`); min length enforced on bootstrap/change.
- **Sessions:** expiry-bound (`expiresAt` indexed); suspended users rejected. Login **rate-limited**
  (`lib/auth/rateLimit.ts`). Logout + account self-service (`/admin/account/`) present.
- **Verified by:** `auth.test.ts`, `team.test.ts`. **Gap:** confirm production cookie `secure=true` and
  session TTL policy on the deployed host (P1).

## RBAC & authorization
- Default-deny matrix in code (`lib/auth/rbac.ts`): 5 roles (Super Admin, Administrator, Editor, Author,
  SEO Manager), 43 permissions, mirrored to DB via `roleSync`. Module→permission registry
  (`lib/auth/permissions.ts`) gates admin views + sidebar; **every mutation re-checks server-side** via
  `guard.ts` (`requireActor(perm)`), with ownership rules for Authors. Verified: `rbac.test.ts`,
  `permissions-unit.test.ts`, `governance.test.ts`.
- **Server Actions + API routes** authorize server-side; Next.js Server Actions carry built-in CSRF
  protection (origin-checked POST). Media upload + delivery authorize via `media.*` + visibility gate.

## Database
- PostgreSQL; 11 additive migrations; Aiven PG 18.6 destination verified (read-only): 17 expected tables,
  70 FKs, unique constraints (slugs), **generated `Article.searchVector` tsvector + GIN index intact**,
  `websearch_to_tsquery` works, enums incl. `LandingEntityType` (7 values). No duplicate-slug or orphan
  issues observed in the migrated set; media `legacy-local` rows reference static assets.
- **Local vs cloud:** currently **synchronized** (post-migration parity = all content tables match;
  cloud `Session`=0 by design). They will diverge as soon as either side is edited — **no auto-sync** (by
  design). Least-privilege: Aiven `avnadmin` is broad (`createdb`, not superuser) — recommend a dedicated
  runtime role separate from migrations (P1).

## Storage / media security
- Backend-agnostic adapter (`local` | `r2`/`s3`); R2 verified round-trip 7/7; endpoint origin-normalized.
- **Delivery is gated:** `publicUrl` returns `/api/media/<key>` for all backends (not a direct bucket
  URL); the proxy enforces PUBLIC+READY for anon vs `media.view` for draft/archived. R2 bucket kept
  **private** (Public Dev URL should stay disabled). Verified: `r2-storage.test.ts`, `media.test.ts`.
- **Risk — environment mixing:** `MEDIA_STORAGE_PROVIDER` and `DATABASE_URL` are independent, so a local
  `.env` with `provider=r2` + local DB writes blobs to production R2 while metadata lands in the local DB.
  No code guard prevents this today (P1 — propose a guard, do not implement in this audit).

## Secrets handling
- `.env*` gitignored (only `.env.example` placeholders committed); scripts redact hosts and never print
  URIs/passwords; no secret found in tracked files (scanned).
- **P0 — rotation required before launch:** the **admin login password**, **Aiven DB password**, and the
  **R2 API token** were each exposed in chat during setup. Rotate all three, update local `.env` + host
  secrets, and change the admin password after first cloud login.

## Infrastructure / production config
- Present: `next.config.mjs` (trailingSlash, etc.), server-only Prisma singleton (`lib/db.ts`), TLS to
  Aiven (`sslmode=require`).
- **Missing (P1 for deploy):** env-var validation module; health-check endpoint; error monitoring
  (only a `SENTRY_DSN` placeholder in `.env.example`); CI/CD (`no .github/workflows`); host/deploy config
  (no Dockerfile/vercel.json); connection pooling (PgBouncer/Accelerate) for serverless; documented
  rollback + backup/PITR policy; production bootstrap runbook.

## Security risk register
| # | Risk | Severity | Action |
|---|---|---|---|
| S1 | Exposed admin/DB/R2 credentials still active | **P0** | rotate all three before deploy |
| S2 | Env-mixing (provider r2 + local DB) unguarded | P1 | add startup guard (next batch) |
| S3 | No prod secret/env validation at boot | P1 | add env schema validation |
| S4 | Broad DB role for runtime (`avnadmin`) | P1 | dedicated least-privilege app role |
| S5 | No error monitoring / health / CI | P1 | wire before/at deploy |
| S6 | Media bytes via Next proxy (cost/perf, no CDN) | P2 | public CDN for published derivatives |
| S7 | R2 Public Dev URL must remain disabled | P1 | confirm + keep disabled |

No destructive action, no write to Aiven/R2, no credential change was performed in this audit.
