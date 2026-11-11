# Stage 05 — Handover to Stage 06

**Stage:** 05 of 10 · **Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

**Stage 06 scope (from the Stage 02 roadmap):** Visual Builder Canvas & Responsive Editing — the core product goal. Replace the block-list canvas with the real rendered page, add click-to-select, and add device widths.

---

## 1. Stage 06 is fully unblocked

**No owner decision blocks it.** The Stage 02 roadmap identified Stage 06 as the swap-ahead candidate precisely because it has no dependency on D-04 or any other pending approval, and that remains true now that D-04 is resolved.

Its one prerequisite was **Stage 04's property-integrity work**, which is complete: zero `INERT` exemptions, duplicate definitions consolidated, validation `PropDef`-driven. The reasoning recorded in Stage 02 still holds — a visual canvas that visibly ignores edited properties would have been worse than a list, because the admin could then *see* that nothing changed.

---

## 2. What Stage 06 inherits

| Asset | Where | Use |
|---|---|---|
| **The preview iframe** | `app/admin/(dashboard)/website/preview/route.ts:38-64` | **Mount this as the canvas. Do not build a second renderer.** It already enables `draftMode()` behind a permission check and renders real draft pages for all 15 page keys |
| `PageRenderer` | `components/blocks/PageRenderer.tsx` | the single render path. Note it is `'use client'` and applies neither visibility filtering nor order sorting — see §4 |
| `PropFieldShell` / `SimplePropField` | `views/admin/PropField.tsx` | the properties panel. Reuse for any new control so help text, ARIA association and dependency guidance come for free |
| `resolveMaxInstances(def, family)` | `lib/cms/sectionRegistry.ts` | family-aware caps, already enforced in the editor and the service |
| `SelectionContext` + `pickedThenAuto` | `lib/cms/slotUtils.ts` | the content-source contract. A Content Source panel should read and write these properties, not invent new ones |
| `getKnownSectionTypes` / `isRetiredSectionType` | `lib/cms/sectionRegistry.ts` | distinguish "may exist in a stored layout" from "may be added" |
| **The working route-harness recipe** | §5 | the HTTP harness now runs; keep it running |
| 63 Stage 05 + 90 Stage 04 behavioural tests | `tests/stage04-*`, `tests/stage05-*` | regression safety net for the registry, validation and selection |
| Mutation discipline | `STAGE_05_TEST_AND_MUTATION_REPORT.md` §3 | the pattern each new invariant must follow |

**Working baseline:** 90 files · 1885 tests · **1885 passing · 0 failed · 0 skipped** · `tsc` 0 errors · `next build` succeeds · route harness 33/37 (4 dev-mode artefacts).

**KD-01 is closed.** There is no longer a known-failing test, so the regression tripwire changes: **any** failure in Stage 06 is a new regression, not an expected one.

---

## 3. Recommended Stage 06 sequence

Ordered so each step is provable before the next begins.

1. **Emit `data-slot-id`** on each block's outermost element, from `components/blocks/registry.tsx` and the four block component files. One attribute, no layout impact. Add a contract test asserting every rendered block carries it.
2. **Mount the existing preview route as the canvas panel**, parameterised by `pageKey`. Reuse — the infrastructure already renders real draft pages.
3. **postMessage bridge**, iframe → parent on click (`slot:select`), parent → iframe for highlight. **Validate `event.origin`** against the site origin and ignore everything else. The highlight must apply a CSS class to an element matched by `data-slot-id` and **never set HTML from message data** — prop values are admin-authored, and while Stage 04 hardened validation, the iframe runs with `allow-scripts`.
4. **Device widths** at 1280 / 768 / 390, applied to the iframe **container**, not by re-rendering.
5. **Scoped canvas reload** after a successful save, preserving scroll position where practical. Degrade gracefully rather than blocking the stage on it.
6. **Honest labelling** for the 9 page keys that do not compose from slots — an explicit banner, not an implied capability.
7. **Content Source panel** (Stage 02 UX-07), reading the existing `featuredIds` / `articleCount` properties through `PropFieldShell`. Lead with a plain-language summary — "Showing the 6 newest Plan & Watch articles" — and never show a raw filter key.

---

## 4. Architecture notes Stage 06 will hit

**`PageRenderer` is `'use client'` and applies neither visibility nor order.** Those rules live in four separate resolvers. Stage 02 recommended centralising them in the renderer, and Stage 07 was pencilled in for the server-component conversion. If Stage 06 touches `PageRenderer` for `data-slot-id`, moving the filter/sort there is a cheap, low-risk win — but **do not** attempt the server-component conversion at the same time: four blocks use `useRouter`, and entangling that with the canvas work would make a failure hard to attribute.

**Unknown slot types render `null` silently** (`PageRenderer.tsx:17`). The Blueprint's invariant R1 requires "skipped **and** logged". Now relevant: a retired block is exactly this case, and a silent skip makes a legacy newsletter slot invisible to an operator. Worth adding the log while you are in the file.

**Sequential slot resolution is deliberate.** Cross-slot deduplication requires it. If canvas refreshes feel slow, the answer is a batched candidate fetch shared across slots — **not** reintroducing parallel resolution, which would break KD-01.

**A slot may legitimately render fewer items than its count** when unique content is exhausted. Surfacing "showing 2 of 4 — not enough unique articles" in the properties panel would be a genuinely useful Stage 06 addition, and would pre-empt a plausible "the count control is broken" report.

---

## 5. Route harness — keep it running

Stage 05 executed the HTTP route harness for the first time. **Preserve this.**

```bash
# 1. no conflicting server — Next refuses a second dev instance and the symptom
#    is a confusing 500 rather than a clear port error
netstat -ano | grep -E ":3000|:3100" | grep LISTENING

# 2. dev server against the ISOLATED test database
DATABASE_URL=$TEST_DATABASE_URL APP_ENV=development npx next dev -p 3100

# 3. read-only route smoke
SMOKE_BASE_URL=http://localhost:3100 npx tsx scripts/route-smoke.mts
```

**Do not use `next start`.** It sets `NODE_ENV=production`, which activates the environment isolation guard and correctly refuses a production build against a local database. That guard must not be weakened.

**Known limitation:** 4 of 37 checks assert a 404 status for unknown slugs. In dev, `notFound()` renders the 404 page but returns status 200, so those four fail as a dev-mode artefact — the route *does* call `notFound()` and the body *is* the 404 page. Confirming the status needs a production-mode server against an isolated database, which requires either an `APP_ENV` / `NEXT_PUBLIC_SITE_URL` combination that satisfies the guard, or a hosted staging environment. **A reasonable Stage 06/07 task:** teach the harness to accept "404 page rendered" in dev mode, or add a staging target.

**Still unauthorized:** `test:cache` (writes to the database — **Stage 08 needs it** to verify cache scoping), `test:migration` (creates a throwaway database), `test:e2e` (production server plus Playwright browsers not installed).

---

## 6. Carried-forward items

| Item | Owner stage | Note |
|---|---|---|
| `landing-competition-disciplines` promotion | 07 | renders two hardcoded headings on `/competition/` that no admin can edit |
| `detail-hero` / `detail-body` / `detail-faq` removal | 07 | confirmed by approved Option B. Stored-layout audit shows zero occurrences. Both are `required: true` and appear in `buildDefaultSlots('detail-template')`, so removal changes the detail default layout |
| `directory-hero` / `directory-grid` renderers | 07 | `directory-grid` is `required: true` yet unrenderable — whoever removes it must drop the `required` flag in the same change, or a directory layout becomes unsavable |
| **Directory content source** | 07 | listings are fetched directly by each route, outside the slot system. Documented as a gap in Stage 05, deliberately not invented |
| Section-landing cross-slot dedup | 07, if needed | each landing has one article feed today, so nothing to deduplicate. The contract already supports a shared context if more feeds are added |
| KD-08 draft-save cache flush | 08 | **needs `test:cache` wired up first** |
| KD-09 / KD-10 concurrency | 08 | interactive `expectedVersion`; atomic revision numbering |
| KD-11 / KD-12 legal pages | 09 + D-13 | engineering fix separable from the owner/legal publication decision |
| KD-13 / KD-14 SEO gaps | 09 | Stage 03 Task E established the causation pattern |
| 49 grandfathered structural tests | opportunistic | Stage 05 added none and converted six others; convert as each stage touches the area |
| `richtext` prop type | unscheduled | declared in `PropType`, used by no block, rendered as a plain textarea. Implement or remove |
| **Newsletter component** | when D-11 is revisited | `NewsletterSignup` in `PremiumBlocks.tsx` is retained but unreachable and annotated. **Do not re-register it** until a backend and consent workflow exist |

### Mutation gaps still open

Carried from Stage 03, unchanged: **draft isolation** has no mutation proving its assertion is load-bearing — the honest mutation would make published retrieval read the draft column, which leaks unpublished content and deserves a deliberate run with the owner's awareness. The **test quality gate** is self-tested against synthetic titles but no deliberately-bad test file has been added to confirm it blocks one end to end.

---

## 7. Owner decisions

**Resolved to date:** D-15, D-01, D-02 (Option B), D-03 (Stage 03) · D-04, D-11 (Stage 05) · D-10 settled as engineering.

| Priority | ID | Decision | Blocks |
|---|---|---|---|
| 1 | **D-13** | Legal content approval and indexing — 7 pages serve `noindex` with a visitor-facing draft banner | Stage 09 |
| 2 | **D-07** | Revision retention policy — unbounded today | Stage 08 |
| 3 | **D-05** | Footer ownership — nav edits are silently overridden by `SiteConfig` | Stage 08 |
| 4 | **D-06** | Appearance controls — the tab controls only the homepage banner | Stage 08 |
| 5 | **D-12** | Scheduler and deployment target | Stage 08 |
| 6 | **D-14** | Sitewide `Organization` / `WebSite` JSON-LD — needs owner-supplied publisher facts | Stage 09 |
| 7 | **D-09** | Info-page publication workflow | Stage 09 |

**None blocks Stage 06.** The first four all land in Stage 08, so resolving them during Stage 06 or 07 would keep that stage unblocked.

### One product decision made in code, not yet ratified

**Hero priority.** The homepage hero resolves and claims its articles first, regardless of where the admin places the block — so if the lead story also qualifies for a category feed, the hero keeps it and the feed moves on. This is deterministic and documented, but it is an editorial judgement embedded in the resolver. If the owner would prefer position order to decide, it is a one-line change. Flagged rather than left implicit.

---

## 8. What Stage 06 must not do

- **Do not build a second renderer** for the canvas. Mount the existing preview route. A separate "editor-mode" renderer would drift from production output and reintroduce the duplication this programme has spent two stages removing.
- **Do not weaken the environment isolation guard** to get a harness or a canvas running. Use dev mode (§5).
- **Do not reintroduce parallel slot resolution** — it would break KD-01, which has only just closed.
- **Do not add a source-text assertion** to a test whose name claims a rendering outcome; the Stage 03 gate will fail, correctly.
- **Do not grow the exemption register.** It stands at 16 entries with **zero `INERT`**.
- **Do not re-register the newsletter block**, and do not add a subscription backend or collect visitor data — D-11 is explicit.
- **Do not advertise a content-source control that is not implemented.** No `fallbackPolicy`, `emptyBehavior` or `upcoming` property exists; the Content Source panel must describe only real behaviour.
- **Do not implement full detail-page composability or redesign directory templates** — Stage 07.

---

## 9. Git and environment state at handover

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge or branch created** |
| Modified tracked files | **24** (plus 1 deletion — 25 in the diffstat; 10 of the 24 carried from Stages 01–04) |
| Deleted | `apps/web/lib/cms/contentSourceEngine.ts` (staged as a working-tree deletion; recoverable from `fd4fb10`) |
| New untracked | 3 Stage 05 test suites |
| Prisma migrations | **19 — unchanged**; no migration authored or applied |
| Schema | **unmodified** |
| Databases | production never contacted; development never written to; the test database written only by the suites' own fixtures, which clean up after themselves |
| Dev servers | terminated; ports 3000 and 3100 confirmed free |

Git finalization remains deferred until the owner requests it.
