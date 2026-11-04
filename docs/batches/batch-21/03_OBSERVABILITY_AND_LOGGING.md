# Batch 21 §C — Observability & Logging

## Existing (verified)
- `lib/logger.ts`: `log.{debug,info,warn,error}(msg, fields)` + `report(category, err, {correlationId, fields})`. Every emitted `fields` object passes through `redact()` which replaces secret-looking keys (`SENSITIVE_KEY`) and secret values (`SECRET_VALUE`) with `[redacted]`; bounded depth, cycle-safe.
- `ErrorCategory`: `auth | rbac | validation | database | storage | external | config | unexpected`.
- `instrumentation.ts` startup hook; `report()` supports `monitoringEnabled()` for a future sink.
- Error boundaries (public/admin) show only an opaque `digest`; full error → `console.error`.
- `/api/health`, `/api/ready` return structured JSON.

## Improvements made (first-party, low-risk)
- **Login:** `log.warn('auth.login.rate_limited', { scope })` on a throttle; fail-closed path returns a generic message (no fields with email/password/token).
- **Upload:** `log.warn('media.upload.rate_limited' | 'media.upload.limiter_degraded', { actorId })`.
- **Limiter:** storage failures go through `report('database', e, { fields: { scope: 'rate-limit', keyPrefix } })` — only the key *prefix* (e.g. `login`, `media-upload`), never the full key (which contains an email).
- **CSP receiver:** `log.warn('csp.violation', { documentUri, violatedDirective, blockedUri, disposition })` — truncated, non-sensitive fields only.

These give operators categorized, greppable event names (`auth.login.rate_limited`, `media.upload.*`, `csp.violation`) without new infrastructure.

## Sensitive-data guarantee (re-verified)
Logs never contain passwords, session tokens, auth cookies, DB credentials, R2 secrets, or request payloads:
- Passwords/tokens are never passed into `fields`; the rate-limit key (which contains an email) is reduced to its prefix before logging.
- `redact()` is the final gate on every `emit`.
- The CSP receiver logs only 4 truncated metadata fields, never headers/cookies/bodies.

## Correlation identifiers
`report()` already accepts a `correlationId`. A full request-scoped correlation id (propagated via `AsyncLocalStorage`/middleware) is **not** added in this batch (it touches the request pipeline and needs measurement). Documented as a Batch 22 candidate; the error boundaries' `digest` already provides a user→log correlation handle.

## External monitoring integration path (designed, NOT connected)
- `report()` is the single choke point: a provider (e.g. Sentry) would be initialized in `instrumentation.ts` and invoked inside `report()` when `monitoringEnabled()` is true — no call sites change.
- The error boundaries already surface `digest`; a provider that captures server stacks keyed by `digest` gives end-to-end correlation.
- Uptime monitoring would poll `/api/health` + `/api/ready`.
- **Not added** (no external service without approval).
