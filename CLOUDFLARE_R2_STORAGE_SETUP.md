# NFRGuide.com — Cloudflare R2 Object Storage Setup

**Type:** infrastructure integration (not Batch 13; no website deploy). **Baseline:** `a3fa9b9`.
**Date:** 2026-11-02. **Written for:** the project owner.

> **Status (updated):** delivery architecture **approved + implemented** (private bucket + gated proxy);
> the media-URL gate-bypass risk is **fixed in code** and covered by tests. **Credential rotation is
> deferred by the owner** ("will rotate later") — so **no authenticated R2 access was attempted** and the
> compromised token was **never used**. Activating R2 in production still requires the rotated creds and
> the actions in §12.

## 1. Bucket configuration (non-secret, owner-provided)
- Provider: Cloudflare R2 · Bucket: `nfr` · Location: APAC · Region (SDK): `auto`.
- S3 endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (account id kept out of committed files).
- Public development URL: **currently enabled** (see §5 — a risk for private originals).
- Custom media domain: not configured.

## 2. Credential rotation status — ⛔ GATE 1 (owner action required)
- The earlier R2 API token / Access Key ID / Secret were **exposed in chat → treated as COMPROMISED**.
- **Owner must:** (a) **revoke** the exposed token in the Cloudflare dashboard; (b) create a **new,
  bucket-scoped** R2 API token (Object Read & Write on bucket `nfr` only — not account-global); (c) put
  the new Access Key ID + Secret into the **local** `apps/web/.env` as `MEDIA_S3_*` (never in chat).
- Until revocation is confirmed and new creds are present locally, **no authenticated R2 access** is run.

## 3. Environment variable mapping (reuses existing Batch 05 vars — no new system)
| Purpose | Variable | Value for R2 |
|---|---|---|
| Provider selector | `MEDIA_STORAGE_PROVIDER` | `r2` (local dev stays `local`) |
| Bucket | `MEDIA_S3_BUCKET` | `nfr` |
| Endpoint | `MEDIA_S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| Region | `MEDIA_S3_REGION` | `auto` |
| Access key | `MEDIA_S3_ACCESS_KEY_ID` | new rotated token (local .env only) |
| Secret | `MEDIA_S3_SECRET_ACCESS_KEY` | new rotated token (local .env only) |
| Public base | `MEDIA_S3_PUBLIC_BASE_URL` | **see §5 — do not point at the R2 public dev URL** |
Placeholders are in `.env.example`; real values live only in the git-ignored local `.env`.

## 4. Existing storage adapter integration (audit — already built)
The Batch 05 media layer is backend-agnostic and **already supports R2**:
- `lib/media/storage/index.ts` — `getStorage()` selects by `MEDIA_STORAGE_PROVIDER` (`local|r2|s3`);
  `r2`/`s3` → `S3StorageAdapter` (AWS SDK lazy-loaded, so local needs nothing extra).
- `lib/media/storage/s3.ts` — complete `put/get/delete/exists/publicUrl` for any S3-compatible store
  (R2/S3/MinIO), configured via `MEDIA_S3_*`.
- `app/api/media/[...key]/route.ts` — **visibility-gated delivery proxy**: resolves the asset by the id
  embedded in the key, serves PUBLIC+READY to anyone, and requires `media.view` for DRAFT/ARCHIVED/
  processing. Fetches bytes server-side via `getStorage().get(key)`, so it works unchanged over R2.
- Upload pipeline (`mediaService.ts`): magic-byte + MIME validation (JPEG/PNG/WebP), size limit, Sharp
  derivatives, SHA-256 dedup, deterministic `storageKey` (`yyyy/mm/<id>[__variant].<ext>`), rights/
  licensing fields, `media.*` RBAC, audit logging — all backend-agnostic.
- Entity media joins (Article/Hub/Event/Edition/Discipline/**Venue**/**Competitor**) are unaffected.

**No competing storage system is needed** — only configuration + the §5 delivery decision.

## 5. Private/public media design — ⛔ GATE 2 (security decision)
**Finding (real risk):** on upload, `mediaService.ts` stores `MediaAsset.url = storage.publicUrl(key)`.
- Local adapter `publicUrl(key)` → `/api/media/<key>` (the **gated proxy** — safe).
- S3/R2 adapter `publicUrl(key)` → `<MEDIA_S3_PUBLIC_BASE_URL>/<key>` (a **direct bucket URL**).

So if R2 is enabled **and** the bucket's public URL is used as `MEDIA_S3_PUBLIC_BASE_URL`, then **every
object — including DRAFT/unpublished originals — becomes directly fetchable by key, bypassing the
`/api/media` authorization gate.** The R2 "public development URL" being enabled makes this concrete.

**Approved + IMPLEMENTED architecture (minimal change, reuses the proxy):**
1. Keep the R2 bucket **private** (do **not** use the R2 public dev URL for delivery; it is not a
   production domain anyway).
2. ✅ **DONE:** the R2/S3 adapter's `publicUrl` now returns the gated proxy path `/api/media/<key>`
   (same as local), so `MediaAsset.url` and thumbnails are **always gated** regardless of backend. The
   proxy streams from R2 server-side and enforces PUBLIC/READY vs draft. `MEDIA_S3_PUBLIC_BASE_URL` is no
   longer required and is reserved for the future CDN step only. Covered by `tests/r2-storage.test.ts`.
3. **Later / optional (separate approval):** a public CDN domain (e.g. `media.nfrguide.com`) serving
   **only published derivatives** — either a separate public bucket/prefix that contains no originals or
   drafts, or signed URLs. The single bucket cannot both hold private originals and be blanket-public.

This preserves the publication/rights gate while still allowing CDN offload for approved public images
in a later step.

## 6. Upload & delivery workflow (target)
Upload (CMS, authenticated) → validate → Sharp derivatives → `put` to R2 (private) → persist metadata.
Delivery → browser requests `/api/media/<key>` → proxy authorizes (publish gate) → `get` from R2 → stream
with correct `Content-Type`, `nosniff`, and cache headers (`public,…immutable` for public; `private,no-store`
for draft). No direct-to-R2 URLs for private assets.

## 7. Media rights & publication controls
Unchanged and preserved: `media.view/upload/edit/delete/assign` RBAC, image rights/licensing status,
featured-image rights gate on publish, visibility (`PUBLIC`/`DRAFT`/`ARCHIVED`) + `processingStatus`.
R2 must **not** weaken these — hence the private-bucket + proxy design in §5.

## 8. Local vs cloud environment isolation
- Office/Home dev: `MEDIA_STORAGE_PROVIDER=local` (filesystem under git-ignored `var/media`) — **default,
  unchanged**. No local build or test requires R2 credentials.
- Cloud production: `MEDIA_STORAGE_PROVIDER=r2` + `MEDIA_S3_*` set in the host's secrets (server-side).
- Local media is **not** auto-copied to R2; R2 is used only by the deployed environment.

## 9. Testing results (actual — local backend; no R2 network)
- **Prisma validate:** ✅ valid. **TypeScript `tsc --noEmit`:** ✅ clean. **`next build`:** ✅ success.
- **Vitest:** ✅ **212/212** (incl. new `tests/r2-storage.test.ts`): R2 `publicUrl` returns the gated
  `/api/media/<key>` path (never a direct/absolute bucket URL), delivery-URL generation needs no
  credentials (credential isolation), R2 and local share the same gated path shape, provider id recorded,
  object-key/traversal validation. Existing media + RBAC + publication-rights suites still green.
- **Authenticated R2 round-trip (connectivity/upload/read/delete on an isolated temp prefix):** **NOT
  run** — deferred until the owner rotates credentials (the compromised token was never used).

## 10. Backup & recovery considerations
R2 has no automatic cross-region backup on its own; consider versioning and/or periodic sync for the
production bucket. Originals are the system of record for media bytes (Postgres stores only metadata/URLs).

## 11. Future custom domain
`media.nfrguide.com` → a public delivery path for **published derivatives only** (§5 step 3), behind an
approved private/public split. Not configured now; do not enable a public custom domain until approved.

## 12. Remaining owner decisions / actions
1. ✅ **Gate 2 — delivery architecture:** approved + implemented (private bucket + gated proxy).
2. ⛔ **Gate 1 — rotate creds (owner, deferred):** revoke the exposed token; create a **bucket-scoped**
   R2 token (Object R/W on `nfr` only); put new `MEDIA_S3_*` in local `apps/web/.env`. Until done, R2
   cannot be activated and no authenticated access runs. **Still the top security action.**
3. **R2 public dev URL:** disable it (or confirm nothing depends on it) so private originals are not
   exposed — the app no longer needs it (delivery is via the gated proxy).
4. **Activate R2 when ready:** `npm i @aws-sdk/client-s3`, set `MEDIA_STORAGE_PROVIDER=r2` + `MEDIA_S3_*`
   (rotated creds), then run the connectivity/round-trip check on an isolated temp prefix.
5. (Later) custom domain + CDN for published derivatives (separate approval).

---
*No R2 object was created, read, overwritten or deleted. No Aiven/production DB write. Local storage
remains the default. Compromised credentials were never used.*
