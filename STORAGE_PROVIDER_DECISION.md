# Storage Provider Decision (Batch 05 — Phase B)

> Audience: the owner + engineers. Evaluates where media **binaries** live
> (PostgreSQL stores only metadata, per §3), recommends a provider, and defines
> the provider-independent interface + the safe local dev adapter we build now
> while the production decision awaits owner approval.
>
> **Status: recommendation — pending owner approval. No paid cloud resources
> created; no real cloud credentials required to run the local foundation.**

## 1. Constraint (fixed by §3)

File binaries are **never** stored in PostgreSQL. Postgres stores identity,
storage key, provider, MIME, size, dimensions, checksums, metadata, ownership,
relationships, lifecycle state and audit references only. Binaries live behind a
**pluggable storage adapter**.

## 2. Options evaluated

| Provider | Egress cost | S3-compatible | CDN | Hosting-independent | Dev friction | Notes |
|---|---|---|---|---|---|---|
| **Cloudflare R2** | no direct internet egress charge (verify current terms before purchase) | ✅ (S3 API) | ✅ | ✅ | low | Strong fit for an image-heavy editorial site; pricing and allowances must be re-checked at procurement time |
| AWS S3 | $$ (egress adds up) | ✅ (native) | via CloudFront ($) | ✅ | low | Mature/ubiquitous, but public-image egress is the recurring cost; needs CloudFront for a CDN |
| S3-compatible self-host (MinIO) | your bandwidth | ✅ | you build it | ✅ | medium | Full control, but ops + bandwidth burden |
| Local filesystem | n/a | n/a | n/a | n/a (single node) | none | **Dev/test only** — not for multi-instance production |

## 3. Recommendation

**Build a provider-independent `StorageAdapter` interface. Ship a local
filesystem adapter now (dev/test). For production, recommend Cloudflare R2
accessed through an S3-compatible adapter** (the same adapter works against AWS
S3 or MinIO by config, so there is no lock-in).

Why R2 for a rodeo-news site:
- **No egress fees** — public article/section/discipline pages serve many image
  bytes; R2 removes the line item that dominates S3 cost for this workload.
- **S3 API** — one adapter (`@aws-sdk/client-s3` or signed-URL PUT/GET) targets
  R2, S3 and MinIO; switching is a config change, not a rewrite.
- **Hosting-independent** — not tied to Vercel/any host; portable + easy backup.
- **CDN-ready** — R2 fronts with Cloudflare's CDN for cache-aware delivery.

Trade-off accepted: R2 has no built-in on-the-fly resize on the free path, so we
generate derivatives (thumbnail/responsive variants) **at upload time with
`sharp`** and store them as separate keys — provider-agnostic and predictable.

## 4. The interface we build now (provider-independent)

```ts
interface StoragePutResult { key: string; size: number; }
interface StorageAdapter {
  readonly provider: string;                 // 'local' | 'r2' | 's3' | ...
  put(key: string, body: Buffer, contentType: string): Promise<StoragePutResult>;
  get(key: string): Promise<Buffer>;         // for processing / streaming
  delete(key: string): Promise<void>;        // best-effort; tolerate missing
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string;            // stable URL used by the app
}
```

- `MediaAsset.storageProvider` + `storageKey` record which adapter owns each
  blob, so legacy local-file assets, dev-adapter assets and (later) R2 assets
  coexist without a data reset.
- The adapter is selected by `MEDIA_STORAGE_PROVIDER` env (default `local`).

## 5. Local dev adapter (what runs today, no credentials)

- Writes blobs + derivatives under a **git-ignored** directory
  (`apps/web/var/media/…`, outside `/public`).
- Served through a Next **route handler** `GET /api/media/[...key]`, which checks
  the asset's `visibility`/`processingStatus` before streaming — so **draft-only
  media is never publicly served** (§14) — and sets cache headers.
- `publicUrl(key)` → `/api/media/<key>`. Stable, app-relative, swappable for an
  R2 CDN URL later with no content change.
- Legacy seeded assets keep their existing `/assets/images/…` URLs (provider
  `legacy-local`); nothing is downloaded or overwritten (§16).

## 6. What needs owner approval (the gate)

1. **Production provider** — approve Cloudflare R2 (recommended), AWS S3, or
   "local only for now, decide later." We will **not** create cloud resources or
   require real credentials until approved; the S3-compatible adapter can be
   written and unit-tested against the interface regardless.
2. **SVG uploads** — the safe local foundation currently **rejects SVG**
   (active-content/XSS risk) and permits JPEG/PNG/WebP. A sanitized SVG pipeline
   can be separately approved later.
3. **Media RBAC mapping** — see PHASE1_BATCH05_REPORT / the approval request.
4. **Copyright publish-eligibility policy** — recommend requiring an explicit
   editorial "usage rights confirmed" flag before a newly uploaded asset is
   eligible to appear on a published page.

Until approval, production cloud storage is **not** claimed operational — only
the local adapter is verified.
