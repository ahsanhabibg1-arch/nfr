# Monetization Security Policy (Batch 08)

## Authorization

- Default-deny RBAC on every privileged read/mutation (`lib/cms/monetizationService.ts`).
- Server Actions re-derive the actor server-side; the UI never authorizes.
- Every mutation writes an `AuditLog` row.

## URL & redirect safety

- All merchant/tracking/partner URLs are validated server-side (`lib/monetization/url.ts`):
  only `http(s)` to a public, non-private host; `javascript:`/`data:`/`file:`/`ftp:` and
  private/loopback/link-local/metadata hosts are rejected.
- The `/go/[id]/` redirect takes its destination **only** from the DB by stable id and
  re-validates it — it is not an open redirect and accepts no user-supplied destination.
- No arbitrary external URL is fetched from the server (no SSRF surface); optional link-health
  checking is intentionally not implemented in this batch.

## Input & data safety

- All inputs validated with zod; enums constrained.
- Parameterized Prisma queries only (no raw string interpolation).
- XSS: public rendering emits React nodes; `rel`/attributes are from fixed policy, not user
  input.
- Reference-safe deletion: partners with links, and links with placements, cannot be deleted.

## Secrets & credentials

- No API secrets, publisher credentials or private affiliate keys are stored in the database
  or committed. `MonetizationConfiguration` holds only non-secret toggles + an optional,
  owner-entered publisher id label.
- `AnalyticsSyncRun`/provider errors (Batch 07) and any future provider errors store a
  category only, never raw payloads.

## Rate limiting & privacy

- Outbound click recording reuses the Batch 07 in-memory token-bucket + dedup (single-instance
  limitation documented) and stores no identifiers — per-link per-day counts only.
- Click tracking requires BOTH the monetization switch AND analytics collection to be enabled;
  both are OFF by default.

## Owner-gated / out of scope

Live AdSense scripts, provider API connections, stored provider credentials, real commercial
offer activation, and production deployment are owner-gated (§30) and not enabled here.
