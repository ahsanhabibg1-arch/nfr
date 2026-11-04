# Batch 22 §3 — Request Correlation & Diagnostics

## Implemented
`lib/logger.ts`:
- `newCorrelationId()` → `crypto.randomUUID()`. Random; encodes **no** session/account/credential data.
- `correlationIdFrom(headers)` → returns a **safe** inbound `x-request-id` / `x-correlation-id` (validated `^[\w-]{1,64}$`) when a trusted proxy provides one, else mints a fresh id. Rejects unsafe/oversized header values.

Threaded a `cid` field into the existing structured logs (all redacted, no secrets):
- `auth.login.rate_limited`, `auth.login.limiter_degraded`, `auth.login.failed` (login Server Action; `cid` from `headers()`).
- `media.upload.rate_limited`, `media.upload.limiter_degraded` (upload API; `cid` from `req.headers`).
- `csp.violation` (CSP receiver; `cid` from `req.headers`).

## Compatibility / constraints honored
- **No new dynamic rendering:** correlation ids are derived only in Server Actions and API route handlers, which are already dynamic (`ƒ`). No Server Component render path, `static` page, or ISR route was touched — static generation and ISR behavior are unchanged.
- **No session/credential exposure:** the id is random or a validated opaque header token; the rate-limit key (which contains an email) is never logged in full (only its prefix).
- **Structured + redacted:** every `cid` goes through the logger's `redact()` + single-line JSON emit.
- **Error boundaries unchanged:** public/admin boundaries still show Next.js's `digest`. We did **not** attempt to replace the digest with a custom id.

## How operators associate a user-reported error with server logs
1. **Render errors (error boundary):** the UI shows `Reference: <digest>`. Next.js logs that same `digest` server-side when the error is thrown — grep server logs for the digest.
2. **Action/API errors & security events:** the structured logs carry `cid`. When a proxy sets `x-request-id`, the same value appears in the proxy's access log and our app log, tying the request end-to-end; otherwise the minted `cid` ties the multiple log lines of that one handler together.
3. Recommended: have the edge/proxy inject `x-request-id` in production so the `cid` is shared across the whole request chain (owner action, documented in the checklist).

## Not done (documented)
- **App-wide request-scoped propagation via `AsyncLocalStorage`** across RSC render was **not** added — it risks coupling to the render pipeline and offers little benefit for static/ISR pages. The per-handler `cid` + Next `digest` already give operators the correlation handles they need. ALS-based propagation is a possible Batch 23 item if deeper tracing is wanted.
