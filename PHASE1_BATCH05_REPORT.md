# NFRGuide.com — Phase 1 / Batch 05 Report
## Production-Oriented Media Library, Secure Asset Storage & Editorial Integration

**Date:** 2026-10-29

**Branch:** `batch-01-nextjs-migration`

**Status:** Local foundation complete and verified; production storage and final RBAC mapping require owner approval.

## A. Baseline verification

Verified Next.js 16.4.3, React 19.2, TypeScript 7, Prisma 6.19.3, PostgreSQL
17.10, npm, sessions, five-role RBAC, article CRUD/revisions, rodeo, editorial
organization, sources and database navigation. Existing work was preserved.
Initial Prisma validation/typecheck passed; 15 skipped media tests were corrected
to use the isolated `TEST_DATABASE_URL`.

## B. Storage architecture decision

PostgreSQL stores metadata/relationships only. A provider-independent adapter
supports local filesystem and lazy S3-compatible R2/S3 implementations.
Cloudflare R2 is recommended, but no provider, paid resource, bucket, CDN domain,
or credential was created. The verified default is the git-ignored local adapter.

## C. Database changes

The additive `20261029200000_batch05_media` migration extends the existing
`MediaAsset`; it does not create a competing asset table. It adds provider/key,
safe filename, detected type/size/dimensions/checksum, reusable metadata,
licensing, owner, lifecycle, visibility and derivatives. Separate junctions
cover hubs, events, editions, disciplines and venues. Seeded IDs/URLs remain
`legacy-local`; no remote images were downloaded.

## D. Upload implementation

`POST /api/admin/media/upload/` authenticates and checks `media.upload`, rejects
grossly oversized bodies before multipart parsing, then applies exact byte limits,
magic-byte detection, declared-MIME consistency, extension/name checks, safe
unique keys and SHA-256 de-duplication. Storage and database/audit failures clean
up written objects. Credentials stay server-only.

## E. Image processing

Sharp reads orientation-aware dimensions and creates non-upscaled WebP `thumb`,
`md`, and `lg` derivatives. Original bytes remain unchanged. Quality and maximum
upload size are configurable. Naming and cleanup are documented separately.

## F. Media Library UI

The former mock page is database-backed with grid/list views, XHR progress,
errors, preview, search, type/state/date/usage filters, pagination, metadata and
licensing editing, rights confirmation, visibility control and safe deletion.
Authors can edit their own uploads; edit-any roles can edit all.

## G. Article integration

The existing eight-field editor order and names are unchanged. The picker now
searches the real library, uploads real files and selects reusable assets. Save
reconciles featured `hero` and inline `inline-N` relationships while retaining
placement ALT/caption data. Publishing blocks any attached managed media with
unconfirmed rights, promotes confirmed placements for public delivery, and
preserves the established renderer and article-level SEO fields.

## H. Rodeo integration

Authorized service/actions assign the same asset across hubs, recurring events,
annual editions, disciplines and venues. Separate event/edition junctions
preserve that distinction. Assignment, audit and reuse are integration-tested.

## I. Public rendering and SEO

`GET /api/media/[...key]` proves key ownership and returns only READY/PUBLIC
assets anonymously; authorized CMS users can preview drafts. Responses use
`nosniff` and cache policies. Public HTML and existing article image ALT/SEO/OG
metadata use the saved URL. No SEO scanning engine was added.

## J. Security and RBAC

Default-deny `media.view/upload/edit.own/edit.any/delete/assign` checks run
server-side. Mutations are audited. SVG/arbitrary executables are rejected.
Deletion checks article and rodeo relations. The tested local mapping is pending
owner confirmation before production.

## K. Tests executed

- Prisma validation and TypeScript: PASS.
- Vitest: **95/95**, including **18/18 media integration tests**.
- Production route smoke: **24/24**.
- Authenticated admin smoke: **6/6**.
- Media HTTP end-to-end: **7/7**.

See `MEDIA_INTEGRATION_TEST_REPORT.md`.

## L. Production build

`npm run build` passed on Next.js 16.4.3: compilation, TypeScript, page-data
collection and 28 static pages completed. Local storage is not a claim of
multi-instance production storage readiness.

## M. Files created/modified

Major areas: Prisma migration/schema, `lib/media/*`, media/article services,
upload/delivery routes, server actions, Media Library, editor picker, RBAC,
tests/test configuration, environment example and seven Batch 05 documents.
The Phase 0 Vite reference was not modified.

## N. Known limitations

- Production R2/S3 is unconfigured and untested; the optional AWS SDK is needed
  only when that provider is selected.
- Local storage is single-host development/test storage.
- Generated `md/lg` variants exist, but richer public `srcset` selection is
  future hardening.
- Rodeo relationships are service/action-backed; a dedicated entity-side gallery
  picker can be added later without changing the data model.
- No unrestricted bulk delete or automated third-party download exists.

## O. Batch 06 readiness

The database, storage abstraction, upload pipeline, processing, reuse relations,
delivery boundary and regression coverage are ready for the next approved batch.
Batch 06 was not started.

## P. Owner decisions required

1. Approve Cloudflare R2, choose another S3-compatible provider, or keep
   production storage undecided.
2. Confirm or revise the provisional five-role media permission mapping.
3. Confirm that SVG remains rejected rather than funding sanitization.
4. Decide whether responsive `srcset` delivery and a rodeo gallery picker belong
   in a future batch.

No deployment, paid resources, production credentials, scraping, video hosting,
Batch 06 work, or unrelated redesign was performed.
