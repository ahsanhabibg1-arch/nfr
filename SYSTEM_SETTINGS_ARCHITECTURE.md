# System Settings Architecture (Batch 09)

Typed, validated site configuration — not arbitrary key/value mutation. Gated by
`system.config` (Super Admin). `lib/cms/settingsService.ts` + `/admin/settings/`.

## Domains (stored as validated JSON in `SystemSetting`)

- **Site identity** (`site_identity`) — siteName, tagline, description, contact/editorial email,
  social URLs. Free text rejects HTML (`/^[^<>]*$/`); URLs/emails validated.
- **Editorial defaults** (`editorial_defaults`) — default article status, excerpt/attribution
  guidance, editorial time zone, words-per-minute, in-depth word count, source-verification
  reminder. Guidance only — it never bypasses editorial review/publishing permissions, and the
  eight-field editor is unchanged.
- **Rodeo defaults** (`rodeo_defaults`) — date display, venue display, event-status
  presentation, edition source-verification reminder. Display preferences only; event-vs-edition
  separation preserved and nothing is auto-carried across editions.

## Not a duplicate source of truth (§16)

Domain settings stay owned by their modules and are **surfaced**, not duplicated, here:

| Shown | Owned by |
|---|---|
| SEO rule/threshold config | SEO Intelligence (`SeoConfig`) |
| Analytics collection/retention | Analytics (`AnalyticsConfig`) |
| Ad serving / click tracking | Monetization (`MonetizationConfiguration`) |

The Operational tab links to those modules for their real controls.

## Operational status (safe)

`getOperationalStatus` returns environment, app version/commit (from env, else defaults), DB
connectivity (`SELECT 1`), applied-migration count, media provider, and the analytics/ad/click
status flags. It exposes **no** connection strings, secrets or env values, runs only cheap
queries, and states that hashing cost / session secrets / DB creds / env are code-controlled
and not editable.

## Security separation (§20)

Administrator-configurable (safe) settings are the typed domains above. Security-critical
configuration (password hashing cost, session signing/secret material, database credentials,
production env, RBAC enforcement) is **never** exposed or editable through the CMS.
