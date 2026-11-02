# Batch 13 — Final Pre-Launch Security Checklist

Complete BEFORE any public deployment. Credential rotation is **deferred by explicit owner decision** and
is **NOT marked complete** here.

## MANDATORY — credential rotation (deferred by owner; must be done pre-launch)
- [ ] **Rotate the Admin login password** (exposed in chat during setup). After rotation, log in on the
      cloud and set a production-only password; invalidate old sessions.
- [ ] **Rotate the Aiven PostgreSQL password** (exposed during setup). Update local `.env` +
      the host's `DATABASE_URL` secret.
- [ ] **Rotate the Cloudflare R2 API token** (exposed during setup). Create a new **bucket-scoped** token;
      update `MEDIA_S3_*` locally + in host secrets; delete the old token.
> Deferral is **not** permission to deploy with exposed credentials. These three items are launch blockers.

## Transport & headers (implemented — verify on host)
- [x] Security headers sent (`next.config.mjs`): `X-Content-Type-Options`, `X-Frame-Options: DENY`,
      `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (effective under HTTPS).
- [x] `/admin/*` → `Cache-Control: private, no-store`; `/api/*` → `no-store`.
- [ ] Confirm HTTPS end-to-end so the session cookie `secure` flag resolves true.

## AuthN / AuthZ (implemented — confirm config)
- [x] DB sessions; bcrypt cost 12; `nfrguide_session` HttpOnly + SameSite=Lax.
- [x] Default-deny RBAC (5 roles / 43 perms) enforced server-side on every mutation; ownership rules.
- [x] Login rate limiting (`lib/auth/rateLimit.ts`).
- [ ] Confirm session TTL + `secure` cookie under production HTTPS.
- [ ] Provision least-privilege runtime DB role (`LEAST_PRIVILEGE_DB_ROLE.md`) — owner approval.

## Environment & secrets (implemented)
- [x] Centralized env validation fails fast in production (`lib/env.ts`).
- [x] Isolation guard blocks unsafe DB/storage combinations (`lib/env-guard.ts`).
- [x] Structured logging redacts passwords/tokens/cookies/connection strings (`lib/logger.ts`).
- [x] `.env*` gitignored; only `.env.example` placeholders committed; no secret in tracked files.
- [ ] Confirm no production secret is ever placed in `NEXT_PUBLIC_*` (only the public site URL is public).

## Data & media exposure
- [x] Public reads constrained to PUBLISHED; draft/private never served; `/search` is noindex.
- [x] Media delivered through the gated proxy; R2 bucket private; Public Dev URL disabled.
- [ ] Confirm no demo/fabricated NFR data is published as if official (editorial review).

## Monetization / analytics
- [x] Analytics collection + monetization tracking remain **disabled by default**; enable only when approved.

## Sign-off
- [ ] All MANDATORY rotation items done. [ ] Host checklist (`DEPLOYMENT_READINESS_CHECKLIST.md`) complete.
      [ ] CI green. [ ] Owner approval to deploy.
