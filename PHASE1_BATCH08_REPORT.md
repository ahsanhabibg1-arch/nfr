# Phase 1 / Batch 08 — Monetization, Affiliate Management, Advertising Controls & Editorial Compliance

**Branch:** `batch-01-nextjs-migration` · **Date:** 2026-10-31 · Builds on Batch 07 (`9e1fd8f`).

A real, secure, database-backed monetization foundation integrated with the existing CMS,
rodeo entities, SEO Intelligence, Analytics and Media Library. No partner, revenue,
commission, approval, availability, price or AdSense approval is fabricated. External ad
serving and outbound click tracking are **disabled by default** (owner-gated).

---

## A. Baseline Verification

The Monetization page was a pure client-side mock (`AFFILIATE_PARTNERS`/`COMMERCIAL_LINKS`
from `mockAdminData`, hardcoded ad slots, fabricated "94% fill", "100% compliance"). The
public `AdSlot` was a static placeholder with no real ad script. Articles already carry
`disclosureType`/`disclosureNote`, and a `DisclosureBanner` exists. No monetization schema
existed. Public routes exist for articles/disciplines/sections but not rodeo hubs/events/
editions (DB relationships only).

## B. Architecture

Modular services under `lib/monetization/` (url validation, rel policy, config, clicks,
public read helpers) + `lib/cms/monetizationService.ts` (RBAC-gated CRUD/reads/dashboard/
compliance). Commercial data is kept strictly separate from editorial facts and source
verification. See `MONETIZATION_ARCHITECTURE.md`.

## C. Database Changes

Additive migration `20261031200000_batch08_monetization` (dev + test): enums
(`AffiliateCategory`, `PartnerVerificationStatus`, `MonetizationStatus`,
`AffiliateRelAttribute`, `AdPlacementSlot`, `CommercialEntityType`) and 10 models
(`AffiliatePartner`, `AffiliateProgram`, `AffiliateLink`, `AffiliatePlacement`,
`AdPlacement`, `MonetizationDisclosure`, `SponsoredContentRelationship`,
`CommercialEntityAssociation`, `MonetizationConfiguration`, `AffiliateClickAggregate`),
plus two `Article` back-relations. No credentials/secrets stored. No existing table altered
destructively; no data reset.

> Migration safety note: `migrate diff` initially tried to **drop** the Batch 07 FTS
> `Article.searchVector` generated column (a DB-managed column not modeled in Prisma). Those
> DROP statements were stripped, the column was declared `Unsupported("tsvector")` in the
> schema, and the column+index were restored on dev + test. See `MIGRATION_STATUS.md`.

## D. Affiliate Partner Management

Full CRUD + verification lifecycle (UNVERIFIED→PENDING→VERIFIED→REJECTED). A partner starts
unverified + inactive and **cannot be activated until VERIFIED**. No partners are
pre-populated. See `AFFILIATE_PARTNER_MANAGEMENT.md`.

## E. Affiliate Link Management

Centralized registry with server-side URL validation (rejects `javascript:`/`data:`/private/
metadata targets), per-link `rel` policy, effective dates, and reference-safe deletion. See
`AFFILIATE_LINK_SYSTEM.md`. Links are assigned to content via `AffiliatePlacement`; the
first-party `/go/[id]/` redirect resolves only active, in-effect, approved destinations from
the DB (open-redirect-safe) and falls back to the homepage otherwise.

## F. Ad Placement Management

AdSense-ready logical placements (slot, scope, device, priority). **External serving is OFF
by default**; enabling a placement only reserves a labeled container — no AdSense script is
injected in this batch. See `AD_PLACEMENT_MANAGEMENT.md`.

## G. Article Integration

`ArticleMonetization` (server component) renders active, approved offers + disclosure +
sponsored label on published articles, clearly delineated from editorial content. The
approved eight-field editor is unchanged.

## H. Rodeo Entity Integration

`CommercialEntityAssociation` models partner relationships for hubs/events/editions/
disciplines, preserving event-vs-edition separation (NFR 2026 ≠ NFR 2027; never auto-copied).
No broken public links are generated for entities without public routes.

## I. Disclosures & Sponsored Content

Reusable disclosure policies (site/article/callout/sponsored/ad/partner), seeded with
independent default text. Sponsored content is a separate classification with its own label
and paid-link attributes. See `MONETIZATION_DISCLOSURE_POLICY.md`.

## J. Click Analytics

`recordOutboundClick` reuses the Batch 07 privacy posture and requires BOTH the monetization
click-tracking switch AND analytics collection to be enabled (both OFF by default). No
identifiers stored; per-link per-day aggregate only; clicks never equated to revenue.

## K. Monetization Dashboard

Real counts + readiness checklist; honest "Not configured"/"Not tracked"/"Disabled" states.
No revenue/earnings/RPM/CPC/conversion/commission/AdSense figures are shown.

## L. SEO & Media Integration

A separate, advisory commercial-compliance report (missing disclosure, expired-but-active
offer, commercial-on-unpublished, invalid destination, unverified active partner) —
distinct from the unchanged 37 Batch 06 SEO rules. Media reuse respects Batch 05 rights.

## M. RBAC & Security

Seven owner-approved permissions, server-enforced + audited (see
`MONETIZATION_RBAC_MATRIX.md`). URL validation, open-redirect prevention, no SSRF, no
secrets, reference-safe deletion (see `MONETIZATION_SECURITY_POLICY.md`).

## N. Automated Tests

`tests/monetization-unit.test.ts` (7, no DB) + `tests/monetization.test.ts` (11, DB). Full
suite **161/161**, deterministic ×2. Test files now run serially (shared config rows).

## O. Production Build & Smoke Tests

`next build` PASS (`/admin/monetization`, `/go/[id]`). Against a clean production server:
route **28/28**, admin **10/10** (incl `/admin/monetization/`), media **7/7**. `test:cache`
**10/10** (dev). See `BATCH08_TEST_REPORT.md`.

## P. Files Created/Modified

See `BATCH08_TEST_REPORT.md`.

## Q. Known Limitations

Rodeo entities have no public routes (DB relationships only); AdSense/click tracking
disabled-by-default; in-memory rate limiting (single-instance); FTS vector drift in
`migrate diff` requires the documented hand-strip process. See `KNOWN_LIMITATIONS.md`.

## R. Owner Decisions Required

Enabling AdSense (+ real publisher id + script), enabling outbound click tracking, connecting
any affiliate/ad provider API, activating real commercial offers, and changing global
disclosure policy all remain owner-gated (§30). None were enabled.

## S. Batch 09 Readiness

Batch 08 is complete and committed. Batch 09 was **not** started.
