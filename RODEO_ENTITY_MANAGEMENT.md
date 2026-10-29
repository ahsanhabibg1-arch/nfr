# Rodeo Entity Management (Batch 04 — Phase D)

> Audience: editors and engineers working with NFRGuide's rodeo coverage data.
> Covers the entity model, the critical recurring-event vs. annual-edition
> distinction, and the deletion-protection rules.

## 1. Entities

| Entity | Table | Identity | Managed at |
|--------|-------|----------|------------|
| Hub | `RodeoHub` | `hub-<slug>` | Rodeo Coverage → Hubs |
| Recurring Event | `RodeoEvent` | `event-<slug>` | Rodeo Coverage → Recurring Events |
| Edition | `RodeoEventEdition` | uuid, unique per `(eventId, editionSlug)` | Rodeo Coverage → Editions |
| Venue | `Venue` | `venue-<slug>` | Rodeo Coverage → Venues |
| Discipline | `Discipline` | seeded, read-only here | Rodeo Coverage → Disciplines |

Service: `lib/cms/rodeoService.ts`. Permission: **`rodeo.manage`** (Editor and
above). All reads are available to any CMS user; mutations require the
permission and are audited.

## 2. The recurring-event vs. annual-edition distinction (Master Reqs §6)

This is the core modelling rule and is enforced in both the schema and the UI:

- A **recurring event** (`RodeoEvent`) is the *stable identity* of a rodeo that
  happens repeatedly — e.g. "National Finals Rodeo". It carries name, location,
  status, organizer and a flagship flag. It is **not** tied to a year.
- An **edition** (`RodeoEventEdition`) is *one occurrence* of that event — e.g.
  "2025 National Finals Rodeo". It belongs to exactly one recurring event
  (`eventId`), has an `editionSlug` (e.g. `2025`) that is **unique within its
  event**, and optionally a year, venue and a (verify-before-publishing) purse
  benchmark.

In the UI an edition can only be created under a chosen recurring event; the
event picker and the `editionSlug` field are shown on create and **locked on
edit** (the parent relationship and slug never silently move). Editions are
listed with their parent event name so the two concepts never blur.

Rationale: editorial content links to the right granularity — evergreen
coverage links to the event; year-specific results/recaps link to the edition.

## 3. Deletion protection (Master Reqs §7)

Nothing that published editorial content depends on can be casually deleted.
`rodeoService` counts references before deleting and throws `conflict` when any
exist:

| Delete | Refused when |
|--------|--------------|
| Hub | any `ArticleHub` rows reference it |
| Recurring event | it still has editions **or** any `ArticleEvent` rows reference it |
| Edition | any `ArticleEdition` rows reference it |
| Venue | any edition uses it |

The UI reflects this: a referenced row shows a `locked (<n> …)` marker instead
of a Delete button. To remove a referenced entity you must first detach or
re-point the articles/editions — there is no cascade of published content.

Disciplines are foundational site taxonomy (seven seeded disciplines, the seven
canonical `/disciplines/<slug>/` routes). They are **read-only** in this module
— shown with their article counts but never created or deleted here, so the
canonical routes are preserved.

## 4. Data integrity notes

- `RodeoEventEdition` has a composite unique constraint `@@unique([eventId,
  editionSlug])` — the service pre-checks and returns a friendly `conflict`
  before the DB constraint would fire.
- No fabricated schedules, results or purses are written. Purse benchmark is a
  free-text field explicitly labelled "verify before publishing" and may be left
  blank; the UI carries a reminder not to enter unverified figures.
- Deleting a recurring event cascades to its editions **only at the database
  FK level** (`onDelete: Cascade`) — but the service blocks that path while
  editions exist, so the cascade never runs against referenced content in
  practice.

## 5. Tests

`tests/batch04.test.ts` covers: `rodeo.manage` enforcement (Author forbidden),
event→edition creation, edition-slug uniqueness, event-with-editions delete
refusal, edition-referenced-by-article delete refusal, hub-referenced delete
refusal, and venue-used-by-edition delete refusal.
