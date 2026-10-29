# Media Integration Test Report — Phase 1 / Batch 05

**Date:** 2026-10-29

**App:** `apps/web`

**Database:** isolated `nfrguide_test` via `TEST_DATABASE_URL`

**Storage:** isolated temporary local directories in automated tests

## Automated verification

| Check | Result |
|---|---|
| `npx prisma validate` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 12 files, 95/95 tests |
| Batch 05 media suite | PASS — 18/18 real DB/storage tests |
| `npm run build` | PASS — Next.js 16.4.3, 28 static pages |
| `npm run test:routes` against `next start` | PASS — 24/24 |
| authenticated admin smoke | PASS — 6/6 |
| `scripts/media-http-check.mts` | PASS — 7/7 |

Vitest loads the Next local environment and replaces `DATABASE_URL` with
`TEST_DATABASE_URL` before importing application services. The CMS, Batch 04,
and Batch 05 integration suites therefore use the disposable test database
rather than silently skipping or changing development data.

## Media behaviors exercised

- upload RBAC, SEO Manager denial, authenticated upload and anonymous 401;
- JPEG/PNG processing, dimensions, WebP derivatives and isolated disk writes;
- magic-byte/MIME checks and SVG/empty/oversize/mismatched-extension rejection;
- checksum de-duplication and audit creation;
- owner versus edit-any metadata authorization;
- rights confirmation and public-visibility gating;
- search/filter/pagination result shape;
- featured and inline `ArticleMedia` reconciliation;
- publication blocking for unconfirmed attached media;
- publish promotion, anonymous draft denial and authenticated preview delivery;
- public article HTML rendering the managed media URL;
- referenced-asset deletion protection, blob cleanup and delete RBAC;
- rodeo hub assignment/unassignment without binary duplication.

## Honest boundaries

- Production Cloudflare R2/S3 was not configured or tested. No cloud resources
  or credentials were created. Only the local adapter is operationally verified.
- Production HTTP behavior was exercised through route, authentication and media
  smoke scripts; no claim of a cloud deployment or CDN test is made.
- The production RBAC mapping remains an owner decision; the tested local mapping
  is documented in `RBAC_PERMISSION_MATRIX.md` and `MEDIA_SECURITY_POLICY.md`.
