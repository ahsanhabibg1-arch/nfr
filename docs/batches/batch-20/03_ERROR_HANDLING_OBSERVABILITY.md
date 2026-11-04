# Batch 20 §3 — Error Handling & Observability

## Audit
| Surface | State |
|---------|-------|
| Public error boundary | `(public)/error.tsx` + `global-error.tsx` (Batch 18) — branded, recoverable, chrome persists, `digest`-only. |
| Admin error boundary | `(dashboard)/error.tsx` (Batch 19) — recoverable with `reset()` + back-to-dashboard. |
| Server Action errors | `guard.ts toActionError` → typed `{ ok:false, code, error }`; AuthzError → friendly message; never leaks internals. |
| API errors | media upload → structured JSON + proper status (401/403/413/429/400/500); JSON-LD escaped. |
| Structured logging | `lib/logger.ts` redacts secrets; `instrumentation.ts` startup; no tokens/session logged. |
| Health / readiness | `/api/health`, `/api/ready` → 200 (verified live). |

## Change made (low-risk correctness)
**`app/admin/(dashboard)/error.tsx`** previously stated *"Your data was not changed."* A React error boundary catches **render** errors and has no knowledge of whether a Server Action mutation committed — this guarantee could be false (e.g. a render throw after a successful write). Per the batch's explicit requirement, the copy now reads:

> "An unexpected error interrupted this CMS view. If you were mid-save, re-open the record to confirm its current state before retrying — don't assume the change did or did not apply."

This removes a misleading safety guarantee without alarming the operator.

## Sensitive-data posture (verified, unchanged)
- Visitors/operators see only an opaque `error.digest`; the full error goes to `console.error` (server/browser logs), consistent with the redacting logger.
- No credentials or session tokens are rendered or logged.

## External error tracking
Evaluated (e.g. Sentry-style). **Not connected** — the batch forbids adding a provider without approval. Recommended for Batch 21: wire a tracker so the `digest` shown by the boundaries correlates to a captured stack; add uptime monitoring on `/api/health|ready`. Design note: the boundaries already surface a correlatable `digest`, so adoption is drop-in.

## Error-boundary semantics note
Both public and admin boundaries are **render/data-fetch** boundaries. Mutation failures surface inline via `ActionResult` (toasts), not via these boundaries — the correct separation. No boundary now claims anything about mutation durability.
