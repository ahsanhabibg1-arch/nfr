# Media Library Architecture (Batch 05)

> Audience: engineers maintaining the NFRGuide DAM. How uploads, storage,
> processing, serving and editorial integration fit together.

## 1. Layers

```
 Admin UI (views/admin/AdminMediaPage, editor MediaPickerModal)
   │  upload → fetch POST /api/admin/media/upload (XHR progress)
   │  metadata/rights/visibility/delete/assign → Server Actions (app/admin/media-actions)
   ▼
 Route handlers
   • POST /api/admin/media/upload      (auth + RBAC, Node runtime)
   • GET  /api/media/[...key]          (visibility-gated blob serving)
   ▼
 Service  lib/cms/mediaService.ts      (RBAC + validation + audit)
   │
   ├─ lib/media/validation.ts          (magic-byte signature, size, filename)
   ├─ lib/media/processing.ts          (sharp: dims, orientation, derivatives)
   └─ lib/media/storage/*              (pluggable adapter: local | r2/s3)
   ▼
 PostgreSQL (MediaAsset + junctions)   metadata only — never binaries
 Object storage (adapter)              the actual files + derivatives
```

## 2. Upload flow (POST /api/admin/media/upload)

1. Resolve actor from the session; require `media.upload` (401/403 otherwise).
2. Read the file bytes; `validateUpload` detects the real type from **magic
   bytes** (browser MIME is never trusted), enforces the size limit and a safe
   filename. Only JPEG/PNG/WebP pass; SVG and everything else are rejected.
3. Checksum (sha256). If an identical asset exists, reuse it (duplicate handling).
4. `processImage` (sharp) extracts true dimensions and builds orientation-
   corrected WebP derivatives (thumb/md/lg, no upscaling). The original is never
   mutated.
5. Store the original + derivatives through the active `StorageAdapter`. Any
   partial failure cleans up already-written objects.
6. Persist `MediaAsset` (provider, key, url, dims, checksum, derivatives JSON),
   `visibility=DRAFT`, `rightsConfirmed=false`, `uploadedById`, and its audit
   row in one transaction. A database/audit failure removes stored objects.

## 3. Serving (GET /api/media/[...key])

- The asset id is embedded in the key (`yyyy/mm/<id>[__variant].<ext>`), so the
  route resolves the asset and authorizes before streaming.
- **PUBLIC + READY** assets stream to anyone with long cache headers. **DRAFT/
  ARCHIVED** (or still processing) require an authenticated `media.view` user —
  so draft-only media is never exposed. Legacy `/assets/...` files are served by
  Next's static handler, not this route.

## 4. Storage adapter

Provider-independent `StorageAdapter` (`lib/media/storage`): `put/get/delete/
exists/publicUrl`. Selected by `MEDIA_STORAGE_PROVIDER` (default `local`).
- **local** — files under git-ignored `var/media`, served by the route handler.
- **r2 / s3** — S3-compatible (Cloudflare R2 recommended, approval pending); AWS SDK loaded lazily so
  the local foundation needs no cloud credentials. See
  [STORAGE_PROVIDER_DECISION.md](STORAGE_PROVIDER_DECISION.md).

## 5. Editorial integration

- **Featured image**: the editor's `MediaPickerModal` is DB-backed (browse /
  search / upload / pick). Picking an asset sets the article's `heroImage` url.
  On save, `articleService.reconcileHeroMedia` syncs the `ArticleMedia` 'hero'
  link from that url, so the asset becomes a tracked relationship.
- **Featured and inline images**: save reconciles `hero` plus `inline-N`
  `ArticleMedia` rows from DAM URLs. Contextual ALT/caption stays on placement.
- **Publish gate**: publishing is blocked when any managed featured or inline
  placement has unconfirmed rights (legacy assets grandfathered). On publish,
  attached DAM media is promoted to `visibility=PUBLIC` so it serves publicly.
- **Rodeo entities**: `assignRodeoMedia`/`unassignRodeoMedia` link one asset to
  hubs/events/editions/disciplines/venues (separate junctions keep the recurring-
  event vs. edition distinction; one binary reused across many entities).
- The article editor's **eight fields are unchanged**; asset-level metadata and
  article-specific ALT text are kept distinct (the latter is never silently
  overwritten).

## 6. Permissions

Default-deny `media.*` (view/upload/edit.own/edit.any/delete/assign), enforced in
the service and re-checked on every mutation. See
[RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md).

## 7. Lifecycle & deletion

States: UPLOADING → PROCESSING → READY (and FAILED); visibility DRAFT/PUBLIC/
ARCHIVED. Deletion is reference-safe: blocked while used by published content or
any relationship (archive instead); managed blobs (and derivatives) are removed
on a successful delete; legacy static files are never touched.
