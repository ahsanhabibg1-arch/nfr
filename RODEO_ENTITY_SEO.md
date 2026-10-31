# Rodeo Entity SEO Intelligence (Batch 06 §11)

> Audience: editors + engineers. The NFRGuide-specific checks that understand the
> rodeo entity model and the recurring-event vs. annual-edition distinction.

## Entity model the engine understands

```
Recurring event (permanent identity)   e.g. "National Finals Rodeo"
  ├── Edition (annual occurrence)       e.g. NFR 2026
  ├── Edition                           e.g. NFR 2027
  └── Related articles / guides
Hubs · Disciplines · Venues · Categories · Sources
```

A **recurring event** is a permanent entity; each **annual edition** is a
distinct occurrence (separate tables, separate junctions). The engine **never
merges** the two.

## Checks

| Finding | Meaning |
|---|---|
| `RODEO_DUP_SLUG` | The same slug is used by more than one rodeo entity (hub/event/edition/discipline/venue) → URL collision risk. |
| `RODEO_EVENT_NO_EDITION` | A recurring event has no editions recorded. |
| `RODEO_ORPHAN_EDITION` | An annual edition is not referenced by any article. |
| `RODEO_ARTICLE_EDITION_MISMATCH` | An article is linked to an edition whose **parent event is not among the article's linked events** — a likely wrong-edition association. |
| `RODEO_EDITION_NO_VENUE_DATE` | An edition has neither a venue nor a year recorded (verify; never fabricate). |

## Safeguards

- The engine **does not invent** event facts (dates, venues, purses, results).
  `RODEO_EDITION_NO_VENUE_DATE` only reports the *absence* of metadata; it never
  supplies a value.
- It **does not merge** recurring events with editions, and it does not create
  indexable pages for incomplete entities.
- Entity relationships are read from the Batch 04 rodeo tables and the Batch 04/05
  article↔entity junctions.
