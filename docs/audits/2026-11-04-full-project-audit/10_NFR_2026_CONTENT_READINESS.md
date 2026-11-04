# 10 — NFR 2026 Editorial Launch Readiness

**Mode:** READ-ONLY. No content fabricated. Evidence: grep across `prisma/`, `app/`, `lib/` for NFR-2026 content; schema models.

## 1. Headline finding
**Infrastructure is READY; verified NFR 2026 content is ABSENT.**
- `grep -rln "NFR 2026|nfr-2026|National Finals Rodeo 2026|nfr2026"` across `prisma app lib` → **no matches** (only the generic homepage positioning string referencing "National Finals Rodeo").
- No seeded NFR 2026 edition, schedule, contestant list, results, standings, or broadcast/ticket content found in source.
- This is **correct and expected**: the platform was built to never fabricate event data. Content entry is a human, source-verified editorial task — not something code should pre-populate.

## 2. Status by content area
| Area | Infra | Draft | Verified | Published | Note |
|------|:----:|:----:|:-------:|:--------:|------|
| NFR event identity (RodeoEvent) | ✅ | ❔ | ❌ | ❌ | model ready; no seeded NFR flagship content found |
| NFR 2026 annual edition (RodeoEventEdition) | ✅ | ❌ | ❌ | ❌ | create via admin |
| Official dates & venue | ✅ | ❌ | ❌ | ❌ | **BLOCKED — human source verification** |
| 7 disciplines | ✅ | ❔ | ❔ | ❔ | Discipline model + guide routes exist |
| Rounds / schedule (CompetitionSession) | ✅ | ❌ | ❌ | ❌ | Batch 14 infra ready; empty |
| Qualified contestants (Competitor + Participation) | ✅ | ❌ | ❌ | ❌ | **BLOCKED — official qualifier list** |
| Results & standings | ✅ | ❌ | ❌ | ❌ | infra ready; verification enum gates publish |
| Authorized TV/streaming guide | ✅ | ❌ | ❌ | ❌ | **BLOCKED — verify broadcast rights** |
| Tickets & visitor info | ✅ | ❌ | ❌ | ❌ | **BLOCKED — official prices/links** |
| Entertainment & shopping guides | ✅ | ❔ | ❌ | ❌ | section routes ready |
| FAQ (EntityFaq) | ✅ | ❌ | ❌ | ❌ | admin CMS ready |
| Internal links | ✅ | — | — | — | auto once entities exist |
| Source register (Source/ArticleSource) | ✅ | ❌ | ❌ | ❌ | verification workflow ready |

Legend: ✅ ready · ❔ content-dependent (depends on what's seeded in the target DB) · ❌ absent · BLOCKED = needs external official source.

## 3. Human-verification checklist (prioritized — do NOT fabricate)
External web research/verification tooling was **not available/used** in this audit, and nothing was invented. Before any NFR 2026 article is published, a human must source-verify:
1. **Official NFR 2026 dates + venue** (PRCA / NFR official) → create RodeoEvent + 2026 edition.
2. **Broadcast/streaming rights** (authorized carriers only) → Plan & Watch guide.
3. **Qualified contestants** (official PRCA standings at qualification) → Competitor + CompetitorParticipation.
4. **Round schedule** → CompetitionSession (mark `verification=VERIFIED` only with a cited `sourceUrl`).
5. **Ticket prices / official purchase links** → Events & Shopping.
6. **Results/standings** entered only post-event, from official results, via correction-capable workflow.
7. Attach every claim to a `Source` record; keep `verification=UNVERIFIED` until a second check.

## 4. Guardrails already in code (good)
- `rodeoEditionJsonLd` returns `null` without verified `startAt` — no fake event schema.
- Competition `CoverageVerification` enum prevents surfacing unverified results as fact.
- Editor `imageRights` defaults to `Unresolved`.

## 5. Conclusion
NFR 2026 launch readiness is **content-blocked, not code-blocked**. Infrastructure to enter, verify, and publish is complete. The gating work is editorial source-verification + data entry (P0 content track), which must not be automated or fabricated.
