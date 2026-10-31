# Analytics Privacy — Technical Policy (Batch 07)

Technical privacy posture of NFRGuide analytics. This documents what the code does; it is
not a published legal privacy policy (that remains an owner decision — see below).

## Principles

- **Data minimization** — only what a small editorial publication needs: content views and
  internal search.
- **Disabled by default** — `AnalyticsConfig.collectionEnabled = false` until an
  administrator enables it after settling a privacy/consent approach (§8/§24).
- **No personal identifiers** — no raw IP, no fingerprint, no cross-site id, no persistent
  per-user id in any analytics table.

## Cookies / storage

- Analytics sets **no cookies** and writes **no browser storage** for identity.
- The only cookie in the app is the existing `nfrguide_session` (admin auth), unrelated to
  analytics.
- Cookie-free does not imply exemption from all privacy rules; collection stays off until
  reviewed.

## Query handling

- Queries are normalized (trim, collapse, length-bound 160) and, when `redactQueries` is on
  (default), **redacted** before storage: emails → `[email]`, 6+ digit runs → `[number]`,
  control characters stripped.
- Redaction placeholders are excluded from content-gap recommendations.

## Transient signals (never persisted)

Rate limiting and duplicate suppression use a SHA-256 hash of `IP|User-Agent`, truncated,
held **only in process memory**. It is never written to the database and is not an analytics
identifier.

## Retention

- `retentionDays` (default 180, range 7–400) governs **raw** event pruning.
- `runRetention()` deletes raw events older than the cutoff while **preserving** the durable
  daily aggregates, so long-range reporting survives without keeping raw rows.

## Time zone

UTC storage; single documented display zone (UTC) via `displayTimeZone` (§19). The dashboard
does not silently mix zones.

## Consent

If consent is required for a collection category, it must not be collected until consent is
available. No misleading consent banner is shipped. The safe disabled-by-default mode is in
effect pending the owner's privacy/consent decision.

## Owner decision required

Enabling collection, and any future external-provider connection or affiliate tracking, are
owner-gated (§24).
