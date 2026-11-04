# Batch 21 §A — Security Gap Assessment

Legend: ✅ verified secure · 🛠 fixed this batch · 📋 enhancement/assessed · ⛔ ops/staging-dependent.

| Control | Status | Evidence |
|---------|:------:|----------|
| DB-backed login rate limiting | 🛠 | `durableRateLimit` + `auth-actions` — **was** fail-open + IP+email-only; now fail-closed + per-account limit. |
| Media upload rate limiting | 🛠 | `api/admin/media/upload` — now 503 on storage failure, 429 on threshold. |
| Session authentication | ✅ | SHA-256 token, HttpOnly/Secure(prod)/SameSite=Lax, expiry + suspended checks (`lib/auth/session.ts`). |
| Authentication failure responses | ✅ | generic "Invalid email or password" (no enumeration); new "temporarily unavailable" on limiter fail-closed is also enumeration-safe (checked before user lookup). |
| Security headers | ✅ | nosniff, X-Frame DENY, Referrer, HSTS (no preload), Permissions-Policy, admin/API no-store (`next.config.mjs`). |
| CSP report-only | 🛠 | present; now with first-party `report-uri /api/csp-report/`. |
| Error logging & redaction | ✅ | `lib/logger.ts` redacts secret keys/values; `report()` + `log.*`; new structured events add no secrets. |
| API request validation | ✅ | Zod across actions; upload content-length cap + signature re-check; CSP receiver size-capped. |
| Admin authorization boundaries | ✅ | `requireUser()` gate + per-action `requireActor(perm)` default-deny + audit (verified by rbac/governance suites + Playwright). |
| Dependency security | 📋 | no prod-runtime critical/high; dev-only criticals (vitest→tinypool); CI gate passes (Stage F). |
| Production configuration safeguards | ⛔ | env validation + isolation guard present (Batch 13); credential rotation / least-priv Aiven role / Aiven CA remain owner-ops P0. |

## Confirmed vulnerabilities found & fixed
1. **Rate-limiter fail-open** (Batch 20 finding) — a limiter storage error silently allowed the request → unlimited attempts during an outage. **Fixed: fail-closed.**
2. **Distributed single-account brute-force** — login keyed only by IP+email allowed an attacker with many IPs effectively unlimited guesses on one account. **Fixed: added a per-account cross-IP limit.**

## Reliability weaknesses
- Limiter now fail-closed: a DB outage blocks login/upload — acceptable (the DB is required for both anyway), with a short 30s self-healing retry.

## Non-blocking / deferred
- External monitoring (Stage C), CSP enforcement (Stage D), `next/image` (Stage E), prisma/vitest upgrades (Stage F), legacy Vite cleanup (Stage G) — all documented, none forced.
