# Media Security Policy (Batch 05)

> Audience: engineers + editors. The security controls and copyright/licensing
> rules for media.

## 1. Upload security (§5)

- **Authenticated + RBAC**: `POST /api/admin/media/upload` requires a session and
  `media.upload`; every mutation re-checks server-side (no reliance on hidden UI).
- **Signature validation**: the real type is detected from magic bytes; the
  browser-declared MIME is never trusted and a contradicting declaration is
  rejected.
- **Allowed types**: JPEG, PNG, WebP only. **SVG is rejected** (active-content /
  XSS risk — owner decision). No executables or arbitrary files.
- **Size limit**: `MEDIA_MAX_BYTES` (default 15 MB).
- **Safe filenames + keys**: original names are sanitized; mismatched/unsafe
  supplied extensions are rejected; storage keys are
  validated (no absolute paths, no `..`, restricted charset) — path-traversal
  prevention at both the key builder and the local adapter's resolved-path check.
- **Integrity**: sha256 checksum stored; identical uploads are de-duplicated.
- **Failure cleanup**: partial storage writes are rolled back.
- **No secrets to the client**: storage credentials live only in server env; the
  upload route never logs tokens or credentials.

## 2. Serving & privacy (§14)

- Draft/archived (or processing) assets are served only to authenticated
  `media.view` users; anonymous requests get 404. Published assets are promoted
  to PUBLIC and served with cache headers + `X-Content-Type-Options: nosniff`.

## 3. Copyright & licensing (§11)

NFRGuide is an independent publication. Media lawfulness is tracked, never
assumed:

- A newly uploaded asset starts `licenseType = UNCONFIRMED`, `rightsConfirmed =
  false`, `visibility = DRAFT`.
- An editor records a usage category — **OWNED**, **LICENSED**,
  **PERMISSION_GRANTED**, **PUBLIC_DOMAIN**, **OTHER** — plus copyright holder /
  source / restrictions, then confirms rights.
- **Publish gate**: an article with any managed featured or inline image whose
  rights are unconfirmed cannot be published. An asset also cannot be manually
  changed to PUBLIC before rights confirmation. Legacy assets are grandfathered.
- The system never scrapes or downloads third-party images, and never invents
  copyright holders, photographers or license claims. Remote-URL images entered
  manually are the editor's documented responsibility.

## 4. RBAC (§12, implemented provisionally; owner confirmation pending)

| perm | SA | Admin | Editor | Author | SEO Mgr |
|---|:--:|:--:|:--:|:--:|:--:|
| media.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| media.upload | ✅ | ✅ | ✅ | ✅ | — |
| media.edit.own | ✅ | ✅ | ✅ | ✅ | — |
| media.edit.any | ✅ | ✅ | ✅ | — | ✅ |
| media.delete | ✅ | ✅ | — | — | — |
| media.assign | ✅ | ✅ | ✅ | ✅ | — |

This least-privilege mapping is active in the local foundation so authorization
can be tested. The owner must confirm or adjust it before production deployment.

## 5. Deletion safety (§13)

- Never delete an asset referenced by published content; reference-checked across
  article + all rodeo relationships; archive is the reversible path. No
  unrestricted bulk deletion.

## 6. Audit (§17)

Every upload, metadata change, rights confirmation, visibility change, assignment
and deletion writes an `AuditLog` row (actor, action, entity, detail). Tokens and
signed URLs are never logged.
