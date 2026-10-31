# External Analytics Integration Foundation (Batch 07)

A secure foundation for future Google integrations. **Nothing is connected.** No network
call is made, no Google SDK is added, no credential is stored, and no data is fabricated.

Status is resolved honestly in `lib/analytics/providers/index.ts` from the environment: with
nothing configured, every provider reports `Not Connected` (and `live: false`). Even if env
vars were present, the state would be `configured` — never `connected` — because live sync
stays owner-gated in this batch.

## Three distinct systems (never conflated — §14)

1. **First-party analytics** — this app's cookieless observed events (implemented).
2. **GA4 Data API reporting** — server-side pull of GA4 metrics (foundation only).
3. **GA4 browser collection** — a gtag/measurement script (NOT added; owner-gated).

## Google Search Console

- Reports (future): clicks, impressions, CTR, average position, queries, pages, dates.
- Required env (future): `GSC_SITE_URL`, `GOOGLE_APPLICATION_CREDENTIALS` (service account).
- Future setup: verify the production domain property, grant a service account read access,
  provide credentials out-of-band (never committed), then an owner enables sync.
- Until then: `Not connected`. Internal search is **never** presented as GSC data.

## Google Analytics 4

- Reports (future, Data API): sessions, users, engagement — only with real authorized access.
- Required env (future): `GA4_PROPERTY_ID`, `GOOGLE_APPLICATION_CREDENTIALS`.
- Future setup: create/identify the GA4 property, enable the Data API, authorize a service
  account, provide credentials out-of-band, then an owner enables sync.
- No measurement id is hardcoded; no tracking script is injected.

## Admin controls (`analytics.provider.manage`)

- Save a **non-secret reference label** (`propertyRef`) per provider.
- "Attempt Sync" records an `AnalyticsSyncRun` with status `not_connected` and returns an
  honest message — it makes **no** network request.
- Credentials are never stored in the database (`AnalyticsProviderConnection.lastError` holds
  an error **category** only).

## Owner approval gates (§24)

Connecting a provider, creating Google Cloud resources, storing provider credentials, and
adding any tracking script all require explicit owner approval and are out of scope here.
