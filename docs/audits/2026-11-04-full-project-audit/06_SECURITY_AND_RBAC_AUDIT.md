# 06 — Security & RBAC Audit

**Mode:** READ-ONLY. No secrets printed. Evidence: `lib/auth/*`, `lib/cms/guard.ts`, `lib/env*.ts`, `next.config.mjs`, `app/api/media/[...key]/route.ts`.

Classification per item: **MITIGATED** (control present) · **POTENTIAL** (needs runtime test) · **CONFIRMED** (defect) · **UNVERIFIED-ASSUMPTION**.

## 1. Authentication
| Control | Status | Evidence |
|---------|--------|----------|
| DB-session auth; only SHA-256 token hash stored | MITIGATED | `lib/auth/session.ts:16` `createHash('sha256')`; `Session.tokenHash` |
| Session cookie `HttpOnly` | MITIGATED | `setSessionCookie` → `httpOnly:true` |
| Cookie `Secure` in production | MITIGATED | `secure: process.env.NODE_ENV === 'production'` |
| `SameSite=Lax` | MITIGATED | `sameSite:'lax'` |
| Expiry enforced + expired session deleted | MITIGATED | `validateSessionToken`: `expiresAt < now` → delete, return null |
| Suspended-user lockout | MITIGATED | `if (session.user.status === 'SUSPENDED') return null` |
| Logout invalidates server session | MITIGATED | `clearSessionCookie` + `invalidateSessionToken` |
| Password hashing bcrypt cost 12 | MITIGATED | `lib/auth/password.ts` COST=12 |

## 2. Authorization / RBAC
- Default-deny: every admin Server Action calls `requireActor(perm)` (`guard.ts:33`) before work; failure → `toActionError`. Evidence: 17 `*-actions.ts` all import the guard.
- Role→permission mapping in `Role`/`Permission`/`RolePermission`; `roleHasPermission` checked in media proxy. Matrix documented `RBAC_PERMISSION_MATRIX.md`; unit coverage `tests/permissions-unit.test.ts`, `rbac.test.ts`, `governance.test.ts` (not executed this audit).
- Ownership restrictions for authors/articles present per prior batches (`eligibility`/guard). Status: POTENTIAL until runtime-tested.

## 3. Server Action authorization / CSRF
- Server Actions are POST-only and guarded by session + RBAC. Next.js App Router Server Actions include built-in origin checks; combined with `SameSite=Lax` cookie this mitigates CSRF for state-changing actions. Status: MITIGATED (framework-level) / POTENTIAL (no explicit CSRF token test executed).

## 4. Input validation / XSS
- Zod validation used across actions (`zod ^4.6.7`). JSON-LD serialized through `serializeJsonLd` which escapes `<`,`>`,`&`,U+2028/U+2029 — prevents `</script>` breakout (`lib/seo.tsx:263`). Status: MITIGATED for JSON-LD. General rich-text/body sanitization: POTENTIAL — verify article body rendering does not `dangerouslySetInnerHTML` untrusted HTML (not fully traced this pass).

## 5. Media / file upload
- Upload route `app/api/admin/media/upload/route.ts` (admin-gated). Processing via `sharp` (re-encodes images, strips arbitrary payloads). Delivery proxy `app/api/media/[...key]/route.ts`:
  - Validates key belongs to asset (original or known derivative) else 404.
  - Non-public assets require authenticated actor with `media.view` permission, else **404** (no existence leak).
  - Public assets cached; private assets `Cache-Control: private, no-store`; `X-Content-Type-Options: nosniff`.
  - Status: MITIGATED (gated private-bucket proxy).

## 6. Security headers (`next.config.mjs`)
| Header | Present |
|--------|---------|
| `X-Content-Type-Options: nosniff` | ✓ |
| `X-Frame-Options: DENY` | ✓ |
| `Referrer-Policy: strict-origin-when-cross-origin` | ✓ |
| `X-DNS-Prefetch-Control: off` | ✓ |
| `Strict-Transport-Security` (2y, includeSubDomains) | ✓ |
| `Permissions-Policy` (camera/mic/geo/browsing-topics off) | ✓ |
| Admin/API `Cache-Control: private/no-store` | ✓ |
| **`Content-Security-Policy`** | ✗ **MISSING** |

→ **Finding (P1):** No CSP header. HSTS lacks `preload`. Adding a CSP (even report-only first) materially reduces XSS blast radius. Backlog `P1-SEC-01`.

## 7. Environment separation / secrets
- `lib/env.ts` (Zod-validated env) + `lib/env-guard.ts` (isolation guard) + structured redacting `lib/logger.ts`. Local dev run with `MEDIA_STORAGE_PROVIDER=local`, `APP_ENV=development` to avoid cloud coupling.
- `.env` is gitignored (confirmed earlier in project); secrets not committed.
- Status: MITIGATED (separation controls exist).

## 8. Credential rotation — MANDATORY PRE-LAUNCH (CONFIRMED blocker)
During prior development sessions, **Admin password, Aiven DB password, and R2 credentials were exposed in chat**. Owner deferred rotation ("pore change korbo"). Per the brief this is a **mandatory pre-launch rotation task**, NOT performed in this audit.
- Rotate: Super Admin password; Aiven `avnadmin`/app DB password; R2 access key/secret.
- Also recommended: provision a **least-privilege** application DB role on Aiven (not the admin superuser) for the app's `DATABASE_URL`.
- Backlog `P0-SEC-ROTATE`.

## 9. Rate limiting / brute-force
- No application-level rate limiting found for `/admin/login/` or media/upload routes (no limiter middleware in `app/` grep). Status: **POTENTIAL gap** — login brute-force protection relies on bcrypt cost only. Recommend edge/host rate limiting or an app limiter. Backlog `P1-SEC-02`.

## 10. Dependency vulnerabilities
- `npm audit` **NOT EXECUTED** (no install/network in read-only scope). Lockfile present (`package-lock.json`). Notables: `sharp ^0.35.5` (Batch A upgrade), `next 16.4.3`. Recommend running `npm audit --production` in CI before launch.

## 11. Summary
Strong auth/RBAC/audit/media-gating foundation. Blocking/near-term: **credential rotation (P0)**, **CSP (P1)**, **rate limiting (P1)**, **dependency audit (P1)**, **body-HTML sanitization verification (P1)**.
