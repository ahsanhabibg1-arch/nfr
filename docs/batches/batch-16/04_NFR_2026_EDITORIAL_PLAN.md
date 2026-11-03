# Batch 16 — NFR 2026 Editorial Plan

## Existing structure (reused — no duplicate hubs/events/editions created)
The platform already supports the full NFR hierarchy via existing entities: RodeoHub → RodeoEvent →
RodeoEventEdition (annual), Discipline (7), Competitor + edition-level participation, Venue, Article +
entity junctions, EntitySeo/EntityFaq, Sources, Media (rights-gated), and Batch-14 edition coverage
(CompetitionSession/Result/Standing) with the PUBLISHED+VERIFIED public gate. Public pages:
`/rodeo-events/[slug]/[edition]/` (+ `/schedule`, `/results`, `/standings`), discipline/competitor/venue
profiles, and the new directories.

**To stand up NFR 2026:** create (via the CMS) an "NFR" RodeoEvent + a 2026 RodeoEventEdition with
**verified** dates/venue, then manage its coverage — the same system serves it. No NFR-specific code.

## Content inventory — existing vs missing (data-model is READY; content is the gap)
| Area | Data model | Admin | Public | Content status |
|---|:--:|:--:|:--:|---|
| NFR 2026 overview (edition landing) | ✅ | ✅ | ✅ | **not created** (needs verified dates/venue) |
| Schedule | ✅ | ✅ | ✅ | not entered (needs official schedule) |
| Contestants (participation) | ✅ | ✅ | ✅ | not entered (needs verified qualifiers) |
| Results / Standings | ✅ | ✅ | ✅ | correctly empty (event not held) |
| Watching guide | via articles/affiliates | ✅ | ✅ | not authored (needs authorized broadcaster info) |
| Tickets / visitor guide | via articles/affiliates | ✅ | ✅ | not authored (needs verified ticket sources) |
| FAQ | ✅ | ✅ | ✅ | not authored |

## Verified content status — BLOCKED
External source-verification tooling (web search / fetch) is **not available in this environment**, so no
official NFR 2026 fact (dates, venue, schedule, qualified contestants, broadcast rights, ticket
availability) could be substantiated. Per policy, **no such content was fabricated or published.** Results/
standings are correctly absent (the event has not occurred). See `05_…SOURCE_REGISTER.md` for the
research checklist + empty source register, and the draft structure to fill once official sources are
accessible to a human editor.
