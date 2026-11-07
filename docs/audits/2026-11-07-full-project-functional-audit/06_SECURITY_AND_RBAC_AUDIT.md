# 06 — Security & RBAC Audit

**Audited:** 2026-11-07

## Authentication Security

| Check | Status | Evidence |
|---|---|---|
| Readers cannot access Admin CMS | ✅ PASS | `requireCmsAccess()` in dashboard layout redirects non-staff to `/` |
| Readers cannot invoke privileged Server Actions | ✅ PASS | Every action uses `requireActor(perm)` — reader has no permissions |
| Public registration cannot assign staff roles | ✅ PASS | Registration assigns only `reader` role (hardcoded in register action) |
| Suspended readers lose active sessions | ✅ PASS | `setReaderStatus('SUSPENDED')` + force-logout revokes all sessions |
| Staff ↔ Reader management separated | ✅ PASS | `readerAdminService.ts` scopes to reader-only users via `READER_ONLY_WHERE`; `assertManageableReader` rejects staff accounts |
| Server-side publishing authorization | ✅ PASS | `article.publish` permission checked in workflow transition service |
| Sensitive actions audited | ✅ PASS | `audit()` called on all mutations in service layer |
| Rate limiting effective | ✅ PASS | Durable `RateLimitHit` table, fail-closed (register: 5/hour, login: rate-limited) |
| CSRF protection | ✅ PASS | Next.js Server Actions use same-origin POST with CSRF tokens |
| XSS protection | ✅ PASS | React's default escaping; comments rendered escaped (no raw HTML); CSP reporting endpoint configured |
| Password security | ✅ PASS | bcrypt hashing, ≥12 char minimum, no plaintext storage |
| Session security | ✅ PASS | SHA-256 hashed tokens, expiry enforcement, server-side validation |

## RBAC Permission Enforcement

| Module | Service Guard | Action Guard | Verified |
|---|---|---|---|
| Articles | `roleHasPermission` per operation | `requireActor(perm)` | ✅ |
| Rodeo Coverage | `req(a)` checks `rodeo.manage` | `requireActor('rodeo.manage')` | ✅ |
| Competition | per-operation in service | `requireActor('rodeo.manage')` | ✅ |
| Competitors | `req(a)` checks `rodeo.manage` | `requireActor('rodeo.manage')` | ✅ |
| Media | `requirePermission(actor, perm)` | `requireActor(perm)` | ✅ |
| SEO | `requirePermission` | `requireActor` | ✅ |
| Analytics | `requirePermission` | `requireActor` | ✅ |
| Monetization | `requirePermission` | `requireActor` | ✅ |
| Navigation | `requirePermission('navigation.manage')` | `requireActor('navigation.manage')` | ✅ |
| Team | `requirePermission('user.manage')` | `requireActor('user.manage')` | ✅ |
| Comments | `requirePermission` | `requireActor` | ✅ |
| Readers | `need(actor, perm)` | `requireActor('reader.manage')` | ✅ |
| Landing SEO/FAQ | `requireEntityPerm` (per entity type) | `actor()` + service perm | ✅ |
| Settings | `requirePermission('system.config')` | `requireActor('system.config')` | ✅ |

## Critical Security Findings

**No P0 or P1 security issues found.**

The security model follows defense-in-depth:
1. Layout-level gate (`requireCmsAccess`) for the admin shell
2. Action-level permission checks (`requireActor`) for every mutation
3. Service-level permission validation for business rules
4. Audit logging for accountability
5. Rate limiting for abuse prevention
6. Session revocation for incident response

## Known Security Considerations (Not Bugs)

- Email verification is stubbed (no email provider configured) — accounts work without verification. This is documented and requires owner setup.
- Password reset tokens are shown once for manual delivery (no email sent) — this is the documented administrator-assisted flow.
- `.env` file containing secrets is properly gitignored and never committed.
