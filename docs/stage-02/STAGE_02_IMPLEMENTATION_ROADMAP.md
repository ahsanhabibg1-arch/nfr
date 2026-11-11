# Stage 02 — Implementation Roadmap, Stages 03–10

**Stage:** 02 of 10 (max 12) · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`
**Status:** proposed plan for owner review. Not approved. No Stage 03 work was performed.

Companions: `STAGE_02_HYBRID_BUILDER_ARCHITECTURE.md`, `STAGE_02_BLOCK_AND_PAGE_COVERAGE.md`, `STAGE_02_DECISION_REGISTER.md`.

---

## 1. Sequencing principle

**Stage 03 must land before any Builder change ships.**

The suite re-ran green in Stage 01 — 78 files, 1549 tests, 0 failures, `tsc` clean — while ten properties were inert, `helpText` never reached the DOM, and the live homepage rendered one article three times. Roughly 93% of the suite's substring assertions target source text, and **no test proves an admin edit reaches public HTML**. Until that is fixed, the suite cannot distinguish a fix from a no-op, and every later stage would be reported complete on the same evidence that has already failed twice.

The November 7 audit placed its contract test in a *later* phase. That ordering is the single change this roadmap makes to the historical plan, and it is deliberate.

**Mutation-testing rule.** Every invariant introduced in Stages 03–10 must be mutation-tested at least once: break the behaviour, confirm the suite goes red, restore. Stage 01 established the pattern — reinstating the vulnerable handler turned 13 of 21 tests red.

### 1.1 Ordering conflicts resolved

| Conflict | Resolution |
|---|---|
| Stage 04 wires inert props, but wiring changes live pages for owners who already saved values | **Stage 04 prerequisite:** read-only inventory of `PageLayout.draftSections` / `publishedSections` against a verified non-production database. Deferred from Stage 02, which was code-read-only |
| Stage 06 (canvas) makes prop behaviour *visible* — a visual canvas that visibly ignores edits is worse than a list | Stage 04 before Stage 06 |
| Stage 05 (content engine) depends on decision D-04, which may not be approved in time | Stage 06 is **fully unblocked** and can swap ahead of Stage 05 without penalty |
| Stage 07 (templates) depends on D-02, the largest open decision | Flagged now so the decision has the longest possible lead time |
| Stage 08 cache work needs `scripts/cache-invalidation.mts`, never executed in Stage 01 or 02 | **Stage 03 deliverable:** wire the harness into CI |
| Stage 09 needs three migrations | Each gated on explicit approval; none bundled with code-only work |

### 1.2 Stage order and blocking status

| Stage | Title | Blocked by | Can start now? |
|---|---|---|---|
| 03 | Behavioural Testing Foundation | — | **YES** |
| 04 | Block Registry & Property Rendering | D-11; D-02 (detail types only) | Partially |
| 05 | Dynamic Content Source Engine | **D-04** | No |
| 06 | Visual Builder Canvas & Responsive Editing | — | **YES** |
| 07 | Full Page Template Integration | **D-02**, D-03 | No |
| 08 | Publishing, Revisions & Global Controls | D-05, D-06, D-07, D-12 | Partially |
| 09 | SEO Intelligence & Legal Content Integration | D-09, D-10, D-13, D-14 | Partially |
| 10 | Complete QA & Production Readiness | inherits all | No |

---

## Stage 03 — Behavioural Testing Foundation

**Scope.** Build the verification capability the programme depends on. **No product behaviour changes** — this stage adds tests and one observability fix, nothing else.

**Prerequisites.** None. Fully unblocked.

**Affected modules.** `tests/` (new files) · `vitest.config.ts` (only if a setup file is needed) · `lib/cms/pageLayoutService.ts` (observability fix below) · CI configuration.

**Deliverables.**

1. **Registry contract test**, parameterised over all 27 declared types × every declared prop. For each: render via `renderToStaticMarkup` with a unique sentinel and assert it appears in output, **or** assert a recorded exemption in an explicit allowlist. The allowlist starts with the ten known inert props and must shrink, never grow. A new block is covered automatically.
2. **Layout-causation integration test** against the isolated `nfrguide_test` database: `saveDraft` → `publishLayout` → `getPublishedSections` → resolver → `renderToStaticMarkup` → assert the sentinel. This single test traverses the chain that 611 existing tests only describe.
3. **Draft-isolation test** across all 15 page keys: a draft-only sentinel must appear under `draft:true` and must **not** appear under `draft:false`.
4. **Deduplication invariant test** — no entity id appears twice across a resolved page's slots. **This will fail on first run** against the live homepage defect; that is the intended result and the fix belongs to Stage 05.
5. **Metadata-causation harness** — write an `EntitySeo` override, invoke the route's exported `generateMetadata`, assert the override surfaces. One page family as the pattern; the rest in Stage 09.
6. **Layout-compatibility test** — a fixture layout written before a prop existed still renders with defaults.
7. **Lint rule or review gate** forbidding `readFileSync` + `toContain` in any test whose name contains "renders", "shows" or "displays".
8. **Observability fix** — `getPublishedSections` / `getDraftSections` currently swallow all errors and return `buildDefaultSlots`, so a database fault is indistinguishable from "the layout reset itself". Log and distinguish. Included here because it would otherwise **mask regressions throughout Stages 04–10**.
9. **CI wiring** for `npm run test:routes`, `test:cache`, and Playwright, each with its documented environment prerequisites. Where an environment is unavailable, the job must report **blocked**, never silently pass.

**Required tests.** The deliverables *are* the tests. Each must be mutation-tested.

**Acceptance criteria.**
- The contract test enumerates every declared prop with no silent omissions, and its exemption allowlist contains exactly the ten known inert props.
- Deliberately breaking one wired prop turns the suite red.
- The dedup test fails against the current homepage (documenting the live defect) and is left failing with an explicit `.fails`-style annotation or a tracked skip, never deleted.
- `npm test` passes except that one documented expected failure.
- No production behaviour changed apart from added logging.

**Risks.** Low. The main risk is scope creep into fixing what the new tests reveal — resist it; the findings belong to Stages 04–09.

**Dependencies.** None.

---

## Stage 04 — Block Registry & Property Rendering

**Scope.** Make the registry authoritative. Every declared property is consumed or deleted; duplicate definitions collapse; validation enforces the declared contract.

**Prerequisites.** Stage 03 complete. **Decision D-11** (newsletter block). **Decision D-02** for the three inert detail types — all other work proceeds without it. **Stored-layout inventory** (see below).

**Affected modules.** `lib/cms/sectionRegistry.ts` · `components/blocks/registry.tsx` · `components/blocks/{LandingBlocks,DetailBlocks,DirectoryBlocks,PremiumBlocks}.tsx` · `components/editorial/SectionLandingHero.tsx` · `lib/cms/{homepageData,sectionLandingData,detailTemplateData,directoryData}.ts` · `lib/cms/pageLayoutService.ts` (validation) · `views/admin/AdminPageLayoutEditor.tsx` (helpText).

**Deliverables.**

1. **Stored-layout inventory (do this first).** Read-only query of both JSON columns against a verified non-production database: which of the ten inert props have stored values, and which undeclared keys exist. Wiring a prop that already has a saved value **changes a live page on next publish** — this inventory is what makes that safe.
2. **helpText in shared field chrome** so all nine editor types inherit it. Fixes the Task 4 false pass at its root rather than per-branch.
3. **Resolve the ten inert props.** Six are wiring or deletion; one (`landing-hero.heroImageUrl`) needs an image field added to `SectionLandingHeroProps`; three await D-02.
4. **Single definition per block type** — `rich-text-block` and `cta-banner` gain a `families: string[]` field, removing the first-wins limit override that silently applies homepage limits on landing pages.
5. **Registry-driven resolver allowlists**, so a visible saved block can no longer silently vanish.
6. **Property validation per `PropDef`** — type, `max`, `select` options. Clamp `detail-related.articleCount` (currently unbounded into a Prisma `take`). Enforce `required` server-side. Broaden the XSS check beyond `/<script/i`.
7. **Undeclared-key whitelist in warn-only mode** (D-10), with enforcement deferred until the inventory confirms the blast radius.
8. **Declare or remove the two synthetic slots** (`landing-empty`, `landing-competition-disciplines`) so the registry describes everything that renders.
9. **Fix the four `featuredIds` defaults** missing from `defaultProps`, and the `showImage` type mismatch.
10. **Newsletter block** per D-11.

**Required tests.** The Stage 03 contract test exemption allowlist shrinks to empty (or to entries with a recorded D-02 rationale) · validation matrix: out-of-range number, non-option select, undeclared key, oversize string, missing required block · duplicate-definition guard · boundary test proving `detail-related` is bounded · helpText DOM assertion per editor type.

**Acceptance criteria.**
- Zero declared properties without a consumer or a recorded exemption.
- No block type declared twice.
- `quick-access` → `kicker` help text is present **in the rendered DOM**.
- A saved `articleCount` of 1000 yields at most the declared max, and the save is rejected.
- Full suite green; no public page changes except those explicitly intended and listed.

**Risks.** **Medium — the highest-regression stage.** Wiring previously-ignored props changes live output. Mitigated by deliverable 1, and by staging per family with a public-HTML diff reviewed before each merge. A strict whitelist could reject existing rows, which is why it ships warn-only.

**Dependencies.** Stage 03's contract test is the acceptance mechanism; without it this stage cannot be verified.

---

## Stage 05 — Dynamic Content Source Engine

**Scope.** One coherent content-source contract. Fix the live deduplication defect. Make filtering and sorting admin-controllable.

**Prerequisites.** Stage 04 complete. **Decision D-04** (retire vs integrate) — **hard blocker**.

**Affected modules.** `lib/cms/slotUtils.ts` (promoted) · `lib/cms/{homepageData,sectionLandingData,detailTemplateData,directoryData}.ts` · `lib/cms/sectionRegistry.ts` (source props) · `lib/fixturePolicy.ts` (parity) · `app/admin/page-layout-actions.ts` (candidate search) · `views/admin/AdminPageLayoutEditor.tsx` (source panel) · `lib/cms/contentSourceEngine.ts` (retire, pending D-04) · `tests/batch33-unit.test.ts` (remove four source-text assertions).

**Deliverables.**

1. **`ContentSource` contract** on `slotUtils` per architecture §5.3, with `mode` / `entityType` / `pickedIds` / `limit` / `filters` / `sort` / `fallback` / `emptyBehavior`.
2. **Backward compatibility** — absent `props.source` falls back to today's `featuredIds` + `articleCount` reading, so **no stored layout needs migrating**.
3. **Request-scoped `DeduplicationContext`** threaded through every slot resolution, extended after each slot resolves. Fixes the live homepage defect (one article renders 3×, five others 2×).
4. **Hardcoded filter maps promoted to props** — `SECTION_CATEGORY` and `PRIMARY_SECTIONS[...].categoryKey` become a `select` prop, reusing the existing editor type. This is the only reason category/section/discipline filtering is not admin-controllable.
5. **Sort control** exposed per content block.
6. **Candidate-search parity** — the featured picker applies the same `publicArticleWhere()` predicate as the public query, so an admin cannot pin a record the public query then suppresses.
7. **Content Source panel** in the properties sidebar, leading with a plain-language summary ("Showing the 6 newest Plan & Watch articles"). No raw filter keys in the UI.
8. **Retire `contentSourceEngine.ts`** per D-04, with its four source-text tests.

**Required tests.** Dedup invariant now **passes** (the Stage 03 expected failure flips green) · each mode — auto, picked, mixed — returns the expected set and order · limit clamping · empty state honours `emptyBehavior` · fixture exclusion applies on every path · admin candidate search and public query return the same visibility set · a legacy layout with no `props.source` renders identically to before.

**Acceptance criteria.**
- No entity id appears twice on any resolved page; verified on the live homepage.
- Category, discipline and sort are admin-controllable without a developer.
- Every content query passes through `publicArticleWhere()`.
- Zero importers of `contentSourceEngine` (or it is formally revived with fixture protection).
- No stored layout required migration.

**Risks.** Medium. Dedup changes which articles appear in which slots — intended, but visible, so it needs owner preview before publish. Retiring the engine is irreversible without git history.

**Dependencies.** **D-04 is a hard blocker.** If it is not approved in time, run **Stage 06 first** — it is fully unblocked and has no dependency on this stage.

---

## Stage 06 — Visual Builder Canvas & Responsive Editing

**Scope.** The core product goal: the admin sees the real page, clicks a section, edits it, sees the change.

**Prerequisites.** Stage 04 complete (a visual canvas that visibly ignores edits is worse than a list). **No owner decision required.**

**Affected modules.** `views/admin/AdminPageLayoutEditor.tsx` · `components/blocks/registry.tsx` and the four block component files (`data-slot-id`) · `app/admin/(dashboard)/website/preview/route.ts` (postMessage bridge) · `components/blocks/PageRenderer.tsx` (visibility/order/logging).

**Deliverables.**

1. **`data-slot-id` on every block's outermost element.** One attribute; no layout impact.
2. **Mount the existing preview route as the centre panel.** Reuse — do not build a second renderer. The infrastructure already renders real draft pages for all 15 keys.
3. **postMessage bridge** — iframe → parent on click (`slot:select`), parent → iframe for highlight. **Validate `event.origin`** against the site origin; the highlight applies a CSS class to an element matched by `data-slot-id` and **never sets HTML from message data**.
4. **Device preview** at 1280 / 768 / 390, applied to the iframe container rather than by re-rendering.
5. **Scoped canvas reload** after a successful save, preserving scroll position where possible.
6. **Three-panel desktop layout** per architecture §4.1; **tabbed single-panel below 1280px** per §4.2.
7. **Unified status vocabulary** — Saved · Draft changes · Published · Scheduled — with an unsaved-changes guard.
8. **`PageRenderer` owns visibility filtering and order sorting** (removing four duplicate implementations), **logs** unknown slot types instead of returning `null` silently, and wraps each block in an error boundary.
9. **Honest labelling** for the 9 page keys that do not compose: an explicit banner rather than an implied capability.

**Required tests.** Playwright: select a section in the rendered canvas → the correct block is selected in Properties · edit a prop → the canvas reflects it after save · each device width renders · a mobile-only layout difference is observable · **first responsive coverage in the project** (currently zero). Unit: `PageRenderer` filters hidden slots, sorts by order, logs unknown types, and isolates a throwing block.

**Acceptance criteria.**
- The canvas renders the actual page, not a list.
- Click-to-select maps correctly for every block on the homepage and all five section landings.
- Three device widths work; `postMessage` rejects foreign origins.
- No second renderer exists.

**Risks.** Medium. Iframe + draft cookie + `sandbox` interaction needs review against existing XSS hardening, especially since prop sanitisation is only hardened in Stage 04. Scroll preservation across reloads is fiddly and should degrade gracefully rather than block the stage.

**Dependencies.** Stage 04. **Can run before Stage 05** if D-04 is delayed.

---

## Stage 07 — Full Page Template Integration

**Scope.** Resolve detail and directory page families. The shape of this stage depends entirely on decision D-02.

**Prerequisites.** Stage 06 complete. **Decisions D-02 and D-03** — hard blockers.

**Affected modules.** `lib/cms/detailTemplateData.ts` · `lib/cms/directoryData.ts` · `views/{ArticleAppendageSlots,DirectorySlots}.tsx` · the six entity route files · `lib/cms/sectionRegistry.ts` · `components/blocks/{DetailBlocks,DirectoryBlocks}.tsx`.

**Deliverables under recommendation B (honest appendage).**

1. Delete the three inert detail markers after confirming no stored layout uses them.
2. Pass `detail-related.title` through the resolver.
3. Add a small set of approved tail block types (rich text, CTA, FAQ) usable below entity content.
4. Register real renderers for `directory-hero` and `directory-grid`; stop reading hero values manually in each route.
5. Promote the hardcoded `RodeoDirectory` headings ("Rodeo Hubs", "Recurring Events") to props.
6. Honest Builder labelling per family.
7. Optionally convert `PageRenderer` to a server component by lifting `useRouter` to `<Link>` — deferred here deliberately so it does not entangle with Stage 06's canvas work.

**If D-02 selects option A (fully composable), this stage expands substantially** — six public page families change at once and the work must be staged per family with separate acceptance per family. Scope and duration would need re-estimating before commitment.

**Required tests.** Per page key: every offered block can be added, published and observed in output, or is not offered · entity body content remains template-controlled under option B · directory hero and grid props reach output · no stored layout broke.

**Acceptance criteria.** Zero block types offered on a family that cannot render there. Every directory prop consumed. Builder page labels match actual capability.

**Risks.** **High under option A** (six families simultaneously). **Low-to-medium under B.** Either way, deleting block types requires the stored-layout check from Stage 04.

**Dependencies.** D-02 is the largest open decision in the programme and should be resolved as early as possible — ideally before Stage 05 begins, so Stage 07 can be scoped accurately.

---

## Stage 08 — Publishing, Revisions & Global Controls

**Scope.** Make publishing predictable, fix concurrency, scope cache invalidation, resolve duplicate ownership.

**Prerequisites.** Stage 07 complete. **Decisions D-05, D-06, D-07, D-12.** D-08 needs no approval.

**Affected modules.** `lib/cms/pageLayoutService.ts` · `app/admin/page-layout-actions.ts` · `lib/cms/{siteConfigService,navigationService,sectionConfigService}.ts` · `components/SiteFooter.tsx` · `lib/cms/scheduledPublishRunner.ts` · `instrumentation.ts` · `views/admin/*`.

**Deliverables.**

1. **Optimistic concurrency** — `saveDraft` and `publishLayout` accept `expectedVersion`; the write becomes a guarded `updateMany`; a zero-row result returns a typed conflict surfaced as "This page changed since you opened it" with Reload / Overwrite. **Never a silent overwrite.**
2. **Fix the revision-number race** — `nextRevisionNo()` is currently `await`ed while building the `$transaction` array, so the read happens outside the transaction. Move inside an interactive transaction or use a sequence.
3. **Scoped cache invalidation** (D-08) — draft save refreshes the admin route and canvas only; publish invalidates a `pageKey → paths` map. **This is the Stage 01 follow-up FU-1.**
4. **Three publishing tiers** labelled in the UI (Composed / Configured / Live), with an explicit "Changes go live immediately" notice on Live-tier editors.
5. **Promote Navigation and `SectionConfig` to the Configured tier** — the largest single reduction in accidental-live-change risk.
6. **Resolve footer ownership** (D-05) **with migration** of existing `NavigationItem` footer rows — not silent deprecation.
7. **Appearance** (D-06) — rename now; migrate the 21 `introBanner*` fields into `editorial-hero` props if retirement is approved.
8. **Revision retention** (D-07) — prune on publish, logging what was removed. Irreversible on first run.
9. **Scheduler** (D-12) — external cron against an authenticated route; revalidation targets the public base URL rather than `localhost`.

**Required tests.** Concurrent saves with a stale version → conflict, not overwrite · concurrent publishes → consecutive revision numbers, no constraint error · **the five cache checks from architecture §6.4**, using `scripts/cache-invalidation.mts` wired in at Stage 03 · footer migration preserves every configured link · retention keeps exactly N and prunes the rest.

**Acceptance criteria.**
- A draft save does **not** invalidate `/`; a `homepage` publish does; a `template:venue` publish does not.
- Two admins cannot silently overwrite each other.
- Every admin editor states whether its changes are live or drafted.
- No configured footer link lost in migration.

**Risks.** Medium-high. Cache scoping can under-invalidate, leaving stale public pages — the five behavioural checks are the guard. Retention deletes data. Footer migration touches live navigation.

**Dependencies.** The cache harness must exist from Stage 03.

---

## Stage 09 — SEO Intelligence & Legal Content Integration

**Scope.** Close SEO integration gaps and make legal-page editing safe. **Preserve the existing engine — extend, never fork.**

**Prerequisites.** Stage 08 complete. **Decisions D-09 (publication), D-10, D-13, D-14.** Migrations S-1, S-2, S-3 each separately approved.

**Affected modules.** `lib/seo.tsx` · `lib/seo/{sitemapEntries,policy,robots}.ts` · `lib/cms/{entitySeoService,infoPageService}.ts` · `app/(public)/page.tsx` · both directory routes · the three coverage routes · `views/LegalPageView.tsx` · `config/legalPages.ts` · `prisma/schema.prisma` · `app/admin/(dashboard)/website/preview/route.ts`.

**Deliverables — engineering (no content decisions).**

1. **`HOMEPAGE` landing-entity type** (migration S-2); homepage metadata routed through `mergeSeoMeta`.
2. **Sitewide `Organization` / `WebSite` JSON-LD** (D-14) — the homepage currently emits **zero** JSON-LD. Requires owner-supplied publisher facts.
3. **Directory and coverage-page SEO** through EntitySeo (5 route families currently hardcoded).
4. **`/info/<slug>/` in the sitemap** — iterate published `InfoPage` rows instead of the static legal config. Pages are currently indexable but unlisted.
5. **`InfoPage` canonical / ogImage / robots columns** (migration S-3).
6. **`InfoPage` draft-alongside-published** (migration S-1) + **preview** — fixes the defect where editing a live legal page reverts the public page to hardcoded text or 404s.
7. **Separate the review banner from the robots flag** — the banner becomes staff-only; indexing stays off until D-13.
8. **Media `altText` into OG/Twitter**; absolute `url` in competitor/venue JSON-LD; venue social-image fallback.
9. **`X-Robots-Tag: noindex` on preview responses.**
10. **`ArticleSeo.structuredDataType`** — consume or drop (D-10).
11. **Effective-indexability chip** in Landing SEO showing `effectiveRobots`, not just the editor flag.
12. **Snippet and social-card preview** extended to the Builder SEO tab.

**Owner/legal, not engineering.** Approving the prose of the seven legal pages, and the act of making each indexable (D-13). **No legal content is fabricated. No draft legal page is made indexable automatically.**

**Required tests.** Per family: an `EntitySeo` override reaches `generateMetadata` output · sitemap/robots consistency — no URL simultaneously indexable and absent from the sitemap · homepage emits `Organization` + `WebSite` · editing a published info page leaves the public page serving published content until republished · preview responses carry the noindex header.

**Acceptance criteria.** No page family with hardcoded metadata except `/search/` (intentional). Every indexable URL is in the sitemap. Editing a live legal page never degrades it. Indexing state of the seven legal pages changes **only** by explicit owner action.

**Risks.** Three migrations, one on live content (S-1). Legal indexing is a governance risk, not a code risk — it must not be bundled into an engineering PR.

---

## Stage 10 — Complete QA & Production Readiness Verification

**Scope.** Prove the whole system end to end. No new features.

**Prerequisites.** Stages 03–09 complete.

**Deliverables.**

1. **Full causation sweep** — all ten paths from architecture §8.2, every page family, every block.
2. **Mutation-testing pass** over every invariant added in Stages 03–09; each must demonstrably fail when broken.
3. **Execute everything deferred**: Playwright (9 specs + new canvas specs), `test:routes`, `test:cache`, `test:migration`, production build. Each either passes or is explicitly reported blocked with its reason — **never silently skipped**.
4. **Responsive and accessibility verification** across device widths, public and admin.
5. **Security re-verification** — Stage 01's fail-closed endpoint still fail-closed; draft isolation across all 15 keys; RBAC default-deny; prop validation.
6. **Performance check** — cache invalidation scope, revision table growth, unbounded-query regressions.
7. **Production readiness checklist** — `INTERNAL_REVALIDATE_SECRET` configured; scheduler target correct for the chosen platform; `robots.txt` and sitemap correct for the production domain; no fixture leakage.
8. **Final traceability matrix** — owner requirements A–H plus every approved decision, with evidence per row.

**Acceptance criteria.** Every causation path proven by an executed test. No test category reported as passing without execution. Zero inert properties. Zero page keys offering blocks they cannot render. All owner decisions either implemented or explicitly recorded as deferred.

**Risks.** This is where deferred environmental work concentrates — Playwright and the `scripts/*.mts` harnesses have never run in this programme. **Mitigation: wire them into CI at Stage 03**, so by Stage 10 they are routine rather than a first attempt.

---

## 2. Cross-cutting requirements

| Requirement | Applies | Rationale |
|---|---|---|
| Mutation-test every new invariant | 03–10 | A suite that cannot fail proves nothing |
| No source-text assertion for a behavioural claim | 03–10 | The Task 4 false-pass mechanism |
| Query stored layouts before wiring or removing a prop | 04, 05, 07 | Changes live pages for owners with saved values |
| Each migration separately approved, never bundled | 08, 09 | S-1 touches live content; S-4 deletes history |
| Public-HTML diff reviewed before merging any rendering change | 04–09 | The only reliable regression check for a content site |
| Preserve: SEO core, publishing service, draft isolation, RBAC, audit logging, fixture policy, test-DB guard, preview iframe | all | Verified working; reuse rather than rebuild |

## 3. Contingency

Stages 11–12 are **capacity only**, not planned work. Most likely consumers: D-02 resolving to option A (fully composable detail pages, six families); theming if D-06(c) is approved; or platform migration work from D-12.

**Stage 13 is prohibited.** If scope exceeds Stage 12, the correct response is to re-scope within the existing stages or formally defer, not to extend the programme.
