# Production Stabilization Step 03 — Media Upload Root-Cause Investigation & Image SEO Audit

**Stage:** PROD-STAB-03 / MED-01 · **Mode:** diagnosis only · **Date:** 2026-11-13
**Branch:** `main` · **HEAD:** `1385e2160d6a50eb173ec2404c7920327c58743d`

No application code, schema, test or configuration was changed. No commit, no push, no deploy,
no migration. No production database or R2 object was touched. No credential was read, printed
or rotated.

---

## 1. Executive summary

**No root cause is confirmed, and this report does not claim one.** What the investigation did
produce is better than a guess: the upload path has **sixteen distinct failure exits, and each
one shows the operator a different message**. The message you saw in the browser is therefore a
near-unique fingerprint of the failing stage (§3.2). One line of evidence collapses the search.

Three substantive findings:

1. **The fingerprint table exists because the UI prints the server's message verbatim.** The
   admin uploader renders `r.error` with no rewriting (`AdminMediaPage.tsx:51`). Sixteen exits,
   sixteen messages.

2. **The cause is now in the production logs — it was not before.** The storage, processing and
   database catches gained `report()` calls in `c03e233`. The previously deployed build
   (`abc0da5`) predates that commit, so an R2 rejection produced **nothing at all** on the
   server. The build now live (`1385e21`) logs the error's name and message — `AccessDenied`,
   `InvalidAccessKeyId`, `NoSuchBucket`, `MODULE_NOT_FOUND` — with the provider and object key.
   **A single retry now yields the answer.**

3. **I disproved my own leading hypothesis by measuring it.** "Render's free 512 MB tier OOMs
   while sharp decodes a large photo" is intuitive and wrong: sharp streams through libvips, so
   the measured peak working set is **~26 MB regardless of input size** — 27.4 MB for a 6 MP
   image, 26.5 MB for 24 MP, 25.6 MB for 48 MP (§3.4). OOM drops to a low-probability cause.

**On the image SEO side the picture is the opposite of what a gap audit usually finds.** The
database schema is close to complete — 18 of 18 requested metadata concepts have storage, and
the SEO Intelligence engine already ships **six image-specific checks**. The gaps are at the
two ends: **a per-usage ALT override that is stored but never written** (`ArticleMedia.altText`
exists, nothing populates it), and **the article page's hero image ignoring the ALT text the
CMS captured** — `ArticleHeader.tsx:86` passes `alt={article.title}` while the homepage
correctly uses `imageAltText`. Editors are filling in fields that never reach the public HTML.

---

## 2. Current media architecture

```
AdminMediaPage.tsx  ──XHR POST /api/admin/media/upload/──▶  route.ts
   (progress, error text)                                      │
                                                               ├─ getActor()                401
                                                               ├─ roleHasPermission          403
                                                               ├─ checkDurableRateLimit      429 / 503
                                                               ├─ content-length pre-check   413
                                                               ├─ req.formData()             400
                                                               ▼
                                                        uploadMedia()  (mediaService.ts)
                                                               ├─ validateUpload()           400 ×5
                                                               ├─ sha256 → dedup short-circuit
                                                               ├─ processImage()  sharp      400
                                                               ├─ storage.put() ×1..4        400
                                                               └─ prisma.$transaction        400
                                                                        │
                      ┌─────────────────────────────────────────────────┘
                      ▼
            S3StorageAdapter (lib/media/storage/s3.ts) ──▶ Cloudflare R2
                      │  lazy `await import('@aws-sdk/client-s3')` via a variable specifier
                      ▼
            publicUrl(key) = "/api/media/<key>"   ← a GATED PROXY path, never a bucket URL

   Public delivery:  /api/media/[...key]/route.ts
       resolves the asset id out of the key → checks visibility+processingStatus
       → anonymous gets PUBLIC+READY only; otherwise requires media.view
       → streams bytes from storage, Cache-Control public 300s/s-maxage 1y (immutable)
```

| Responsibility | File |
|---|---|
| Admin Media Library UI, upload, metadata forms | `views/admin/AdminMediaPage.tsx` |
| Server actions (metadata, rights, visibility, delete, assign) | `app/admin/media-actions.ts` |
| Upload route (auth, RBAC, rate limit, size pre-check, multipart) | `app/api/admin/media/upload/route.ts` |
| Upload orchestration, dedup, persistence, cleanup | `lib/cms/mediaService.ts` → `uploadMedia()` |
| Signature/size/extension/MIME validation | `lib/media/validation.ts` |
| sharp pipeline, dimensions, WebP derivatives | `lib/media/processing.ts` |
| Storage adapter selection | `lib/media/storage/index.ts` → `getStorage()` |
| R2/S3 adapter | `lib/media/storage/s3.ts` |
| Local adapter (dev) | `lib/media/storage/local.ts` |
| Key safety + key building | `lib/media/storage/adapter.ts` |
| Gated public delivery | `app/api/media/[...key]/route.ts` |
| Image SEO analysis | `lib/seo-intel/analyzers.ts`, `orchestrator.ts` |
| Public image rendering | `components/ImageWithCredit.tsx` + 13 call sites |

**Design points worth recording:** the bucket is private and delivery always goes through the
gated proxy, so draft media cannot leak even if the bucket were made public. Originals are
stored byte-for-byte (preserving embedded attribution/EXIF) while derivatives are stripped.
Uploads land `DRAFT` + `rightsConfirmed: false` and cannot be published until an editor
confirms a license. Deduplication is by SHA-256, so re-uploading identical bytes reuses the
asset instead of storing it twice. None of this is broken; it is the context any fix must
preserve.

---

## 3. Upload failure investigation

### 3.1 Where the upload can fail

Traced exhaustively through the files above. Every exit is listed in §3.2 — there are sixteen,
and no silent-success path exists: processing failure, storage failure and database failure all
throw and all clean up.

### 3.2 The diagnostic fingerprint table

The UI prints the server's `error` string unchanged, so the message identifies the stage.
**This is the fastest route to the root cause.**

| Message shown in the browser | Stage that produced it | HTTP | What it means |
|---|---|---|---|
| `You must be signed in.` | auth | 401 | session expired mid-upload |
| `You do not have permission to upload media.` | RBAC | 403 | role lacks `media.upload` |
| `Uploads are temporarily unavailable. Please try again shortly.` | rate-limiter **storage** | 503 | the `RateLimitHit` table/DB is unreachable — fail-closed by design |
| `Too many uploads. Please slow down and try again shortly.` | rate-limit threshold | 429 | >30 uploads / 5 min for this user |
| `Upload exceeds the configured size limit.` | pre-parse `content-length` | 413 | request > 16 MB |
| `Malformed upload.` / `No file provided.` | multipart parsing | 400 | form never arrived intact |
| `The uploaded file is empty.` | validation | 400 | 0 bytes |
| `File exceeds the 15 MB limit.` | validation | 400 | over `MEDIA_MAX_BYTES` |
| **`Unsupported file type. Allowed: JPEG, PNG, WebP. (SVG and other types are not permitted.)`** | validation | 400 | **HEIC (iPhone), AVIF, GIF, TIFF — by magic bytes** |
| `Filename extension (.x) does not match the detected … image type.` | validation | 400 | e.g. a PNG renamed `.jpg` |
| `Declared type (…) does not match the actual file content (…).` | validation | 400 | browser MIME contradicts the bytes |
| `The image could not be processed (it may be corrupt).` | **sharp / `processImage`** | 400 | corrupt file **or** sharp unusable in the deployment |
| **`Upload failed while saving the file.`** | **`storage.put()` → R2** | 400 | **the R2 write was rejected or unreachable** |
| `Upload could not be recorded; stored files were cleaned up.` | Prisma transaction | 400 | objects stored, row insert failed |
| `Upload failed.` | non-`ServiceError` escape | 500 | unexpected; `console.error` only |
| `Network error` / `Bad server response` | XHR transport | — | connection dropped, or the platform returned HTML (502/504/body-limit) instead of JSON |

**A defect noticed in passing, worth fixing in MED-01A:** the route maps *every* non-forbidden,
non-not-found `ServiceError` to **400** (`route.ts:68`). A storage or processing failure is a
server fault, not a client error, so a genuine R2 outage is reported to monitoring and to the
browser as a bad request. The message is right; the status code misleads.

### 3.3 What is production-only

Only four things differ between the working local environment and production:

| Component | Local | Production | Covered by tests? |
|---|---|---|---|
| **Storage adapter** | `LocalStorageAdapter` (filesystem) | **`S3StorageAdapter` → R2** | **NO — see §12** |
| Database | local Postgres | managed cloud Postgres | partly |
| sharp binary | win32 | linux-x64 | locally only |
| RAM / CPU | workstation | **512 MB, 0.1 CPU (free plan)** | no |

The R2 adapter is the one component that is *both* production-only *and* untested. That
coincidence is why it leads the ranking in §4 — not because any evidence points at it yet.

### 3.4 Memory: hypothesis measured and largely disproved

"The 512 MB free tier OOMs while sharp decodes a large photo" was my leading theory. I measured
the real pipeline (`sharp` 0.35.5, the actual `VARIANTS` and quality settings) and watched RSS:

| Input | Derivatives | RSS before → peak | **Delta** |
|---|---|---|---|
| 3000×2000 (≈6 MP) | 3 | 59.0 → 86.5 MB | **27.4 MB** |
| 6000×4000 (≈24 MP) | 3 | 113.4 → 140.0 MB | **26.5 MB** |
| 8000×6000 (≈48 MP) | 3 | 152.9 → 178.5 MB | **25.6 MB** |

**The delta does not grow with pixel count** — libvips streams in tiles rather than
materialising the full bitmap. A 15 MB upload therefore costs roughly the 15 MB buffer plus a
~26 MB working set. Against 512 MB that is comfortable for single uploads.

**Downgraded, not eliminated.** Baseline RSS does climb (59 → 153 MB across runs, libvips
cache), the free plan shares those 512 MB with Next.js and Prisma, and `AdminMediaPage` uploads
files **in parallel** when several are selected — so N concurrent uploads cost N×(file + 26 MB).
Multi-file selection on a cold 512 MB instance remains plausible; a single-file failure almost
certainly is not memory.

### 3.5 Safe reproduction

Not reproduced against production, by instruction. What was run locally, read-only:

- **36 media tests pass** (`media`, `media-processing`, `r2-storage`) — §12.
- The memory probe above (synthetic images, no network, no database).
- Static trace of all sixteen exits.

No test file was uploaded to the production bucket, no production object was created,
overwritten or deleted, and no production row was written.

---

## 4. Root-cause evidence (ranked)

### Confirmed root cause

**None.** No evidence has been obtained from the failing environment. Declaring one from
configuration names alone is exactly what the brief forbids, and what the IDX-01 investigation
already showed to be a trap — I asserted a build-time-inlining cause there, tested it, and was
wrong.

### Likely root cause — the R2 write path

**Fingerprint: `Upload failed while saving the file.`**

Rationale, and the limits of it: `storage.put()` is the only step that is both production-only
and completely untested (§12). `readConfig()` throws a distinct error when the three required
variables are absent, and the SDK reports a precise code for each remaining failure mode. A
read-only or bucket-scoped-wrong token is the single most common cause of exactly this symptom.

**This is a hypothesis ranked first by elimination, not by evidence.** If the browser message
was anything else, it is wrong, and the table in §3.2 names the right stage instead.

### Other possible causes

| Cause | Fingerprint | Assessment |
|---|---|---|
| **Unsupported format** — HEIC from an iPhone, or AVIF | `Unsupported file type…` | **Very plausible and often overlooked.** Nothing is broken in this case; the format is refused by design (§15 Q4) |
| **Extension/MIME mismatch** — a renamed screenshot | `Filename extension (.x) does not match…` | Plausible; also by design |
| **sharp unusable on linux** | `The image could not be processed…` | Build output traces sharp and libvips as external runtime files (`.nft.json`), which is correct, so this is less likely than it first appears — but runtime availability is only provable in production |
| **Rate-limiter DB failure** | `Uploads are temporarily unavailable.` | Needs `RateLimitHit`; migrations are applied, so unlikely — but it fails **closed**, so a brief DB blip blocks uploads |
| **Database insert failure** | `Upload could not be recorded…` | Would also mean objects were written and then cleaned up |
| **Platform body limit / timeout** | `Network error` / `Bad server response` | 0.1 CPU on the free plan makes a slow large upload a real timeout candidate; the response would not be JSON |
| **Memory exhaustion** | `Network error`, instance restart in the log | **Downgraded by measurement (§3.4)**; still possible with multi-file parallel uploads |

### Evidence still required — exactly two items

1. **The exact message text shown in the browser**, verbatim. No production access needed; it
   is on the operator's screen and maps to a stage through §3.2.
2. **The Render log lines for one fresh upload attempt** on the build now live. Search for
   `[storage]`, `[unexpected]`, `[database]` or `media.upload`. The log carries the SDK error
   name, its message, `provider`, `objectKey` and `objectsWritten` — non-secret by construction
   (`report()` logs only `name` and `message`, drops the stack in production, and an SDK error
   never contains credentials).

A third, only if the first two point at storage and are inconclusive: a **read-only R2
permission check**, run by the owner in the Cloudflare dashboard, confirming the API token's
permission is **Object Read & Write** (not Read-only) and that it is scoped to the bucket named
in `MEDIA_S3_BUCKET`. **No safe code-side check exists** — every meaningful probe writes an
object, which this stage is forbidden to do.

---

## 5. R2 configuration and permission assessment

### Operations the code actually performs

Matched to call sites, not assumed:

| S3 operation | Used by | Required? |
|---|---|---|
| **PutObject** | `put()` — the original plus up to 3 derivatives | **YES — upload cannot work without it** |
| **GetObject** | `get()` — every public image request through the proxy | **YES** |
| **DeleteObject** | `delete()` — failure cleanup and asset deletion | **YES** |
| **HeadObject** | `exists()` | only if `exists()` is called |
| ListObjects / ListBucket | — | **NO — never called** |
| Multipart upload | — | **NO — single-shot `PutObjectCommand` only** |

So the token needs **read + write + delete** on one bucket. In Cloudflare's model that is
**Object Read & Write**; "Object Read only" satisfies delivery but fails every upload — and
would present exactly the reported symptom.

### Configuration assessment

| Item | Finding |
|---|---|
| Required variables | `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`; absence throws a **distinct, explicit** error (`s3.ts:36`) — so a wholly missing configuration is *not* the cause of a generic failure |
| `MEDIA_S3_ENDPOINT` | normalised to its **origin**, so an accidentally appended `/bucket` path cannot double the bucket or break signing — a real pitfall already handled |
| `MEDIA_S3_REGION` | defaults to `auto`, correct for R2 |
| `MEDIA_S3_PUBLIC_BASE_URL` | **not required**; delivery uses the gated proxy. Good: the bucket stays private |
| SDK loading | lazy `await import()` through a **variable specifier**, so the bundler cannot resolve it. `@aws-sdk/client-s3` **is** a production dependency (verified) and `serverExternalPackages` lists it — but a resolution failure would surface as `MODULE_NOT_FOUND` inside the storage catch, i.e. the same message as a permission denial |
| CORS | **not applicable** — no browser-direct upload; bytes go through the app server |
| Object keys | `yyyy/mm/<uuid>[__variant].<ext>`, guarded by `assertSafeKey`; the proxy re-derives the id from the key and rejects any key not belonging to that asset |
| Credentials in logs | none — `report()` logs only error `name`/`message`; no credential is printed anywhere in the media path |

**Not verified:** whether the live token has write permission, whether the bucket name and
account endpoint match, and whether the key is current. All four are dashboard facts. No
credential value was read.

---

## 6. Media database assessment

`MediaAsset` holds **33 columns** plus 7 usage relations. Storage-side, this is a mature DAM
model: checksum deduplication, a `derivatives` JSON map, separate `storageProvider`/`storageKey`,
a rights workflow (`licenseType`, `rightsStatus`, `rightsConfirmed`, `rightsConfirmedBy/At`),
`processingStatus`, `visibility`, and both `filename` and `safeFilename`.

Indexes are sensible: `[visibility, processingStatus]` (the delivery gate), `[uploadedById]`,
`[checksum]` (dedup), and `storageKey` is unique.

Two observations:

- **`dimensions` duplicates `width`/`height`** as a display string (`"4000 × 3000"`). Harmless
  but a second source of truth.
- **No `description` column.** `title`, `seoTitle`, `caption` and `altText` exist; a longer
  editorial description does not (§7).

---

## 7. Complete Image SEO Metadata Matrix

| # | Metadata | Storage | UI | Rendered publicly | Classification |
|---|---|---|---|---|---|
| 1 | **ALT text** | `MediaAsset.altText`, `Article.imageAltText`, `ArticleMedia.altText` | yes (media + article) | **inconsistent** — homepage yes, article hero **no** | **Implemented but incomplete** (§8.1) |
| 2 | **Image SEO title** | `seoTitle` + `Article.imageSeoTitle` | yes | not emitted as an HTML attribute (correct — see §7B) | **Implemented and working** |
| 3 | **Caption** | `MediaAsset.caption`, `ArticleMedia.caption` | yes (media) | **article hero shows a generated caption instead** | **Implemented but incomplete** (§8.2) |
| 4 | **Description** (long editorial) | **none** | — | — | **Missing entirely** |
| 5 | **Credit** | `credit`, `copyrightHolder`, `Article.imageCredit` | yes | **yes** — `ImageWithCredit` renders it | **Implemented and working** |
| 6 | **Source / attribution** | `sourceAttribution`, `licenseSourceUrl` | yes | not rendered (editorial-internal) | **Implemented and working** |
| 7 | **License / usage rights** | `licenseType`, `rightsStatus`, `rightsConfirmed`, `usageRestrictions` | yes, with a confirm workflow | gates publishing | **Implemented and working** |
| 8 | **Original filename** | `filename` (+ `safeFilename`) | shown | n/a | **Implemented and working** |
| 9 | **Stored object key** | `storageKey` (unique) | n/a | n/a | **Implemented and working** |
| 10 | **MIME type** | `mimeType` — from **magic bytes**, not the browser | shown | served as `Content-Type` | **Implemented and working** |
| 11 | **File size** | `bytes` | shown | n/a | **Implemented and working** |
| 12 | **Dimensions** | `width`, `height` (+ `dimensions` string) | shown | **not emitted as `width`/`height` attributes** | **Present in database, missing from rendering** (§10) |
| 13 | **Format** | `format`, `extension` | shown | n/a | **Implemented and working** |
| 14 | **Upload date** | `uploadedAt` | shown | n/a | **Implemented and working** |
| 15 | **Updated date** | `updatedAt` (`@updatedAt`) | — | n/a | **Present in database, missing from UI** |
| 16 | **Uploaded by** | `uploadedById` → User | yes (filterable) | n/a | **Implemented and working** |
| 17 | **Usage references** | 7 join tables + `usageCount` | yes (used/unused filter) | n/a | **Implemented and working** |
| 18 | **Canonical media URL** | `url` = gated `/api/media/<key>` | n/a | yes | **Implemented and working** |

**Count: 14 working, 3 incomplete, 1 missing.** The schema is not the problem.

### §7D — Context-specific ALT text: the architecture already decided, then stopped

`ArticleMedia` carries **`altText` and `caption` override columns**. They are never written:

- `setArticleFeaturedImage()` (`mediaService.ts:321`) creates the row without them.
- `articleService.ts:272` **does** set `altText` — but only for `inline-<n>` blocks, from the
  rich-block editor's own `block.alt`.
- No server action exists to set a hero or per-entity override.
- The six rodeo/discipline/venue/competitor join tables have **no override columns at all**.

**Recommendation: finish the pattern already chosen — default on the media record, optional
per-usage override — rather than introduce a new one.** For articles that needs no migration,
only a write path and a field in the picker. For rodeo entities it needs one `altText` column
per join table, which is why it belongs in MED-01B behind an owner-approved migration. Media
records must never be duplicated to vary ALT text; the override columns exist precisely to
avoid that.

---

## 8. CMS UI and rendering gaps

### 8.1 The article hero ignores the ALT text the CMS captured — the most consequential gap

```tsx
// components/editorial/ArticleHeader.tsx:85-91
<ImageWithCredit
  src={article.heroImage}
  alt={article.title}                      // ← imageAltText is never consulted
  credit={article.imageCredit}
  caption={`Editorial Dispatch: ${article.title}`}   // ← generated, not the editor's caption
/>
```

Meanwhile the homepage does it correctly:

```tsx
// components/sections/EditorialHero.tsx:67
const imageAlt = heroImageUrl?.trim() ? (heroImageAlt?.trim() || leadArticle.title)
                                      : (leadArticle.imageAltText || leadArticle.title);
// components/sections/HomeArticleFeed.tsx:65
alt={article.imageAltText || article.title}
```

So the same asset is described properly on the homepage and by its headline on its own article
page. **Editors are filling a field that the most important page silently discards** — and the
SEO Intelligence engine reports `IMG_NO_ALT` resolved, because the data *is* there. The
analyzer and the renderer disagree about what "has ALT text" means.

Ten further call sites pass a title or name as `alt`: `ArticleModal`, `DisciplineModal`,
`DisciplineGuideHeader`, `EditorialArticleGrid`, `RelatedArticles`, `LandingBlocks`,
`DirectoryBlocks`. Some are defensible (a discipline card whose only text *is* the name); the
article hero is not.

### 8.2 Caption

`MediaAsset.caption` and `ArticleMedia.caption` are both stored and editable, but the article
hero substitutes `Editorial Dispatch: <title>`. The editor's caption never appears.

### 8.3 Decorative images

No mechanism distinguishes decorative from informative images, so `alt=""` cannot be expressed
deliberately — every image gets *something*. Low priority, but it is the correct accessibility
behaviour for purely ornamental imagery and currently impossible.

### 8.4 What the admin UI does well

All nine metadata fields are exposed and persisted (`title`, `seoTitle`, `altText`, `caption`,
`credit`, `copyrightHolder`, `licenseSourceUrl`, `usageRestrictions`, `sourceAttribution`), with
a partial-merge update so editing one field cannot wipe another, plus the rights-confirmation
workflow, visibility control, reference-safe delete, search/filter/pagination and a picker.
**No new metadata UI is needed for the fields that exist.**

---

## 9. SEO Intelligence integration findings

**Already implemented — six image checks** (`lib/seo-intel/analyzers.ts:273-282`):

| Finding code | Detects |
|---|---|
| `IMG_NO_ALT` | no ALT at article level **or** asset level |
| `IMG_GENERIC_SEO_TITLE` | no image SEO title |
| `IMG_BROKEN_REF` | `heroImageUrl` resolves to no media asset |
| `IMG_PRIVATE_ON_PUBLISHED` | a published article's hero is DRAFT/ARCHIVED — would 404 for readers |
| `IMG_RIGHTS_UNCONFIRMED` | hero rights unconfirmed |
| `IMG_NO_DIMENSIONS` | no recorded width/height |

That covers most of what the brief asks for, which is why no new engine is proposed.

**Genuine gaps, in priority order:**

1. **The analyzer and the renderer disagree.** `IMG_NO_ALT` passes when `altText` exists, but
   the article hero does not render it (§8.1). The engine reports a page as healthy while the
   HTML has the headline as ALT. **Fixing §8.1 is worth more than any new check.**
2. **Only the article hero is analysed.** Rodeo hubs/events/editions, disciplines, venues,
   competitors and Builder blocks have images and no image checks.
3. **No inline-body image checks** — `inline-<n>` ALT is stored but never audited.
4. **Reachability is never tested** — `IMG_BROKEN_REF` checks referential integrity, not whether
   the object actually exists in R2. An orphaned row (§11) looks healthy and 404s for readers.

**Deliberately not recommended:** a "missing caption" or "missing description" warning. Captions
are optional by design, and a check that fires on every image trains editors to ignore the panel.

---

## 10. Image performance findings

| Item | Finding |
|---|---|
| **`next/image`** | **not used anywhere** — 0 imports; 13 raw `<img>` |
| Responsive `srcset` / `sizes` | **none** — a 1600 px `lg` derivative is sent to a 360 px phone |
| **Derivatives already generated** | `thumb` 320 / `md` 768 / `lg` 1600 WebP — **built, stored, and only the thumb is ever used** (library grid) |
| `width` / `height` attributes | **absent** |
| CLS | **nonetheless protected** — `ImageWithCredit` wraps every image in a fixed `aspect-[16/9]` box, so layout does not shift. Worth stating plainly rather than filing a CLS bug that does not exist |
| `loading` / `decoding` | **absent** — no `lazy`, no `async`; every image loads eagerly |
| **`priority` prop** | declared in `ImageWithCreditProps` and **never destructured or used** — a dead prop; hero images get no fetch priority |
| Modern formats | WebP derivatives exist; **no AVIF**, and no negotiation since there is no `<picture>`/`srcset` |
| Stable URLs | yes — `/api/media/<uuid-keyed path>`, content-addressable and immutable |
| Cache headers | public assets `public, max-age=300, s-maxage=31536000, immutable`; private `private, no-store`. **Correct and good** |
| CDN | `s-maxage` is honoured by a shared cache; every byte is proxied through the Node server, so there is no direct-to-R2 edge delivery |
| Crawler access | `robots.txt` disallows only `/admin/`; `/api/media/` is **not** disallowed, so public images are crawlable |
| Image sitemap | none. Worth considering **only** after §8.1 — an image sitemap advertising headline-as-ALT images has no value |
| OG images | `og:image` resolves through `SITE_URL`; measured consistent with canonical and JSON-LD on a prerendered article |

**The headline here is waste, not breakage.** The expensive part — generating three correctly
sized, EXIF-stripped, orientation-corrected WebP derivatives — is already done on every upload.
The public site then serves the **original** and ignores them. Wiring `md`/`lg` into a `srcset`
is the single highest-value performance change available, and it needs no new processing, no
migration and no new dependency.

---

## 11. Data integrity risks

| # | Question | Finding |
|---|---|---|
| 1 | Can records become orphaned? | **Yes, in one direction.** If `storage.put()` succeeds and the transaction fails, cleanup runs — but each `delete()` is `.catch(() => {})`, so a delete failure leaves an object with no row: **invisible, unbilled-for-by-anyone, undetectable**. No reconciliation job exists. The reverse (row without object) can arise from out-of-band bucket changes and is equally undetected |
| 2 | Can deleting break published content? | **No — well guarded.** `deleteMedia()` refuses while any published article references the asset, and refuses again if any reference at all exists, directing the operator to archive instead |
| 3 | Does replacing an image preserve references? | **There is no replace operation.** Re-uploading creates a new asset (or dedups to an identical one); references must be re-pointed by hand. Not a bug, but a missing capability editors will expect |
| 4 | Do retries create duplicate objects? | **No** — SHA-256 dedup short-circuits before any storage write |
| 5 | Can a failed DB write leave objects in R2? | **Yes** — see (1) |
| 6 | Does the schema support future expansion? | **Yes.** `derivatives` is JSON, rights/licensing is already modelled, and `ArticleMedia` already has override columns. Only a `description` column and per-entity ALT overrides would need DDL |

**The one real integrity gap is (1)/(5): no orphan reconciliation.** It is silent and
cumulative — exactly the kind of thing that is cheap now and expensive later.

---

## 12. Existing test coverage

**36 tests, all passing** (`media.test.ts` 19, `media-processing.test.ts` 11,
`r2-storage.test.ts` 6), run in this investigation.

| Required scenario | Covered? |
|---|---|
| Successful upload | **yes** (local adapter) |
| Unauthorized (unauthenticated) | **no** — the route's 401 is untested |
| Forbidden (RBAC) | **yes** |
| Unsupported file types | **yes** — SVG, random bytes, mismatched extension |
| Oversized files | **yes** |
| **R2 permission failure** | **NO** |
| **R2 network failure** | **NO** |
| **Database persistence failure** | **NO** — the `report('database')` + cleanup path is unexercised |
| Duplicate upload | **yes** (dedup) |
| **Object cleanup after failure** | **NO** |
| **Public media retrieval** (`/api/media/[...key]`) | **NO — no test file exists.** The visibility gate, the key-ownership check and the cache headers are all untested |
| Metadata persistence | **yes**, including partial-merge |
| **Metadata rendering into HTML** | **NO** — which is why §8.1 went unnoticed |
| Missing ALT handling | partly — `IMG_NO_ALT` at the analyzer level; nothing at the render level |
| Rate-limiter 429 / 503 paths | **NO** |

**The decisive gap: `r2-storage.test.ts` never calls `put()`, `get()` or `delete()`.** Its six
tests cover `publicUrl()` and key validation, and one explicitly asserts that generating a URL
*needs no credentials*. The entire SDK interaction — `ensure()`, the dynamic import, the
commands — has **no test at any level**, not even against a mocked SDK. That is both why a
production-only storage fault could exist undetected and the first thing MED-01A should close.

---

## 13. Proposed implementation stages

### MED-01A — Media Upload Repair *(P0, blocked on §4 evidence)*

| | |
|---|---|
| **Scope** | Fix whatever the evidence identifies. Plus two fixes that are correct regardless: (a) map `ServiceError('storage')`/`('processing')` to **5xx**, not 400 (`route.ts:68`); (b) add mocked-SDK tests for `put`/`get`/`delete`, the failure-cleanup path and the database-failure path |
| **Files** | `app/api/admin/media/upload/route.ts`, `lib/media/storage/s3.ts` (only if implicated), new `tests/media-storage-adapter.test.ts`, `tests/media-upload-failure.test.ts` |
| **Dependencies** | **The exact browser message + one Render log line (§4).** Do not start before these arrive — the fix differs completely per stage |
| **Migration** | none |
| **Production risk** | low for (a) and (b). If the cause is a token, there is **no code change at all** — it is a Cloudflare dashboard action |
| **Test plan** | the new failure-path tests; full suite must stay green |
| **Rollback** | code-only, revert the commit; a token change is reverted in the dashboard |
| **Acceptance** | a real upload succeeds in production; the asset appears in the library with a working thumbnail; a deliberately provoked storage failure logs a named cause and leaves no orphaned object |

### MED-01B — Image SEO Metadata Completion *(P1)*

| | |
|---|---|
| **Scope** | **B1 (highest value, no migration):** make `ArticleHeader` use `imageAltText`/asset `altText` with the title only as a last resort, and render the editor's caption instead of the generated one. **B2:** a write path for the existing `ArticleMedia.altText`/`caption` overrides, surfaced in the media picker. **B3 (migration):** `MediaAsset.description`; `altText` on the six rodeo/discipline/venue/competitor join tables; a decorative-image flag enabling deliberate `alt=""`. **B4:** `updatedAt` in the media detail panel |
| **Files** | `components/editorial/ArticleHeader.tsx`, `components/ImageWithCredit.tsx`, `lib/cms/mediaService.ts`, `app/admin/media-actions.ts`, `views/admin/AdminMediaPage.tsx`, `components/admin/editor/MediaPickerModal.tsx`, `prisma/schema.prisma` (B3 only) |
| **Dependencies** | independent of MED-01A; **B1 can ship on its own** |
| **Migration** | **B3 only** — additive nullable columns, owner-approved, no data movement |
| **Production risk** | B1/B2/B4 low (render + write paths). B3 is additive DDL; the risk is the migration itself, not the columns |
| **Test plan** | render tests asserting the ALT precedence chain (asset → article → usage override → title fallback) and that a decorative image emits `alt=""`; metadata persistence tests for the override write path |
| **Rollback** | B1/B2/B4 revert cleanly. B3's columns are nullable and unused if reverted — leave them rather than dropping |
| **Acceptance** | an editor's ALT text and caption appear in the article page's HTML; the same asset carries different ALT in two usages without duplicating the record; `IMG_NO_ALT` and the rendered HTML agree |

### MED-01C — Media SEO Intelligence, Performance & Coverage *(P2)*

| | |
|---|---|
| **Scope** | **C1 (highest value):** serve the `md`/`lg` derivatives that are already generated via `srcset`/`sizes`, add `width`/`height`/`loading="lazy"`/`decoding="async"`, and make the dead `priority` prop actually set `fetchpriority="high"` for hero images. **C2:** an orphan reconciliation report (read-only: rows whose object is missing, and — if listing is ever permitted — objects with no row). **C3:** extend image analysis beyond the article hero to rodeo/discipline/venue/competitor and inline body images, plus a reachability check. **C4:** tests for the `/api/media/[...key]` gate. **C5:** an image sitemap — **only after MED-01B**, and only if the owner wants Google Images traffic |
| **Files** | `components/ImageWithCredit.tsx` and its call sites, `lib/seo-intel/analyzers.ts`, `lib/seo-intel/orchestrator.ts`, new `tests/media-delivery.test.ts`, a reconciliation script |
| **Dependencies** | C1 is independent. C3 benefits from MED-01B. C5 depends on MED-01B |
| **Migration** | none |
| **Production risk** | C1 touches every public image — visual regression risk, mitigated by the existing aspect-ratio wrapper. **C2 must stay read-only**: never auto-delete an object because a row is missing |
| **Test plan** | assert the emitted `srcset` names the stored derivative keys; assert `loading`/`decoding`/`fetchpriority`; gate tests for anonymous DRAFT access (must 404) and key-ownership mismatch |
| **Rollback** | all code-only |
| **Acceptance** | a phone receives the 768 px derivative instead of the original; the hero is fetch-prioritised; below-fold images are lazy; the gate is covered by tests; the reconciliation report runs without writing |

**Suggested order:** MED-01A (when evidence lands) → **MED-01B/B1** → MED-01C/C1 → the rest.
B1 and C1 are both small, need no migration, and together convert work the system *already
does* into SEO and performance the site does not currently get.

---

## 14. Production safety considerations

- **No credential was read, printed or rotated**, and none can leak through the media path:
  `report()` logs only an error's `name` and `message`, and an SDK error never carries
  credentials.
- **No object was uploaded, overwritten or deleted** in any bucket; no production row was
  written; no migration ran.
- **Any write-permission probe writes an object.** There is no read-only way to prove a token
  can write, which is why §4 routes that check to the Cloudflare dashboard rather than to code.
- **The reconciliation tool in MED-01C/C2 must be read-only.** Deleting an object because its
  row is missing would destroy the only copy of an asset whose row failed to insert.
- **`ListObjects` is not currently required.** If C2 is to enumerate bucket-side orphans, it
  would need that permission — a deliberate, owner-approved widening, not a quiet addition.
- Uploads land `DRAFT` + rights-unconfirmed and cannot be published without an explicit license
  confirmation. Any fix must keep that gate.

---

## 15. Open questions requiring owner approval

| # | Question | Why it matters |
|---|---|---|
| **Q1** | **What exactly did the browser say?** Verbatim text | Maps to a stage through §3.2 and may settle the diagnosis without any log access |
| **Q2** | **The Render log for one fresh upload attempt** on `1385e21` | Carries the SDK error name and message — the one thing that converts the ranking in §4 into a confirmed cause |
| **Q3** | Is the R2 API token **Object Read & Write**, scoped to the bucket in `MEDIA_S3_BUCKET`? | The leading hypothesis; a dashboard fact, not a code fact |
| **Q4** | What file was being uploaded — format, size, source (iPhone? screenshot? renamed?) | HEIC and AVIF are **refused by design**. If that is what happened, nothing is broken and the real question is Q5 |
| **Q5** | Should **HEIC/AVIF** be accepted (converted on upload)? | A genuine editorial-workflow decision. iPhone photos are HEIC by default. It needs a decoder and is its own scoped change — not part of MED-01A |
| **Q6** | Was **one** file selected or several at once? | Multi-file parallel upload is the remaining memory-pressure scenario (§3.4) |
| **Q7** | Approve the **additive migration** in MED-01B/B3 (`description`, per-entity `altText`, decorative flag)? | The only DDL proposed anywhere in this plan |
| **Q8** | Is **Google Images traffic** a goal? | Decides whether MED-01C/C5 (image sitemap) is worth building at all |
| **Q9** | Should `ListObjects` be granted for orphan reconciliation (MED-01C/C2)? | Widens the token's permissions; needs an explicit decision |

---

## 16. Final recommendation

**Do not implement a media fix yet.** Nothing is blocked on engineering: it is blocked on two
cheap pieces of evidence (Q1, Q2). The upload path has sixteen distinct exits, the fix for each
is different, and the build now in production finally logs the cause — which the previous build
did not. Guessing now means risking a change to the one component that is production-only and
has no test coverage at all, on a hunch.

**Do start MED-01B/B1 in parallel, once approved.** It is independent of the upload fault,
needs no migration, and closes the most consequential finding in this report: the article page
discards the ALT text and caption the CMS carefully captures, while the homepage uses them and
the SEO engine reports them as present. That is a defect in the product's core promise —
editorial image SEO — and it is a small, well-bounded render change.

**Then MED-01C/C1.** Three correctly sized WebP derivatives are generated on every upload and
thrown away on every page view. Serving them is pure upside.

One honest note on method. I came into this expecting memory exhaustion on the free tier to be
the answer, and I expected the metadata audit to find large schema gaps. I measured the first
and it was wrong — sharp's working set is flat at ~26 MB. I traced the second and it was wrong
too — the schema is nearly complete and the real failures are at the render layer and in a
stored-but-never-written override column. Both corrections are in the report above; neither
would have survived a diagnosis written from assumptions.

---

## 17. Git and repository status

| | |
|---|---|
| Branch / HEAD | `main` / `1385e2160d6a50eb173ec2404c7920327c58743d` |
| Upstream | `origin/main` — level (ahead 0 / behind 0) |
| Application code / schema / tests / configuration | **unchanged** |
| Commits / pushes / deployments / migrations | **none** |
| Production database | **not contacted** |
| Production R2 bucket | **not contacted** — no object read, written or deleted |
| Live environment variables | **not read, not changed** |
| Local work performed | read-only inspection; 36 media tests run; one local memory probe (synthetic images, no network, no DB) |
| Working tree | one new file — `docs/PRODUCTION_STABILIZATION_STEP_03_MEDIA_SEO_DIAGNOSIS.md` |
| Stashes | 0 · no reset, clean, stash, merge or branch switch |

**This was a diagnosis and architecture audit. No repair was performed, and no further stage
was started.**
