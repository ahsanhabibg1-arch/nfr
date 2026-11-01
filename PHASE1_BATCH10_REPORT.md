# Phase 1 / Batch 10 — Public Rodeo Entity Pages, Editorial UX Completion & Launch Readiness Foundation

**Branch:** `batch-01-nextjs-migration` · **Date:** 2026-11-01 · Builds on Batch 09 (`95ae2ff`).

Resolves the long-standing "rodeo entities have no public route" limitation by shipping real,
SEO-complete public pages for rodeo hubs, recurring events and annual editions, wiring them into
search/sitemap/analytics/monetization, and keeping the migration-replay/FTS safety gate green.
Owner-approved decisions (route scheme, hub↔event junction, no-Docker local-PG replay, full
scope) were followed.

## A. Baseline

Public routes existed for articles/disciplines/sections/search; rodeo hubs/events/editions were
CMS/DB-only (documented limitation) and excluded from search. Master Requirements specify
`/rodeo-events/<event>/<edition>/` style canonical paths with hub-independent event URLs.

## B. Route Architecture (owner-approved: flat scheme)

| Entity | Canonical URL | Render |
|---|---|---|
| Section landing | `/rodeo-events/` | `app/(public)/rodeo-events/page.tsx` (DB hubs/events + editorial section) |
| Hub **or** event | `/rodeo-events/<slug>/` | `[slug]/page.tsx` — resolver, event precedence, 404 if neither |
| Edition | `/rodeo-events/<event>/<edition>/` | `[slug]/[edition]/page.tsx` — enforces edition belongs to event |

A dedicated static `rodeo-events/` page serves the section landing (the static segment shadows
the `[section]` dynamic route, which now excludes `rodeo-events`). Hub and event share the
depth-1 namespace; **cross-table slug uniqueness** is enforced on create in `rodeoService`
(slugs are immutable after create). All trailing-slash + canonical; indexable, with `noindex`
for content-less entities. Discipline-in-edition URLs were intentionally **omitted** (disciplines
keep `/disciplines/<slug>/` — no duplicate canonicals).

## C. Database

Additive migration `20261101000000_batch10_rodeo_hub_event`: one junction `RodeoHubEvent`
(hub↔recurring-event M:N). The generated diff's `searchVector` DROP drift was hand-stripped
(FTS preserved). Seeded idempotently (`scripts/seed-rodeo-links.mts` + the seed) from the mock
`hubId`. No existing table altered; no data reset.

## D. Read Layer & Views

`lib/rodeoContent.ts` (server-only) exposes published reads (`getPublicHubBySlug`,
`getPublicEventBySlug`, `getPublicEditionBySlug`, landing lists, resolver, slug lists). Only
PUBLISHED articles are linked; dates render **verified or explicitly unconfirmed** (never
fabricated). `views/RodeoViews.tsx` renders hub/event/edition with cross-navigation
(hub↔event↔edition↔discipline↔article) and a directory on the section landing.

## E. SEO / Sitemap / Analytics / Monetization Integration

- **JSON-LD:** breadcrumbs on all rodeo pages; schema.org `Event` on editions **only when dates
  are verified** (`rodeoEditionJsonLd`, §8.2-safe).
- **Sitemap:** hub/event/edition URLs added.
- **Search (B07):** hubs/events/editions now appear in public search (type filter `rodeo`),
  removing the documented exclusion; each result carries its analytics entity type.
- **Analytics (B07):** `ViewBeacon` on rodeo pages; `RODEO_*` entities now validate for
  content-view events (still disabled-by-default).
- **Monetization (B08):** active, verified `CommercialEntityAssociation`s render per event /
  edition (event-vs-edition separation preserved; nothing auto-carried across years).

## F. Launch Readiness & Migration Gate

Canonical/sitemap/robots/404/noindex verified across new pages. Per owner decision (**no
Docker**, use local PostgreSQL), the migration gate runs on the local `nfrguide_test` database:
`searchVector` tsvector + GIN index + FTS query + all expected tables (**5/5**), plus the
always-on Vitest FTS regression. The full from-zero fresh-DB replay remains the one explicit
**carried-forward gate** — the script (`npm run test:migration`) runs it on local Postgres when
a one-time CREATEDB-capable `MIGRATION_REPLAY_ADMIN_URL` is provided (no Docker, no production
access). See `MIGRATION_REPLAY_VERIFICATION.md`.

## G. Verification

typecheck clean · vitest **186/186** (×2) · `next build` PASS · route **33/33** · admin
**13/13** · media **7/7** · cache **10/10** · migration/FTS **5/5**. See `BATCH10_TEST_REPORT.md`.

## H. Security / SEO notes

URL collision mitigated (cross-table uniqueness + event-precedence + 404); only published
content exposed; verified-or-unknown dates; monetization/analytics stay disabled-by-default;
ISR revalidation verified.

## I. Known Limitations (carried + new)

- **Full fresh-from-zero migration replay still deferred** (owner chose local test-DB gate, no
  Docker). Runnable on local Postgres with a CREATEDB role via the provided script.
- Cross-table rodeo slug uniqueness is enforced at write time (Postgres can't express a
  cross-table constraint); `scripts/seed-rodeo-links.mts` and the create guard cover it.
- `migrate diff` still drifts on `searchVector` (hand-strip required each migration).

## J. Owner Decisions Required

Provide a one-time local CREATEDB URL when you want the full fresh replay run; otherwise no
outstanding decisions. Batch 11 not started.
