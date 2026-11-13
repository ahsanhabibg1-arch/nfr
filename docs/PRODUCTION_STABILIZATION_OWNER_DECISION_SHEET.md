# Owner Decision Sheet — Production Stabilization

**Date:** 2026-11-13 · Companion to the
[Combined Final Review](PRODUCTION_STABILIZATION_COMBINED_FINAL_REVIEW.md)

**Two decisions block the production rollout. Nothing else does.**
Everything else is built, tested and waiting.

---

## Decision 1 — The managed Subcategory mapping

**What it is:** eleven legacy `Article.subcategory` text labels, one article
each. Each becomes a managed Subcategory (CREATE), joins another one (MERGE), or
stays as legacy text with no managed entry (RETAIN).

**Nothing is deleted under any option.** The legacy text is never modified, and
the public page keeps displaying it either way.

### The three things that shaped the recommendation

1. **Every label has exactly one article**, and the approved rule is that a
   subcategory archive stays `noindex` until it has three. **No option produces
   an SEO gain today.**
2. **Six of the eighteen Article Types already name these topics** —
   `Ticket Guide`, `Venue Guide`, `How to Watch`, `Travel Guide`,
   `Entertainment Guide`, `Product Buying Guide` — and the category archive
   already filters by Article Type. For those topics a subcategory restates
   something that exists and works.
3. **Four of the five sections hold one article**, so a subcategory there would
   produce an archive identical to its parent section.

### Pick one

| | Option | Result | Best when |
|---|---|---|---|
| **A** | **Recommended — 2 CREATE / 9 RETAIN** | Creates `Scoring & Tactics` (NFR Competition) and `Accommodations` (NFR Plan & Watch). 2 articles attached. | You want a managed second level only where no other axis already expresses it |
| **B** | 04-C's original — 7 CREATE / 1 MERGE / 3 RETAIN | Creates 7 subcategories, attaches 8 articles, renames *Broadcast Intelligence* → *Watching & Broadcast*, merges *Spectator Strategy* + *Venue Navigation* → *Visiting Las Vegas* | You want the full second level in place now and will grow coverage into it |
| **C** | All RETAIN — create nothing | No change at all. The Subcategory CMS stays available for new editorial work | Lowest risk; revisit when any topic reaches three articles |

**Your decision:** ☐ A ☐ B ☐ C ☐ a variant (say which rows differ)

**To approve:** edit `apps/web/prisma/taxonomy/subcategory-mapping.json` — set each
`action`, adjust names/slugs, then set `approval.status` to exactly `APPROVED`
with `approvedBy` and `approvedAt`. Until then the backfill refuses to write
anything, which is tested.

---

## Decision 2 — BKP-01, the backup restore rehearsal **(the gating item)**

**Where it stands:** WAL archiving was observed working on production in an
earlier authorized session — 58 segments, zero failures. **That proves archiving
works. It does not prove a backup restores.** No restore has ever been performed
for this database, so BKP-01 is **BLOCKED**, and it blocks the first schema
change this programme makes to production.

**This session had no production access at all**, so nothing could be re-checked
and no cloud resource was created.

### What is being asked for

| | |
|---|---|
| **Operation** | One Aiven **point-in-time fork** of the production PostgreSQL service |
| **Name** | `nfr-restore-rehearsal-2026-11-13` |
| **Isolation** | A new, separate service. **Nothing is restored over production.** Fork-only credentials, never used in any application config |
| **Cost** | A fork is a **paid** service while it runs. The database is ~13 MB, so the smallest plan suffices; expected lifetime **under two hours**. Exact pricing needs console access |
| **What runs on it** | `prisma migrate deploy` for the two pending migrations, plus a before/after integrity fingerprint |
| **Cleanup** | Power off, delete, confirm removal, rotate the fork credential |
| **Still needed from you** | Aiven console or API access, the retention policy, and cost approval |

**Acceptance — what turns BKP-01 to VERIFIED:** the fork reports *running*; the
fingerprint matches production except for the new nullable columns; both
migrations apply cleanly with their output recorded.

**Your decision:**
☐ Approve the fork (and confirm the plan/cost)
☐ Supply Aiven access so it runs under a separate authorization
☐ Defer — production rollout stays blocked

---

## Decision 3 — Commit the working tree? *(not blocking)*

30 modified + 25 untracked files are uncommitted, spanning Issue 03 and Batches
04-A through 04-E.2. All of it is locally verified: 136 test files, 3,169 passed,
TypeScript clean, production build successful.

**Your decision:** ☐ Commit now (one commit, no push) ☐ Commit and push ☐ Leave uncommitted

---

## What happens after you decide

```
Decision 2 approved ──► restore rehearsal ──► BKP-01 VERIFIED
                                                  │
                                                  ▼
                        apply the 2 pending migrations (additive, no row rewrite)
                                                  │
                                                  ▼
                        bootstrap Article Types ──► deploy ──► smoke checks
                                                  │
Decision 1 approved ──────────────────────────────┤
                                                  ▼
                        backfill: dry run ──► read ──► execute
                                                  │
                                                  ▼
                                          production UAT
```

Each step needs its own authorization. None of them has been started.

---

## For the record

| | |
|---|---|
| Production database | never connected to in this session |
| Production migration / backfill / deployment | not run |
| Cloud resources | none created |
| Git | untouched — HEAD `aafdad2`, no stashes |
| Mapping file | still `PENDING_OWNER_APPROVAL`, `approvedBy: null` |
| Rehearsal | performed on `nfrguide_test` with a synthetic fixture, then fully reverted |
