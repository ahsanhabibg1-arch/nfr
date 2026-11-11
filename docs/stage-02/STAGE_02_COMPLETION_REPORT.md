# NFRGuide.com — Stage 02 Completion Report
## Hybrid Website Builder Requirements, Architecture & Implementation Blueprint

**Stage:** 02 of 10 (absolute maximum 12) · **Date:** 2026-11-09
**Mode:** design, specification and planning — **not** feature implementation
**Written for:** the project owner and the independent reviewer authorizing Stage 03

### Evidence convention

**[RE-VERIFIED]** — a prior audit claim, independently re-derived from source in this stage. **[SOURCE]** — read at the cited `path:line`. **[RUNTIME]** — observed over HTTP. **[STALE]** — a historical claim no longer true at HEAD. **[NOT EXECUTED]** / **[UNVERIFIED]** — not done, with the reason stated.

---

## A. Executive Summary

**Status: COMPLETE.**

Stage 02 inspected the actual implementation, reconciled the historical plans against current code, specified the proposed Controlled Hybrid architecture, and prepared the Stage 03–10 sequence. **No application code, database or Git state was changed.**

### What was accomplished

1. **Baseline verified and Stage 01 confirmed intact** — branch, HEAD, working tree, and all four Stage 01 artefacts still present.
2. **The audit's counts were re-derived, not inherited.** Every block/registry figure was recomputed by parsing the registry and renderer. All reproduced exactly, with one omission corrected and one finding downgraded.
3. **Three historical blueprint claims found [STALE]** — the platform is in better shape than the planning document describes.
4. **The Controlled Hybrid model fully specified** — three ownership domains, a non-duplication rule, and the four places the boundary is currently violated.
5. **A concrete three-panel admin UI specification**, including sub-1280px behaviour, built on the existing preview iframe and the established NFRGuide design tokens. No new brand theme.
6. **Complete block and page inventories** — 27 unique block types with property-to-renderer mapping; all 15 Builder page keys plus every public route.
7. **A content-source contract** that is backward compatible with every stored layout.
8. **A publishing model** reducing four inconsistent lifecycles to three labelled tiers, plus a scoped cache model answering the Stage 01 follow-up.
9. **SEO and legal boundaries made explicit**, separating engineering fixes from owner/legal decisions.
10. **A behavioural QA architecture** covering the ten required causation paths, with mutation testing as a standing rule.
11. **15 decisions registered; 13 require owner approval; 1 is a blocker.** Nothing was silently approved.

### The three findings that most change the plan

**1. The Builder is one architectural step from its goal, not four.** A central `PageRenderer` already exists and is used by all four page families; the blueprint's "four copied slot helpers" and "homepage-only `renderPremiumBlock`" are **gone** — zero matches repo-wide **[RE-VERIFIED]**. Further, the audit's "two incompatible block prop contracts" overstates the problem: the interface is **already uniform** (`BlockProps { slot, data }`, `components/blocks/blockProps.ts:3-6`) and every block receives both; only *consumption* diverges. **Unification needs no interface change.** Stages 04 and 06 are therefore cheaper than planned.

**2. Verification capability is the real prerequisite.** The suite re-ran green in Stage 01 — 78 files, 1549 tests, 0 failures, `tsc` clean — while ten properties were inert, `helpText` never reached the DOM, and the live homepage rendered one article three times. Roughly **93% of substring assertions target source text**, and **no test proves an admin edit reaches public HTML**. The November 7 audit placed its contract test in a later phase; **this roadmap moves it to Stage 03**, because until it exists the suite cannot distinguish a fix from a no-op.

**3. "Hybrid Management (Option C)" does not exist in the repository.** A content search across all 274 markdown files finds no match for "Hybrid Management", no enumeration of three options, and no definition of Option C. The architecture document's §2 is therefore offered as a good-faith reconstruction from the directive's own description, to be **ratified or corrected** — not as a restatement of something known. **This is decision D-15 and the one blocker.**

### Remaining blockers

**One: D-15.** The Option C definition. Everything else is a normal approval gate.

---

## B. Repository Baseline

[EXECUTED] `git rev-parse`, `git log -1`, `git status --porcelain`, `git diff --name-only HEAD`

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD at stage start and end | `fd4fb1008e28cd99fa578a154d28f79318421d3c` — **unchanged; no commit created** |
| HEAD subject | `feat: CMS Block Management — Phases C-G + Tasks 1-4` |
| Modified tracked files | **3** — all from Stage 01: `.env.example`, `app/api/internal/revalidate/route.ts`, `lib/cms/scheduledPublishRunner.ts` |
| Untracked | `STAGE_01_COMPLETION_REPORT.md` · `apps/web/tests/stage01-revalidate-security.test.ts` · 2 audit documents in `docs/` · `docs/stage-02/` (this stage's deliverables) |

**Stage 01 changes confirmed still present** [SOURCE]:

| Artefact | Status |
|---|---|
| `not_configured` fail-closed branch in the route | PRESENT |
| `timingSafeEqual` constant-time comparison | PRESENT |
| `ALLOWED_PATHS` target allowlist | PRESENT |
| Runner skip-guard when the secret is unset | PRESENT |
| `tests/stage01-revalidate-security.test.ts` (21 tests) | PRESENT |
| Forbidden literal `__scheduled_publish_revalidate__` in `app/` or `lib/` | **ABSENT** (correct) |

**All pre-existing work preserved.** Nothing reset, checked out, stashed or discarded. No branch switch.

### Documents read

| Document | Status |
|---|---|
| `STAGE_01_COMPLETION_REPORT.md` | read |
| `docs/NFRGUIDE-SITE-BUILDER-DEEP-ARCHITECTURE-AND-GAP-AUDIT.md` | read |
| `docs/NFRGUIDE-FULL-ADMIN-CONTROL-AUDIT.md` | read |
| `docs/NFRGUIDE-WEBSITE-EXPERIENCE-ARCHITECTURE-BLUEPRINT.md` | read — declares itself *"PLANNING ONLY — awaiting owner approval"* on a baseline 4 commits behind HEAD |
| `docs/NFRGUIDE-SITE-BUILDER-COMPREHENSIVE-AUDIT.md` | read — source of owner requirements A–H and findings F1–F11 |
| `docs/NFRGUIDE-SEO-ENGINE-COMPREHENSIVE-AUDIT.md` | read |
| **NFRGuide Developer Master Requirements v2.0** | **UNAVAILABLE** — exists only as a banner line in 7 repo-root files; the document itself is absent. Contents **not** invented |
| **2nd Development Master Handover & Continuation Prompt** | **UNAVAILABLE** — no content match |
| **Client Control Gap Audit** | **UNAVAILABLE** — no content match |

Per the directive, unavailable documents are recorded as unavailable. The best available requirement baseline remains **owner requirements A–H**.

---

## C. Investigations Performed and Findings

### C-1 Counts re-derived, not trusted

A script parsed `lib/cms/sectionRegistry.ts` and `components/blocks/registry.tsx` independently of the audit **[RE-VERIFIED]**:

| Measure | Audit | Stage 02 | Verdict |
|---|---|---|---|
| Declared definitions | 29 | **29** | confirmed |
| Unique declared types | 27 | **27** | confirmed |
| Duplicate definitions | 2 | **2** (`rich-text-block`, `cta-banner`) | confirmed |
| Renderer entries | 23 | **23** | confirmed |
| Declared without renderer | 6 | **6** | confirmed — **the audit's prose enumerated only 5**, omitting `landing-stat-pills` |
| Rendered but undeclared | 2 | **2** (`landing-empty`, `landing-competition-disciplines`) | confirmed |
| `KNOWN_PAGE_KEYS` | 15 | **15** | confirmed |
| Arithmetic | — | 27 − 6 + 2 = 23 ✓ | internally consistent |

Ten inert properties re-verified individually, including the three on types that *do* have renderers. `landing-hero.heroImageUrl` re-confirmed **structurally unconsumable** — `SectionLandingHeroProps` has no image field **[SOURCE]** `components/editorial/SectionLandingHero.tsx:4-12`. (The audit cited this file without its directory; the correct path is recorded here.)

**No audit block-level finding was found stale.** One was incomplete (the enumeration of six). One was **downgraded** — the prop-contract problem is smaller than described (§C-3).

### C-2 Content source engine — still dead, re-confirmed

**[RE-VERIFIED]** `lib/cms/contentSourceEngine.ts` has **zero importers**. Its only repository reference is a source-text assertion at `tests/batch33-unit.test.ts:12`. `sourceMode` — the prop its entry point requires — appears **zero** times in `sectionRegistry.ts`, so it remains **unreachable by construction**. It also omits the fixture-exclusion filter the live path applies at 24 call sites, so integrating it unchanged would **regress** a working protection.

### C-3 Three stale blueprint claims, and one downgrade

| Claim | Verdict |
|---|---|
| "four copied `getSlot`/`slotProp` helpers" must be replaced | **[STALE]** — zero matches repo-wide |
| "homepage-only `renderPremiumBlock`" must be replaced | **[STALE]** — zero matches repo-wide |
| No central renderer exists | **[STALE]** — `components/blocks/PageRenderer.tsx:12`, used by all four families |
| Audit: "two incompatible block prop contracts" | **DOWNGRADED** — the `BlockProps { slot, data }` interface is already uniform; only consumption diverges. No interface change needed |

### C-4 Live defects carried into the plan

Three defects confirmed in public output remain unfixed because fixing them is out of Stage 02 scope:

1. **[RUNTIME]** The homepage renders one article **3×** and five others **2×** — the `shownInHero` exclusion reaches one slot and is never extended. Assigned to **Stage 05**, with a Stage 03 test that is expected to fail on first run.
2. **[RUNTIME]** All seven legal pages serve `noindex, nofollow` **and** show a visitor-facing draft banner. Split between **Stage 09** (engineering) and **D-13** (owner/legal).
3. Editing a published `InfoPage` reverts the public page to hardcoded text or 404s. Assigned to **Stage 09**, migration S-1.

### C-5 Four publishing models, not three

The audit reported three. **[SOURCE]** There are four: draft→publish (`PageLayout`, `SiteConfig`); live-on-save (`NavigationItem`, `Announcement`, `GlobalBlock`, **and `SectionConfig`**); a status machine with no draft/published coexistence (`InfoPage`); and direct write (`EntitySeo`, `ArticleSeo`). `SectionConfig` was the omission. Nothing in the UI explains the difference — **this, not any single missing feature, is the main predictability problem.**

---

## D. Deliverables Created

All under `docs/stage-02/`, per the directive's instruction to place Stage 02 planning deliverables in an appropriate documentation directory. Existing files preserved.

| Document | Path | Lines | Contents |
|---|---|---|---|
| **A.** Completion report | `docs/stage-02/STAGE_02_COMPLETION_REPORT.md` | this file | baseline, investigations, findings, limitations, acceptance, verdict |
| **B.** Architecture | `docs/stage-02/STAGE_02_HYBRID_BUILDER_ARCHITECTURE.md` | 439 | hybrid boundary, rendering architecture, admin UI spec, content contract, publishing model, SEO/legal boundaries, QA architecture, schema impact |
| **C.** Coverage | `docs/stage-02/STAGE_02_BLOCK_AND_PAGE_COVERAGE.md` | 229 | re-derived counts, 27-block inventory with property-to-renderer mapping, page-family matrix, the eight findings re-checked, required tests |
| **D.** Decisions | `docs/stage-02/STAGE_02_DECISION_REGISTER.md` | 298 | 15 decisions with current state, options, recommendation, rationale, migration impact, approval flag |
| **E.** Roadmap | `docs/stage-02/STAGE_02_IMPLEMENTATION_ROADMAP.md` | 320 | Stages 03–10 with scope, prerequisites, modules, tests, acceptance, risks, dependencies |

---

## E. Limitations

Stated plainly rather than implied.

1. **No stored-layout inspection.** `PageLayout.draftSections` / `publishedSections` were **not** read. The directive permits database inspection only against an independently verified non-production database, and Stage 02 was scoped read-only on code. **This is a Stage 04 prerequisite**, because wiring a previously-inert property changes a live page for any owner who already saved a value.
2. **No browser verification.** No admin credentials were available, so the Builder UI was assessed from source. The non-visual canvas finding is unambiguous in source and matches an owner-supplied screenshot, but was not observed in a browser.
3. **No tests were executed in Stage 02.** The figures quoted (78 files / 1549 tests / 0 failures, `tsc` clean) are **Stage 01's executed results**, labelled as such throughout. Stage 02 ran no verification commands because it changed no code.
4. **Playwright, production build and `scripts/*.mts` remain [NOT EXECUTED]** — unchanged from Stage 01. Wiring them into CI is a Stage 03 deliverable.
5. **`maxInstances` values per duplicate definition** were not individually transcribed; only the divergence and first-wins resolution were verified.
6. **`seo-intel/rules.ts` threshold alignment** with `lib/seo/policy.ts` remains **[UNVERIFIED]**, carried forward from the deep audit.
7. **The UI specification is not a visual design.** It defines layout, panels, interaction flow and states in text and ASCII. No mockups or component code were produced.

---

## F. Database, Environment & Git Safety

| Restriction | Status |
|---|---|
| No application code modified | **CONFIRMED** — `git diff --name-only HEAD` shows only the 3 Stage 01 files |
| No database migrations created | **CONFIRMED** — `prisma/migrations/` unchanged at 19 |
| No production or test data mutated | **CONFIRMED** — no database connection opened in this stage |
| No deployment | **CONFIRMED** |
| No commit | **CONFIRMED** — HEAD identical at start and end |
| No push | **CONFIRMED** |
| No branch switch | **CONFIRMED** — still `office-sync-2026-11-08` |
| No existing changes reset or discarded | **CONFIRMED** — all Stage 01 artefacts and both audits intact |
| No secrets or `.env` values revealed | **CONFIRMED** — `.env` not read in this stage |
| No Docker introduced | **CONFIRMED** |
| Stage 03 not started | **CONFIRMED** |

**Carried forward from Stage 01:** `INTERNAL_REVALIDATE_SECRET` is still unconfigured. The endpoint correctly fails closed, so **scheduled-publish cache revalidation will skip with a warning until it is set.** Publishing itself still executes.

---

## G. Acceptance Criteria Matrix

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Current architecture inspected and documented | **PASS** | §B, §C; architecture doc §3–4 |
| 2 | Historical audit findings reconciled with current code | **PASS** | §C-1 to §C-5 — counts re-derived, 3 blueprint claims marked stale, 1 audit finding downgraded, 1 enumeration corrected |
| 3 | Proposed Hybrid Builder model fully specified | **PASS** | architecture §2 — three domains, non-duplication rule, 4 boundary violations. Offered for ratification (D-15) |
| 4 | Admin UI interaction and canvas behaviour defined | **PASS** | architecture §4 — three-panel spec, sub-1280px tabbed fallback, postMessage bridge, device widths, error/empty/loading states |
| 5 | Block and page coverage inventories complete | **PASS** | coverage doc — 27 types, all 15 keys, every public route |
| 6 | Content sourcing and publishing architecture defined | **PASS** | architecture §5–6 — `ContentSource` contract with backward compatibility; three publishing tiers; scoped cache model |
| 7 | SEO and legal-content boundaries explicit | **PASS** | architecture §7 — precedence model, 13 engineering gaps, 3 legal rules, engineering/owner split |
| 8 | Behavioural QA strategy actionable | **PASS** | architecture §8 — ten causation paths mapped to stages; mutation-testing rule; prohibited-proof rule |
| 9 | Owner decisions separated from engineering recommendations | **PASS** | decision register — 15 decisions, 13 flagged YES, 2 flagged NO as engineering |
| 10 | Stage 03–10 plan ready for review | **PASS** | roadmap — per-stage scope, prerequisites, modules, tests, acceptance, risks; ordering conflicts resolved |
| 11 | No application, database, deployment or Git changes | **PASS** | §F |

**11 of 11 PASS.** Criterion 3 passes as a *specification*; its ratification is D-15.

---

## H. Owner Decisions Required

Full detail in the decision register. Ordered by urgency.

| Priority | ID | Decision | Recommendation | Blocks |
|---|---|---|---|---|
| **1 — BLOCKER** | D-15 | Define or ratify "Hybrid Management (Option C)" | Confirm architecture §2 | all stages |
| **2** | D-02 | Shared detail templates vs fully composable detail pages | **Option B** — honest appendage | Stage 07; needs the longest lead time |
| **3** | D-04 | Content source engine: retire or integrate | **Retire**; promote `slotUtils` | Stage 05 |
| **4** | D-13 | Legal content approval and indexing | Owner/legal sign-off | Stage 09 |
| **5** | D-01 | Ratify the hybrid boundary | Adopt as specified | Stage 04 onward |
| 6 | D-11 | Newsletter block | Remove until a backend exists | Stage 04 |
| 7 | D-05 | Footer ownership | `SiteConfig` wins; migrate nav rows | Stage 08 |
| 8 | D-06 | Appearance controls | Rename now; defer theming | Stage 08 |
| 9 | D-07 | Revision retention | Keep 50 per page key | Stage 08 |
| 10 | D-03 | Template vs entity overrides | Template-level layout | Stage 07 |
| 11 | D-12 | Scheduler and deployment | External cron; await hosting | Stage 08 |
| 12 | D-14 | Sitewide `Organization`/`WebSite` JSON-LD | Add it; owner supplies publisher facts | Stage 09 |
| 13 | D-10 | `ArticleSeo.structuredDataType` | Consume or drop | Stage 09 |

**D-08** (cache scoping) and the property-validation half of **D-10** need **no approval** — both are engineering corrections within approved scope.

### Stage 03 readiness

**Stage 03 is fully unblocked and can begin immediately on authorization.** It depends on no owner decision, changes no product behaviour, and requires no migration. **Stage 06 is also fully unblocked**, which is the planned fallback if D-04 delays Stage 05.

---

## I. Final Verdict

**STAGE 02: COMPLETE**

The architecture is specified, the inventories are complete, and the Stage 03–10 plan is ready for review. Every count was re-derived rather than inherited; three historical blueprint claims were found stale and one audit finding was downgraded, which makes the remaining work smaller than previously reported. Thirteen decisions are recorded as requiring owner approval and none was silently adopted.

**A complete architecture proposal is not owner approval.** One blocker stands — the definition of "Hybrid Management (Option C)", which exists nowhere in the repository and which this stage declined to invent.

No application code, database, deployment or Git state was changed. HEAD is unchanged, no commit was created, and all pre-existing work is preserved.

**Stage 03 has not been started.** Awaiting independent review and explicit authorization.
