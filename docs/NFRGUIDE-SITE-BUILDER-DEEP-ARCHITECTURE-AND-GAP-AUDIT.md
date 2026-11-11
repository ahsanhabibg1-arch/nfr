# NFRGuide.com — Deep Website Builder, CMS & SEO Architecture Audit

**Audit type:** READ-ONLY deep architecture audit. No application code, database records, configuration, migrations or Git state were changed. No commit was created.
**Audit date:** 2026-11-09
**Branch:** `office-sync-2026-11-08`
**HEAD:** `fd4fb1008e28cd99fa578a154d28f79318421d3c` (`fd4fb10`)
**Working tree:** clean (0 modified tracked files)
**Written for:** the project owner and a new development agent, as input to a separate implementation plan.

---

## Evidence provenance convention

Every claim carries its provenance. This matters because the central failure this audit documents is evidence of the wrong kind being accepted as proof.

- **[RUNTIME]** — observed by running the application and inspecting real HTTP responses or rendered HTML.
- **[EXECUTED]** — a command was actually run in this audit; the result is reported as returned.
- **[SOURCE]** — established by reading the file at HEAD `fd4fb10`, cited `path:line`.
- **[DOC]** — stated by a repository document, cited `path:line`. A document's claim about the code is **not** evidence about the code.
- **[HISTORICAL]** — a prior audit's claim, re-verified here; the current verdict is always stated.
- **[UNVERIFIED]** — not established. Reported as unknown, never inferred.

No finding in this report is described as runtime-verified unless it carries [RUNTIME] or [EXECUTED]. Paths are relative to `apps/web/` unless prefixed `docs/` or marked repo-root.

---

## 1. Executive Summary

The existing architecture **can** deliver the owner's vision, and should not be replaced. But the gap between what the system appears to offer and what it actually does is wider than any previous report has stated, and the mechanism that let that gap open is still fully operational.

**The central structural finding.** The Builder's canvas is a text list of block names, not a rendered page. `views/admin/AdminPageLayoutEditor.tsx` never imports the block registry, contains no iframe, and labels its own left panel `{/* ── Left: Canvas (block list) ── */}` (`:660`) [SOURCE]. Block *management* — add, remove, reorder, duplicate, hide, drag-and-drop — is complete and good. Visual website *building* is not implemented. Every previous report conflated the two.

**The central methodological finding.** The test suite re-ran green in this audit: **1528 tests across 77 files, 0 failures, 0 skipped, 116.94s**, and `tsc --noEmit` returned 0 errors [EXECUTED]. That number is not evidence of a working Builder. **Of roughly 1348 substring assertions in the suite, about 1259 (≈93%) are made against source *text* rather than behaviour** — a file is read as a string and asserted to contain a symbol. All 13 Builder/CMS batch test files use this method and together hold **611 of 1528 tests (40%)** [SOURCE]. **No test in the suite proves that a property edited in Admin reaches public HTML.** Not one. This is why ~10 inert properties and a never-rendered `helpText` shipped behind a green suite — and the November 7 audit predicted exactly this (its finding F11), recommended the fix (its recommendation #2), and the fix was never implemented.

**Three defects are confirmed live in public output** [RUNTIME]:

1. **Homepage content duplication.** One article renders three times and five others twice on the live homepage. Root cause: the `shownInHero` exclusion list is passed only to `latest-coverage` (`lib/cms/homepageData.ts:103`) and never to the category slots (`:106`, `:108`), and is never extended past the hero (`:92`).
2. **All seven legal pages serve `noindex, nofollow` and display a visitor-facing amber "Draft — pending owner and legal review" banner.** Verified on `/about/` and `/terms/`.
3. **An unauthenticated caller can flush the entire public cache.** `/api/internal/revalidate` falls back to the literal secret `'__scheduled_publish_revalidate__'` (`app/api/internal/revalidate/route.ts:7`); `INTERNAL_REVALIDATE_SECRET` is absent from `.env` *and* `.env.example`, so the fallback is active, and the repository is public on GitHub. Confirmed exploitable: that constant returns `{"ok":true,"revalidated":"/"}`; a wrong secret returns 403.

**The Content Source Engine is 100% dead code.** `lib/cms/contentSourceEngine.ts` is 402 lines with **zero importers**. It is unreachable by construction: `parseContentSource` returns `null` unless `props.sourceMode` is set (`:374-375`), and `sourceMode` does not exist anywhere in the registry or repository. Its only external reference is a source-text assertion in `tests/batch33-unit.test.ts:12-15` [SOURCE]. It is simultaneously the documented centrepiece of the intended architecture and entirely inert — and every new resolver added since (Phases B–E) re-implements fetching inline, widening the divergence it was built to prevent.

**A critical baseline caveat.** The Website Experience Architecture Blueprint — the document that defines the target architecture — declares itself **"PLANNING ONLY — awaiting owner approval. Nothing in this document has been implemented."** (`docs/NFRGUIDE-WEBSITE-EXPERIENCE-ARCHITECTURE-BLUEPRINT.md:6`) [DOC]. Its code baseline is `main @ feb4711`, four commits behind HEAD. Consequently, most of what it describes is **unapproved design, not unmet obligation**, and several items a naive reading would score as gaps are documented deliberate deferrals (newsletter backend, site-wide appearance tokens, scheduled publishing, homepage `Organization` JSON-LD, revision retention). Scoring those as failures would misrepresent the project.

**Three named authoritative documents do not exist in the repository**: Developer Master Requirements v2.0 (referenced only as a banner line in seven files), the 2nd Development Master Handover, and the Client Control Gap Audit. **"Hybrid Management (Option C)" is undocumented** — no content match anywhere across 274 markdown files, and no enumeration of three management options. That decision is external to the repository and is a **blocker** for any assessment of whether the implementation matches the selected model.

**What is genuinely sound and must be preserved:** the SEO core (one metadata builder, one robots model, one canonical normaliser, one shared indexing policy the sitemap re-derives from the same sources the pages render); article SEO end-to-end with a full JSON-LD graph; the PageLayout draft→publish→revision→schedule service; draft isolation, double-gated and verified unbreachable by an anonymous client; comprehensive audit logging across eight Builder actions; block management; the fixture-exclusion policy applied at 24 call sites; the isolated-test-database guard; and RBAC. Notably, the Blueprint's complaint about "four copied `getSlot`/`slotProp` helpers" and a homepage-only `renderPremiumBlock` is **now stale** — both are gone, refactored into a real central `PageRenderer` by Batch A (`c471b22`).

**Verdict.** This is a well-built CMS with a strong data and SEO layer, carrying a Builder that is one architectural step short of its purpose, and a test methodology that cannot detect that shortfall. The corrective path is incremental and requires no rewrite. It must begin with making the test suite capable of proving causation — otherwise every subsequent fix will be reported complete on the same evidence that has already failed twice.

---

## 2. Repository Baseline and Evidence Limitations

### 2.1 Git state [EXECUTED]

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb1008e28cd99fa578a154d28f79318421d3c` |
| HEAD subject | `feat: CMS Block Management — Phases C-G + Tasks 1-4` |
| HEAD author / date | `moynulhasan4044`, Sun Nov 8 17:33:52 2026 +0600 |
| Working tree | **clean** — `git status --porcelain` returned 0 lines |
| Untracked files | none (other than this report) |
| Remote | `https://github.com/ahsanhabibg1-arch/nfr.git` — **public** |

Commit lineage relevant to this audit:

```
fd4fb10  feat: CMS Block Management — Phases C-G + Tasks 1-4     ← HEAD
35eb467  feat: Phase B — Detail Template Renderer
c471b22  feat: Batch A — Shared Page Renderer
ff09c37  Merge 'origin/fix/batch-s-seo-correctness'
7514f67  fix(site-builder): wire Page Builder settings to the public site
27ebab3  fix(seo): Batch S — SEO correctness (S1–S7)
feb4711  feat: Batches 31-33 — Page Builder, Premium Blocks      ← Nov 7 audit baseline
```

### 2.2 Status of the November 7 "uncommitted fixes"

The November 7 audit assessed `main @ feb4711` **plus uncommitted working-tree fixes** (its §1.1). Those fixes are now committed. `7514f67` carries the working-tree set; `c471b22`, `35eb467` and `fd4fb10` then reshaped it [SOURCE].

**No working-tree fix was reverted.** Two were superseded by better architecture (F1 and the slot-helper duplication — see §14). The working tree is now clean, so the question "is the fix still present?" is answered per finding in §14 against committed code, not against a diff.

### 2.3 Versions and structure [SOURCE] `package.json`

`next` 16.4.3 (App Router, Turbopack in dev) · `react` 19.2.0 · `typescript` ^7.0.2 · `prisma` / `@prisma/client` 6.19.3 · `tailwindcss` ^4.3.3 · `vitest` ^3.2.4 · `zod` ^4.6.7.

- **Public site:** `app/(public)/` — 30 `page.tsx`, one shared `layout.tsx`. Outside the group: `app/admin`, `app/api`, `app/go` only; `app/layout.tsx:29` renders bare `{children}`, so **no public page bypasses the shared chrome**.
- **Admin:** 25 `page.tsx` under `app/admin/(dashboard)/`; 25 server-action modules at `app/admin/*-actions.ts`.
- **Services:** `lib/cms/` (41 files), `lib/seo/` (7), `lib/seo-intel/`, `lib/auth/`, `lib/media/`, `lib/monetization/`, `lib/search/`, `lib/analytics/`.
- **Database:** 83 Prisma models; **19 migrations**, latest `20261108130000_phase_c_page_layout_revisions`.
- **Admin navigation:** 18 modules in `CMS_MODULES` (`lib/auth/permissions.ts:20-39`), default-deny via `visibleModuleIds` (`:43`).

### 2.4 Documentation inventory [DOC]

| Named document | Status | Actual artifact |
|---|---|---|
| Developer Master Requirements v2.0 (28 Oct 2026) | **MISSING** | Only a banner line, "Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**", at `ARCHITECTURE.md:3`, `CMS_MODULES.md:3`, `KNOWN_LIMITATIONS.md:3`, `QA_REPORT.md:3`, `README.md:5`, `ROUTES.md:3`, `SEO_ARCHITECTURE.md:3` (all repo-root). The document aligned *to* is absent |
| 2nd Development Master Handover & Continuation Prompt | **MISSING** | no content match |
| Website Experience Architecture Blueprint | **EXISTS** | `docs/NFRGUIDE-WEBSITE-EXPERIENCE-ARCHITECTURE-BLUEPRINT.md` (681 lines, dated 2026-11-07) |
| Site Builder & Website Experience Comprehensive Audit (7 Nov) | **EXISTS** | `docs/NFRGUIDE-SITE-BUILDER-COMPREHENSIVE-AUDIT.md` (506 lines) — holds findings F1–F11 |
| Client Control Gap Audit | **MISSING** | no content match |
| SEO Engine Audit | **EXISTS** | `docs/NFRGUIDE-SEO-ENGINE-COMPREHENSIVE-AUDIT.md` |
| Phase tracker / batch reports | **EXISTS** | `docs/batches/` (25 dirs), `docs/audits/` (3 dirs; the Nov 7 functional audit has 14 files), `PHASE1_BATCH01-12_REPORT.md` at repo root |

### 2.5 Evidence limitations — stated plainly

1. **No browser/UI verification.** No admin credentials were available, so no authenticated session was established. All Builder findings are [SOURCE]. The canvas finding is unambiguous in source and independently matches an owner-supplied screenshot, but it was not observed in a browser by this audit.
2. **Playwright E2E NOT EXECUTED.** `playwright.config.ts:39-40` requires `webServer: npx next start` — a production build, a seeded database and admin-login fixtures; the specs authenticate into `/admin/login/` (`e2e/page-builder.spec.ts:6`) and would mutate admin session state. Outside read-only bounds.
3. **`scripts/*.mts` harnesses NOT EXECUTED** (11 files) — `route-smoke`, `cache-invalidation`, `migration-replay`, `cloud-data-import`, `r2-verify` need a running server, cloud credentials, or migration replay against a database.
4. **Runtime checks used the local development dataset**, which has no competitor or venue detail records. Sitemap coverage for those two families therefore **cannot be distinguished from empty data** and is marked [UNVERIFIED].
5. **The Blueprint's "current state" columns are stale by construction** — its baseline is `feb4711`, four commits behind HEAD. Its assessments were re-verified, not inherited.
6. **"Hybrid Management (Option C)" could not be verified** — undocumented in the repository (§19 Blocker B-1).
7. **One state change was made**: a single cache revalidation against the local dev server, to confirm the security finding in §12. Nothing else was mutated.

### 2.6 The baseline problem, and how this audit resolved it

The directive instructs that the original approved requirements be the functional baseline. **That document is not in the repository.** The only place the repository states owner-level requirements as a closed set is the owner requirements **A–H** at `docs/NFRGUIDE-SITE-BUILDER-COMPREHENSIVE-AUDIT.md:406-417` [DOC].

Everything in the Blueprint is *derived design* carrying `PROPOSED`, `DECISION` or `OPEN` status, on a document that declares itself unapproved (`:6`). This audit therefore scores against **two separate columns** (§15):

- **Owner requirements A–H** — authoritative; scoreable as met or unmet.
- **Blueprint design items** — unapproved; reported as *design status*, never as owner-level failure.

This distinction is not a technicality. Without it, a dozen deliberate deferrals read as defects, and the report would overstate the deficit while obscuring the six findings that genuinely matter.

---

## 3. Original Requirements vs Current Implementation

### 3.1 The intended vision, in the documents' own words [DOC]

`BLUEPRINT:26` — **"Improve the existing Page Builder in place. Do not replace it."** Foundations held sound and retained (`:30-34`): `PageLayout` JSON slots, `sectionRegistry.ts`, `SiteConfig` draft/published, RBAC, `contentSourceEngine.ts`. `:36` — "The work is to **connect** what is disconnected and **remove** what is duplicated."

The five committed decisions (`:40-47`):

1. **One rendering engine** — "A single server-side `PageRenderer` renders any page's slots in slot order through one block registry… This replaces the four copied `getSlot`/`slotProp` helpers and the homepage-only `renderPremiumBlock`."
2. **One content-source layer** — "Every content-driven block declares a `source` config that is resolved by the existing `contentSourceEngine`… becomes the engine's behaviour, not a parallel path."
3. **One owner per public element** — collapsing the hero, section identity and footer-column duplicates.
4. **One publishing lifecycle** — "Draft → Preview → Publish, with revisions, rollback and optimistic concurrency, using the `version` columns that already exist."
5. **A page-oriented admin** — "'Website → Pages → *NFR Plan & Watch*' shows that page's real sections in their real order, where each item's content comes from, and its status… It replaces the current technical tabs."

Rendering invariants (`:402-406`): **R1** unknown slot type skipped *and logged*, never crashes · **R2** "Server-resolved data is the only data a block renders. No block-level `fetch` or `prisma` calls" · **R3** "Every `editableProps` key of every block offered for a family is consumed by that block's component. Enforced by the contract test" · **R4** exactly one `<h1>` per page, from the hero block.

Scope guard (`:659`): "Scope creep into a free-form builder" is an explicit risk, mitigated because "Block families and mandatory blocks are fixed per page; no arbitrary pages." This confirms the directive's "controlled, professional, reusable" framing is the documents' own intent.

### 3.2 The ten architectural questions, answered

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | One central server-side `PageRenderer` | **PARTIAL** | Exists and is central — `components/blocks/PageRenderer.tsx:12`, used by `HomeView.tsx:41`, `SectionLandingSlots.tsx`, `ArticleAppendageSlots.tsx`, `DirectorySlots.tsx`. **But it is `'use client'` (`:1`), not server-side**, and it applies **neither** visibility filtering **nor** order sorting (`:15` maps slots as received) — both live in four separate resolvers. The duplication the Blueprint cited is genuinely gone: `getSlot`, `slotProp` and `renderPremiumBlock` return **zero** matches repo-wide [SOURCE] |
| 2 | One authoritative reusable block registry | **PARTIAL** | `lib/cms/sectionRegistry.ts` declares 29 definitions → **27 unique types**; `components/blocks/registry.tsx:132-160` holds **23** renderers. 6 declared types have no renderer; 2 renderers are undeclared. Two types are **defined twice** with divergent limits [SOURCE] |
| 3 | Page-family and page-template contracts | **PARTIAL** | Four family arrays exist with `required`/`duplicatable`/`maxInstances`. But `required` is **UI-only** — not enforced in `saveDraft`; and `maxInstances` resolves from a first-wins deduped map, so the stricter declared limit is unreachable (§6) [SOURCE] |
| 4 | Reusable visual blocks | **PARTIAL** | `PremiumBlocks` are genuinely shared across families. Detail/directory blocks are not reusable — they read only resolver `data` and ignore `slot.props` entirely (§6.6) [SOURCE] |
| 5 | Dynamic content source resolution | **FAIL** | `contentSourceEngine.ts` has **zero importers** and is unreachable by construction (§7) [SOURCE] |
| 6 | Page-specific layout configuration | **PASS (storage)** / **PARTIAL (effect)** | `PageLayout.draftSections`/`publishedSections` per `pageKey` works. Only **6 of 15** keys compose their page from it [SOURCE] |
| 7 | Template-level config + entity overrides | **PARTIAL** | Template keys are live (F3 fixed), but **tail-append only**, and 3 of 5 declared detail blocks are inert markers. Entity-level overrides exist for SEO/FAQ via `EntitySeo`/`EntityFaq`, not for layout [SOURCE] |
| 8 | Working draft preview | **PASS (data)** / **FAIL (fidelity)** | Draft data and per-template sample URLs are correct across all 15 keys (`preview/route.ts:77-119`); `draft` is threaded through all 11 Builder-backed routes; anonymous draft access is impossible [RUNTIME]. But preview is a separate browser tab, not inline, and has **no viewport control** [SOURCE] |
| 9 | Publishing and revision management | **PASS**, with concurrency gaps | Full publish transaction + revision + schedule + restore-to-draft. **No optimistic locking on the interactive path** and a revision-number race (§12) [SOURCE] |
| 10 | Integrated SEO configuration and rendering | **PARTIAL** | Strong and genuinely centralised for articles and all 8 landing-entity types, verified in live HTML. Homepage, both directories and the three coverage pages are **hardcoded**; homepage emits **zero** JSON-LD [RUNTIME] |

### 3.3 Items explicitly deferred or out of scope — must NOT be counted as gaps [DOC]

| Item | Documented status | Source |
|---|---|---|
| `newsletter-signup` block | **Hidden** until a subscription backend exists | `BLUEPRINT:126` |
| Site-wide appearance tokens (logo, colours) | **"Not now"** — OPEN Q6 | `BLUEPRINT:316, 671` |
| Appearance screen | **Removed** by design | `BLUEPRINT:316, 376` |
| Scheduled publishing for layouts | **Defer until after Batch G** — OPEN Q8 | `BLUEPRINT:673` |
| Homepage `Organization`/`WebSite` JSON-LD | OPEN Q7 — recommended, unapproved | `BLUEPRINT:206, 672` |
| Revision retention count | OPEN Q5 — recommended 50 | `BLUEPRINT:670` |
| `/latest/` evergreen index route | OPEN Q4 | `BLUEPRINT:669` |
| Editor presence indicator | OPEN Q3 | `BLUEPRINT:668` |
| Sub-topic filtering within sections | OPEN Q2 | `BLUEPRINT:667` |
| `website.edit` permission for editors | OPEN Q1 | `BLUEPRINT:666` |
| `venueId` / `relatedEntityId` engine filters | **Remove from type** until used | `BLUEPRINT:347` |
| Arbitrary pages / free-form builder | **Excluded** | `BLUEPRINT:659` |

Two of these warrant comment. **`newsletter-signup` is documented as hidden, yet it renders publicly today** as a non-functional form with a `readOnly` input and a handler-less button (`components/blocks/PremiumBlocks.tsx:110-111`) — the deferral was decided but not enforced, which converts a clean deferral into a live defect (D-12). And **scheduled publishing was deferred as OPEN Q8 but was fully implemented in Phase D** — the project built ahead of an open owner decision, which is worth flagging as a process observation rather than a defect.

### 3.4 Ambiguities in the documented vision [DOC]

- **AMBIGUOUS — detail and directory template coverage.** The Blueprint commits the homepage and five landings "first", with "the article and directory templates follow" (`:40`), and its Pages list defers them as "(later: Article template · Directories)" (`:292`). It states **no target** for rodeo hub/event/edition, discipline, category, competitor or venue detail pages. Scoring those families against the Blueprint would invent a requirement, so §5 reports their state without grading it against an approved target.
- **AMBIGUOUS — `SectionConfig` drafting.** LIFE-01 places "section identity" inside the draft lifecycle (`:625`, `:308`), while §11 declares only one new table and "No changes to existing columns" (`:52`). How `SectionConfig` acquires draft/published state is unspecified.
- **Batch ordering is non-alphabetical** — the Blueprint defines batches in the order 0, A, B, E, F, D, C, G (`:526-608`). Sequence must not be inferred from letter.

---

## 4. Complete Builder Architecture Map

### 4.1 The actual pipeline at HEAD [SOURCE]

```
Admin Editor         views/admin/AdminPageLayoutEditor.tsx
                       canvas = BLOCK LIST (:716-765), no rendered page
                       properties panel = renderPropField (:426-609), 9 types
                              │
Server Action        app/admin/page-layout-actions.ts
                       saveDraftAction (:11) · publishLayoutAction (:16)
                       resetDraftAction (:21) · restoreDefaultsAction (:26)
                       each calls rev() (:9) → revalidatePath('/','layout')
                              │
Validation           lib/cms/pageLayoutService.ts
                       UpdateDraftSchema (zod) · validatePageKey (:113)
                       validateSectionTypes · validateBlockLimits (:57)
                       validateUniqueIds · prop sanitisation (:29-53)
                              │
Persistence          PageLayout.draftSections  (Json)      schema.prisma:1599
                     PageLayout.publishedSections (Json)   schema.prisma:1600
                     PageLayout.scheduledSections (Json?)  schema.prisma:1601
                     PageLayoutRevision.snapshot (Json)    schema.prisma:1619
                              │
Draft/Published      lib/cms/previewGuard.ts:5-9  isStaffDraftPreview()
  selection            = draftMode().isEnabled AND permission 'system.config'
                              │
Content Resolution   FOUR SEPARATE RESOLVERS — no shared entry point
                       homepageData.ts       resolveHomepageSlots
                       sectionLandingData.ts resolveSectionLandingSlots
                       detailTemplateData.ts fetchVisibleSlots + resolveAppendageSlots
                       directoryData.ts      resolveDirectorySlots
                     Each independently filters `visible` and sorts `order`.
                     contentSourceEngine.ts  ← ZERO IMPORTERS (dead)
                              │
Public Renderer      components/blocks/PageRenderer.tsx:12   ('use client')
                       blockRegistry lookup (:16) · unknown type → null (:17, NOT logged)
                       applies NO visibility filter, NO order sort
                              │
Block Components     components/blocks/registry.tsx:132-160  (23 entries)
                       homepage/landing blocks read slot.props
                       detail/directory blocks read resolver data ONLY
                              │
HTML Output          views/HomeView.tsx:41 · SectionLandingSlots.tsx
                     ArticleAppendageSlots.tsx:7 (tail) · DirectorySlots.tsx:6 (CTA only)
                              │
SEO Output           lib/seo.tsx:53  buildMetadata()  — sole Metadata emitter
                     lib/seo/{robots,policy,canonical,sectionMeta,articleMeta}.ts
                     lib/cms/entitySeoService.ts:90  mergeSeoMeta()
                     JsonLd (lib/seo.tsx:283), escaped by serializeJsonLd (:273)
                              │
Cache                page-layout-actions.ts:9  revalidatePath('/','layout')
                       — fires on DRAFT SAVE as well as publish (D-09)
                     app/api/internal/revalidate/route.ts  (D-01: weak secret)
                     lib/cms/scheduledPublishRunner.ts:12-13 → posts to localhost
```

### 4.2 Architectural duplication, resolved and remaining

**Resolved since the Blueprint was written** — its stale complaints, now corrected [SOURCE]:

| Blueprint complaint | Current state |
|---|---|
| "four copied `getSlot`/`slotProp` helpers" | **GONE** — zero matches repo-wide |
| "homepage-only `renderPremiumBlock`" | **GONE** — zero matches repo-wide |
| No central renderer | **EXISTS** — `PageRenderer.tsx:12`, used by all four families |
| `rich-text-block` / `cta-banner` not rendered on landings | **FIXED** — both in the shared registry (`registry.tsx:143`, `:146`) |

**Remaining duplication** [SOURCE]:

| # | Duplication | Location |
|---|---|---|
| 1 | **Four parallel resolvers**, each re-implementing visible-filter + order-sort + prop extraction | `homepageData.ts:67` · `sectionLandingData.ts:25-27` · `detailTemplateData.ts:25-26` · `directoryData.ts:25-27` |
| 2 | **Two incompatible block prop contracts** — `slot.props` vs resolver `data` | `registry.tsx:29-31` vs `DetailBlocks.tsx:16,22`, `DirectoryBlocks.tsx:14` |
| 3 | **Dead engine duplicating live logic** — manual-then-auto, dedup, limits, published filter, empty detection all exist twice | `contentSourceEngine.ts` vs `slotUtils.ts:20-31`, `homepageData.ts:77-92` |
| 4 | **Two block types defined twice** with divergent `maxInstances` | `rich-text-block` `:211`/`:391`; `cta-banner` `:270`/`:408` |
| 5 | **Homepage hero owned twice** — `editorial-hero` slot vs `AppearanceConfig` intro banner (21 `introBanner*` fields) | `sectionRegistry.ts` vs `siteConfigService.ts:77-99` |
| 6 | **Footer columns owned twice** — `SiteConfig.footer.columns` silently *replaces* nav-driven columns | `SiteFooter.tsx:67-74` |
| 7 | **Section identity owned twice** — `SectionConfig` vs `landing-hero` props | `lib/content.ts:271-278` vs `sectionRegistry.ts:343` |

### 4.3 Disconnected and unused functionality [SOURCE]

| Surface | Nature of disconnection |
|---|---|
| `contentSourceEngine.ts` (402 lines) | Zero importers; unreachable by construction (§7) |
| `detail-hero`, `detail-body`, `detail-faq` | Declared block types with no renderer entry; `detail-body` has empty `editableProps` **and** empty `defaultProps` (`:454-455`) |
| `directory-grid` | `required: true` (`:521`) yet has no renderer — cannot be removed and renders nothing |
| `landing-stat-pills.pills[]` | `defaultProps` array (`:382-387`) with no `PropDef`; never read — pills are hardcoded in `LandingHeroBlock` (`LandingBlocks.tsx:41-42`) |
| `SectionConfig.heroImage`, `.visible` | Columns exist (`schema.prisma:1559-1560`); `getSectionMeta` merges only `displayName`/`tagline`/`description` (`lib/content.ts:271-278`) |
| Site Identity (`siteName`, `tagline`) | `settingsService.ts:102`; **zero** public readers repo-wide |
| 3 of 7 global-block placements | `rodeo-hub-top`, `event-detail`, `edition-detail` offered (`globalBlockService.ts:17-19`); `getActiveBlocksForPlacement` is only ever called with the other four |
| 4 of 5 ad `pageScope` values | `monetizationService.ts:347`; `AdPlacementSlot` is mounted once, `pageScope="article"` (`articles/[slug]/page.tsx:62`) |
| `ArticleSeo.structuredDataType` | `schema.prisma:136`; `@type` is derived at `lib/seo.tsx:108`, ignoring the column |
| Media `altText` | `schema.prisma:222,325`; no `alt` key anywhere in `lib/seo.tsx` or `lib/seo/` |
| `richtext` `PropType` | Declared (`:19`); no block uses it; the editor falls through to a plain textarea (`:468`) |
| Preview query params `?_preview=draft&_pk=` | Emitted at `preview/route.ts:64`; **no reader** anywhere in `app`/`lib`/`views`/`components` |

### 4.4 Hidden hard-coded behaviour [SOURCE] / [RUNTIME]

Ranked by visitor visibility. Full register in §12 and the previous audit's §12.

1. **225 lines of legal prose** for 7 live public pages — `config/legalPages.ts`. All entries flagged `review: 'pending-owner-review'` (`:39,65,95,119,143,175,204`) → `noindex` + visitor banner (`views/LegalPageView.tsx:17,46`). **Confirmed live on `/about/` and `/terms/`** [RUNTIME]. Note the schema documents this fallback as intentional (`schema.prisma:1565-1567`) — the defect is the review flag on live pages, not the fallback mechanism.
2. **Homepage SEO title and description** — literal at `app/(public)/page.tsx:17-19`, bypassing the EntitySeo path every section page uses.
3. **Footer legal affiliation disclaimer** (PRCA/WPRA/NFR/Las Vegas Events) — `components/SiteFooter.tsx:119`. Legal text, every page, no admin owner. The Blueprint deliberately locks this in code (`:374`), so it is by design — but it is then *not* flagged as locked anywhere in the admin.
4. **Logo / wordmark** — `NFR<span>Guide</span>` literal JSX, `components/SiteHeader.tsx:83-85`.
5. **Primary section identity** — `id`, `path`, `categoryKey` code-only at `config/routes.ts:75-116`; an admin cannot add, remove or re-slug a section.
6. **Homepage category→section map** — `SECTION_CATEGORY` (`homepageData.ts:47-51`) and `PRIMARY_SECTIONS[...].categoryKey` (`:105`). This is the sole reason category/section filtering is not admin-controllable.
7. **Block-level literals inside Builder-controlled pages** — `"More {sectionName} Stories & Dispatches"` and `columns={3}` (`LandingBlocks.tsx:129,138`); `"Championship Disciplines"`/`"NFR Discipline Guides"` (`:153,156`); `"Department Feature"` (`:73`); `'Related Championship Coverage'` (`RelatedArticles.tsx:15`).
8. **Two synthetic slots injected server-side** — `landing-empty` and `landing-competition-disciplines` (`sectionLandingData.ts:84,93`) with `order:-1, props:{}`. They render publicly and are **undeclared in the registry**, so they cannot be reordered, hidden or edited.
9. **Announcement display cap `2`** — literal at `app/(public)/layout.tsx:17`; an admin may enable more, only two ever show.
10. **`robots.txt` rules** — `allow:'/'`, `disallow:'/admin/'` literal at `app/robots.ts:8`. Confirmed live [RUNTIME].
11. **Page background and brand gold** — `bg-[#F7F3EA]` (`PublicChrome.tsx:57`), `#D4A757` across header and footer.
12. **Homepage empty-state copy** — "No published coverage yet", "Run the seed to load demonstration content" (`app/(public)/page.tsx:41-44`) — developer-facing text on a public page.

---

## 5. Page-by-Page Control and Rendering Matrix

**Builder mode:** `full` = slots drive the visible layout · `tail` = slots appended below fixed JSX · `hero+cta` = only those slot types consumed · `none` = not Builder-backed.
**Order honoured** = is the admin's saved slot order actually reflected in output.

| Page type | Config owner | Selectable in Builder | Sections editable | Add/remove/hide/reorder | Order honoured | Props respected | Content dynamic | Template | Draft preview | SEO | Hard-coded blockers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Homepage** | `PageLayout('homepage')` | YES | YES (15 blocks) | YES | **YES** | **PARTIAL** — `newsletter-signup` inert; `featuredIds` missing from 4 blocks' defaults | YES | own | **YES** | **HARDCODED** title/desc; **0 JSON-LD** | empty-state copy; `SECTION_CATEGORY` map |
| **NFR Competition** `/competition/` | `PageLayout('section:competition')` | YES | YES (6 blocks) | YES | **YES** | **PARTIAL** — `landing-hero.heroImageUrl`, `landing-grid.articleCount` ignored | YES | shared landing | **YES** | PASS | 2 synthetic slots; `columns={3}`; disciplines headings |
| **NFR Entertainment** | `PageLayout('section:entertainment')` | YES | YES | YES | YES | PARTIAL (same) | YES | shared landing | YES | PASS | synthetic empty slot; grid heading |
| **NFR Events & Shopping** | `PageLayout('section:events-shopping')` | YES | YES | YES | YES | PARTIAL (same) | YES | shared landing | YES | PASS | same |
| **NFR Plan & Watch** | `PageLayout('section:plan-watch')` | YES | YES | YES | YES | PARTIAL (same) | YES | shared landing | YES | PASS | same |
| **More Rodeo** `/rodeo-events/` | `PageLayout('section:rodeo-events')` | YES | YES (section part) | YES | YES | PARTIAL (same) | YES | shared landing + fixed `RodeoDirectory` | YES | PASS | `"Rodeo Hubs"`/`"Recurring Events"` headings (`RodeoViews.tsx:104,119`) render below the controlled section |
| **Article detail** | `PageLayout('template:article')` | YES | **tail only** | tail blocks only | tail only | **PARTIAL** — `detail-related.title` ignored | YES | shared appendage | YES | **PASS** (strongest: full JSON-LD graph) | body is fixed JSX by design |
| **Rodeo hub detail** | `PageLayout('template:rodeo-hub')` | YES | **tail only** | tail only | tail only | PARTIAL | YES | shared appendage | YES | PASS | body fixed JSX |
| **Rodeo event detail** | `PageLayout('template:rodeo-hub')` ¹ | YES | **tail only** | tail only | tail only | PARTIAL | YES | shared appendage | YES | PASS | body fixed JSX |
| **Rodeo edition detail** | `PageLayout('template:rodeo-edition')` | YES | **tail only** | tail only | tail only | PARTIAL | YES | shared appendage | YES | PASS | body fixed JSX |
| **Discipline detail** | `PageLayout('template:discipline')` | YES | **tail only** | tail only | tail only | PARTIAL | PARTIAL — deep-guide JSON + image have **no admin owner** (`rodeoService.ts:203-210`); no create/delete (`:212`) | shared appendage | YES | PASS | deep-guide JSON |
| **Category / archive** | `PageLayout('template:category')` | YES | **tail only** | tail only | tail only | PARTIAL | PARTIAL — `Category.description` written but never rendered | shared appendage | YES | PASS | copy from `PRIMARY_SECTIONS`; no `SectionConfig` override (`lib/content.ts:285-290`) |
| **Competitor directory** | `PageLayout('directory:competitors')` | YES | **hero+cta** | CTA only (`DirectorySlots.tsx:6`) | n/a | **FAIL** — `heroImageUrl` resolved then dropped; `directory-grid.columns` dead | YES — but listings come from `batch12Content.ts:151` **outside** the slot system | own | YES | **HARDCODED** | "Directory" kicker, filter labels, `Apply`/`Reset` (`:39,44-49`); hero fallbacks (`:32-33`) |
| **Competitor detail** | `PageLayout('template:competitor')` | YES | **tail only** | tail only | tail only | PARTIAL | YES | shared appendage | YES | PASS — but JSON-LD `url` is **relative** (`:58` → `lib/seo.tsx:217`) | body fixed JSX |
| **Venue directory** | `PageLayout('directory:venues')` | YES | **hero+cta** | CTA only | n/a | **FAIL** (same) | YES — `batch12Content.ts:170`, outside slots | own | YES | **HARDCODED** | same as competitor directory |
| **Venue detail** | `PageLayout('template:venue')` | YES | **tail only** | tail only | tail only | PARTIAL | YES | shared appendage | YES | PARTIAL — no derived `image` (`:32-37`); relative JSON-LD `url` | body fixed JSX |
| **Schedule** `…/[edition]/schedule/` | none | **NO** | **NO** | **NO** | n/a | n/a | **YES — admin-editable end-to-end** (`competitionService.ts:79-278` → `:317-325`) | own fixed | **NO** — never calls `isStaffDraftPreview` | **HARDCODED** (`:18-23`) | all structure/labels |
| **Results** | none | NO | NO | NO | n/a | n/a | YES — as above | own fixed | NO | HARDCODED | all structure |
| **Standings** | none | NO | NO | NO | n/a | n/a | YES — as above | own fixed | NO | HARDCODED | all structure |
| **Search** `/search/` | none | NO | NO | NO | n/a | n/a | client index | own fixed | NO | N/A — `index:false` by design | title, metadata, 4 group headings (`:141,163,174,186`) |
| **Info / legal** `/info/[slug]/` + 7 legacy | `InfoPage` ‖ `config/legalPages` | **NO** | **NO** | **NO** | n/a | n/a | PARTIAL — live-edit reverts to hardcoded text (D-05) | own fixed | **NO** | PARTIAL — no canonical/ogImage/robots columns (`schema.prisma:1568-1583`) | **225 lines of prose**; `noindex` + draft banner **live** [RUNTIME] |
| **Auth ×4 / Account ×2** | none | NO | NO | NO | n/a | n/a | auth/user | own fixed | NO | N/A — `index:false` | utility, by design |
| `app/go/[id]` | Monetization (`AffiliateLink`) | n/a | n/a | n/a | n/a | n/a | YES | route handler | n/a | n/a | **none — verified safe** (DB-only destination, re-validated, safe fallback, non-blocking click record) |

¹ Both the hub and event branches of `/rodeo-events/[slug]/` call `resolveRodeoHubTemplateSlots` [SOURCE].

**Coverage summary** [SOURCE]: of 15 page keys exposed in the Builder, **6 genuinely compose** their page from slots (homepage + 5 section landings), **7 tail-append only** (all `template:*`), and **2 consume a CTA block with the hero read manually by the route** (both `directory:*`). **9 of 15 listed keys do not compose their page from the Builder.**

**Responsive / accessibility:** [UNVERIFIED] — no browser session was available. One source-level observation: the Blueprint's invariant R4 (exactly one `<h1>` per page from the hero block, `BLUEPRINT:405`) has no enforcing test, and the two synthetic injected slots render headings outside slot control, so R4 cannot be assumed to hold.

---

## 6. Reusable Block Contract Matrix

**Counts** [SOURCE]: `sectionRegistry.ts` holds **29 definitions → 27 unique types** (2 defined twice). `blockRegistry` (`registry.tsx:132-160`) holds **23** entries. 6 declared types have no renderer; 2 rendered types are undeclared. (27 − 6 + 2 = 23.)

**Cons.** = props actually consumed · `slot` = reads `slot.props` · `data` = reads resolver `data` only.

| Block id | Families | Editable props (type) | Resolver | Renderer | Cons. | Fallback | Status / defects |
|---|---|---|---|---|---|---|---|
| `editorial-hero` | homepage | featuredIds(featured), heroImageUrl(image), heroImageAlt(text), kicker, ctaText, secondaryCount(num≤4) | `homepageData.ts:81-86` | `registry.tsx:33` (slot) | **all 6** | `null` if no lead (`:37`) | **OK** — the only fully-wired hero |
| `latest-coverage` | homepage | kicker, title, description, articleCount(num≤12), featuredIds, ctaText, ctaUrl | `:98,103` | `:51` (slot) | all 7 | `null` if empty (`:55`) | **OK** |
| `quick-access` | homepage | kicker(+helpText), title, description | nav service | `:66` (slot) | copy only | items from nav | **PARTIAL** — items not Builder-editable (by design); **helpText never renders** (type `text`, D-03) |
| `competition` | homepage | kicker, title, description | disciplines | `:87` (slot) | all 3 | — | **OK** |
| `plan-and-watch` | homepage | kicker, title, description, articleCount(num≤**8**), featuredIds, ctaText, ctaUrl | `:98,106` | `:100` (slot) | all 7 | — | **DEFECT** — `featuredIds` absent from `defaultProps` (`:133`); declared max 8, actual clamp 0–12 (`homepageData.ts:98`) |
| `entertainment` | homepage | as above | `:98,106` | `:105` (slot) | all 7 | — | **DEFECT** — same two (`:150`) |
| `events-shopping` | homepage | as above | `:98,106` | `:110` (slot) | all 7 | — | **DEFECT** — same two (`:167`) |
| `learning` | homepage | as above | `:98,108` | `:127` (slot) | all 7 | — | **DEFECT** — same two (`:198`) |
| `more-rodeo` | homepage | kicker, title, description | hubs/events | `:115` (slot) | all 3 | — | **OK** |
| `rich-text-block` | homepage **+ landing** | title, body(textarea), alignment(select) | none | `PremiumBlocks.tsx:5` (slot) | all 3 | empty `<section>` | **DUPLICATE DEF** `:211`/`:391`; `alignment` cast unvalidated (`:10`) |
| `image-text-block` | homepage | title, body, imageUrl(image), imageAlt, imagePosition(select), ctaText, ctaUrl | none | `:18` (slot) | all 7 | empty `<section>` | **OK** — raw `<img src>` (`:26`), `<a href>` (`:32`) |
| `stats-banner` | homepage | title + stat1–4 Label/Value (9×text) | none | `:40` (slot) | all 9 | `null` if 0 stats (`:43`) | **OK** — React key on `s.label` (`:50`) collides on duplicate labels |
| `cta-banner` | homepage **+ landing** | kicker, title, description, ctaText, ctaUrl, bgColor(select) | none | `:61` (slot) | all 6 | always renders | **DUPLICATE DEF** `:270`/`:408`; raw `<a href>` (`:73`) |
| `faq-block` | homepage | title + q1–5/a1–5 (11 props) | none | `:80` (slot) | all 11 | `null` if 0 FAQs (`:83`) | **OK** — key on `f.q` (`:89`) |
| `newsletter-signup` | homepage | title, description, ctaText, placeholderText | none | `:102` (slot) | all 4 | always renders | **BROKEN** — `readOnly` input (`:110`), button with no handler (`:111`). Documented as *hidden* (`BLUEPRINT:126`) yet renders publicly |
| `landing-hero` | landing | heroImageUrl(image), kicker, title, description | `sectionLandingData.ts:67-68` | `LandingBlocks.tsx:25` (slot+data) | title, description, kicker | `meta.name`/`meta.description` (`:35,37`); `null` if no meta (`:29`) | **DEFECT** — `heroImageUrl` **structurally unconsumable**: `SectionLandingHeroProps` has no image field (`SectionLandingHero.tsx:4-12`); stat pills hardcoded (`:41-42`) |
| `landing-featured` | landing | featuredIds(featured), ctaText | `:35,69-70` | `:48` (slot+data) | both | `null` if no story (`:52`) | **OK** — `"Department Feature"` hardcoded (`:73`) |
| `landing-grid` | landing | articleCount(num≤20), ctaText | `:71` | `:115` (slot+data) | **ctaText only** | `null` if empty (`:119`) | **DEFECT** — `articleCount` ignored (resolver passes unsliced `:72`); heading (`:129`) and `columns={3}` (`:138`) hardcoded |
| `landing-stat-pills` | landing | **none** (`:388`) | `:53-54,63` skipped | **no entry** | — | `pillsVisible` → `landing-hero` | **BROKEN CONTRACT** — `defaultProps.pills[]` (`:382-387`) never read by anything. Visibility toggle only |
| `detail-hero` | detail | heroImageUrl(image), showImage(**text**) | dropped | **no entry** | **none** | — | **DEAD** — `showImage` declared `text`, default boolean `true` (`:440,443`) |
| `detail-body` | detail | **none**, `defaultProps {}` (`:454`) | dropped | **no entry** | — | — | **DEAD** — zero contract |
| `detail-related` | detail | title(text), articleCount(num≤6) | `detailTemplateData.ts:34,59` | `DetailBlocks.tsx:16` (**data only**) | **articleCount only** | `null` if empty (`:18`) | **DEFECT** — `title` ignored; `Number(…)\|\|3` **unclamped** → unbounded DB `take`; `0` silently becomes `3` |
| `detail-faq` | detail | title(text) | dropped | **no entry** | **none** | — | **DEAD** |
| `detail-cta` | detail | ctaText, ctaUrl(url) | `:38-40,64-66` | `:22` (**data only**) | both | `null` if no ctaText (`:24`); href `'/'` (`:28`) | **OK** |
| `directory-hero` | directory | heroImageUrl(image), title, description | `directoryData.ts:34-38` | **no entry** | title, description **read manually by route** | route literals | **DEFECT** — resolved-then-dropped; `heroImageUrl` unread |
| `directory-grid` | directory | columns(num≤4) | **not handled** | **no entry** | **none** | — | **DEAD** — `required:true` (`:521`) yet unrenderable |
| `directory-cta` | directory | ctaText, ctaUrl(url) | `:39-42` | `DirectoryBlocks.tsx:14` (**data only**) | both | `null` if no ctaText (`:16`) | **OK** |
| `landing-empty` | **undeclared** | — | injected `sectionLandingData.ts:89-93` | `LandingBlocks.tsx:102` | — | `null` if articles>0 (`:105`) | **NOT CONFIGURABLE** |
| `landing-competition-disciplines` | **undeclared** | — | injected `:79-84` | `LandingBlocks.tsx:143` | — | `null` if none (`:146`) | **NOT CONFIGURABLE** — 2 hardcoded headings (`:153,156`) |

**Visibility and ordering:** `PageRenderer` (`PageRenderer.tsx:12-25`) applies **neither**. Each resolver filters and sorts independently (`homepageData.ts:67`, `sectionLandingData.ts:25-27`, `detailTemplateData.ts:25-26`, `directoryData.ts:25-27`). `required` and `duplicatable` are **UI-only** — not enforced server-side.

**SEO-relevant props:** only `heroImageAlt` (`editorial-hero`) and `imageAlt` (`image-text-block`), both `tab:'seo'` and both consumed. **No block feeds page metadata** — block content and page SEO are fully decoupled.

### 6.1 Rendered publicly but not configurable

`landing-empty` and `landing-competition-disciplines` — synthetic slots injected with `order:-1, props:{}` (`sectionLandingData.ts:84,93`); undeclared, so un-reorderable, un-hideable, un-editable · `landing-stat-pills` label/value pairs, hardcoded in `LandingHeroBlock` (`:41-42`) · `directory-hero` output, rendered by route JSX rather than as a block.

### 6.2 Duplicate implementations

`rich-text-block` and `cta-banner` are each **defined twice** with divergent `maxInstances` (`:211`/`:391`; `:270`/`:408`). `getAvailableBlockTypes` dedupes **first-wins** (`:588-598`, verified), and `validateBlockLimits` resolves from that same deduped map (`pageLayoutService.ts:57-58`). **Consequence:** on section-landing pages the *homepage* limits silently apply (5 and 3), not the declared landing limits (3 and 2) — the stricter limit is unreachable, and the admin is shown a limit that is not the one enforced. No duplicate *components* exist; `PremiumBlocks` are correctly shared.

### 6.3 Missing contracts and type mismatches

| Issue | Evidence |
|---|---|
| `showImage` declared `text`, default boolean `true` | `:440` vs `:443` |
| `landing-stat-pills.pills` is `{label,value}[]` with **no** `PropDef` | `:382-388` |
| `detail-body` — empty `editableProps` **and** empty `defaultProps` | `:454-455` |
| `featuredIds` in `editableProps` but absent from `defaultProps` (4 blocks) | `:133,150,167,198` vs `:139,156,173,204` |
| 4 types declared/`required` with no renderer | `:438,453,521` |
| `richtext` `PropType` declared but used by no block | `:19` |

### 6.4 Validation gaps [SOURCE] `pageLayoutService.ts:29-53`

Sanitisation runs **only when `typeof val === 'string'`** (`:38`):

| Check | Coverage |
|---|---|
| 2000-char limit | strings only (`:39`) |
| XSS | `/<script/i` **only** (`:40`) — `<img onerror>`, `<svg onload>` and event-handler attributes all pass |
| URL scheme/shape | keys matching `/url$/i` only (`:43-49`) |

**Unvalidated:**

1. **`PropDef.max` is never enforced server-side.** Homepage and landing clamp at *resolve* time via `numProp` (`slotUtils.ts:9`), but `detail-related.articleCount` is `Number(…)||3` with **no clamp** (`detailTemplateData.ts:34,59`) → an unbounded Prisma `take`.
2. **`select` `options` never validated** — `alignment`, `imagePosition`, `bgColor` accept any ≤2000-char string.
3. **Non-string props entirely unchecked** — numbers, booleans, arrays, nested objects (including `pills[]`).
4. **No prop whitelist** — `props: z.record(z.string(), z.unknown())` (`:21`) persists arbitrary undeclared keys.
5. **`required` not enforced** — a crafted `saveDraft` can omit a required block; guarded only in the editor UI.
6. `:48` (`javascript:`) is **dead code** — the anchored pattern at `:45` already rejects it.

Residual XSS risk is limited because React escapes text children; the real exposure is confined to the `*Url` props reaching `<img src>` (`PremiumBlocks.tsx:26`) and `<a href>` (`:32,73`), which *are* scheme-validated.

### 6.5 Cross-family inconsistency

- **Two incompatible prop contracts.** Homepage and landing blocks read `slot.props`; **all** detail and directory blocks read only resolver `data` and ignore `slot` (`DetailBlocks.tsx:16,22`; `DirectoryBlocks.tsx:14`). **This is the root cause of `detail-related.title` being ignored** — nothing copies it into `data`.
- **Resolver allowlists silently drop valid slots.** `resolveAppendageSlots` emits only `detail-related`/`detail-cta` (`detailTemplateData.ts:48-67`); `resolveDirectorySlots` only `directory-hero`/`directory-cta` (`directoryData.ts:34-43`). A visible, saved, schema-valid block simply vanishes with no warning to the admin.
- `articleCount` is clamped 0–12 on homepage, ignored on landing, unclamped on detail.
- The same block carries different declared limits per family, none of which are the enforced ones (§6.2).

### 6.6 Misleading editor controls (beyond the inert-prop list)

1. `landing-stat-pills` presents a block with **zero** editable props whose stored `pills` array is inert — it looks configurable; it is a checkbox.
2. `detail-hero.showImage` renders as a **free-text input** for a boolean.
3. `directory-grid` is `required:true`, cannot be removed, and renders nothing.
4. `newsletter-signup` presents a working-looking email form that captures nothing.
5. Declared `max` values (8, 6, 20, 4) appear as limits but are unenforced server-side, and for `detail-related` unenforced anywhere.
6. Section-landing `rich-text-block`/`cta-banner` limits shown to the admin are not the limits enforced.

### 6.7 Can the registry support one shared server-side rendering contract?

**Not without changes — but no rewrite is needed.** Five concrete blockers [SOURCE]:

1. **`PageRenderer` is `'use client'`** (`PageRenderer.tsx:1`). Four blocks need `useRouter` (`registry.tsx:34,52,88`), so the registry is a client module. A server contract requires lifting navigation out to plain `<Link>`. `LandingBlocks`, `DetailBlocks`, `DirectoryBlocks` and `PremiumBlocks` are already server-compatible.
2. **The dual prop contract** (§6.5) must converge on one convention.
3. **Per-family resolver allowlists** must become registry-driven, or adding a block to the registry will continue to do nothing.
4. **Visibility and ordering must move into the renderer** — currently in four resolvers; `PageRenderer` applies neither. Low-risk and a prerequisite.
5. **`data: Record<string, unknown>`** with unchecked per-family casts (`registry.tsx:29-31`, `LandingBlocks.tsx:21`, `DetailBlocks.tsx:12`) gives no compile-time guarantee a renderer receives what its resolver produced.

The `SectionSlot` JSON contract (`sectionRegistry.ts:9-15`) is sound and already family-agnostic. **No schema change is required.** The duplication is in the four resolvers and the two prop conventions, both consolidatable incrementally.

---

## 7. Content Source Engine Analysis

### 7.1 Headline: the engine is 100% dead code [SOURCE]

`lib/cms/contentSourceEngine.ts` is 402 lines with **zero importers**. Every export has no real caller. The only external reference in the repository is a source-text assertion:

```
tests/batch33-unit.test.ts:12   const src = read('lib/cms/contentSourceEngine.ts');
tests/batch33-unit.test.ts:14   expect(src).toContain('export async function resolveContentSource')
```

The type exports (`ContentSourceConfig`, `ResolvedItem`, `ResolvedSource`, `SourceFilter`, `SourceMode`, `SourceEntityType`) have **zero** references anywhere.

It is also **unreachable by construction**: `parseContentSource` returns `null` unless `props.sourceMode` is set (`:374-375`), and `sourceMode` — along with every other `source*` prop it reads (`:377-390`) — **does not exist in `sectionRegistry.ts` or anywhere else in the repository**. No admin control can produce the input it requires. The engine could not run even if it were imported.

This is the clearest single instance of the project's methodological failure: a 402-line architectural centrepiece, cited by a passing test, that no code loads and no input can reach.

### 7.2 Capability matrix

`CSE` = the dead engine. "Live" = the path that actually serves pages.

| Capability | Backend | Admin UI | Persisted | Public use | Evidence |
|---|---|---|---|---|---|
| automatic selection | YES (live) | implicit — no mode selector | n/a (absence of `featuredIds`) | **YES** | `lib/content.ts:198,46,214`; `homepageData.ts:103,106,108` |
| manual selection | YES (live) | **YES** (`featured` editor) | **YES** (`featuredIds`) | **YES** | `content.ts:64`; `slotUtils.ts:26`; `sectionRegistry.ts:350-360` |
| mixed / manual-first | YES (live) | implicit — always mixed | YES (same prop) | **YES** | `slotUtils.ts:20-31` `pickedThenAuto` |
| pinned articles | PARTIAL — `featuredIds` order *is* the pin | YES (reorderable picker) | YES | YES | `slotUtils.ts:26`; `content.ts:70-74` preserves caller order |
| category filtering | YES | **NO** — hardcoded map | **NO** | YES (code-driven) | `homepageData.ts:47-51,105` |
| section filtering | YES | **NO** | **NO** | YES | as above; `sectionLandingData.ts:32` |
| discipline filtering | YES | **NO** — not a slot prop | **NO** | PARTIAL — detail route only | `content.ts:84`; CSE-only `contentSourceEngine.ts:86-88` |
| event / edition filtering | PARTIAL | **NO** | **NO** | PARTIAL — detail routes only | `contentSourceEngine.ts:89-94` (dead); live via `rodeoContent` |
| featured filtering | YES | YES (`isFeatured` in editor) | YES (`Article.isFeatured`) | YES | `content.ts:169`; CSE `:84` |
| upcoming editions | **CSE ONLY** | **NO** | **NO** | **NO** | `contentSourceEngine.ts:244` — unreachable |
| content limits | YES | **YES** (`articleCount`) | **YES** | **PARTIAL** | `slotUtils.ts:5-10`; works at `homepageData.ts:98`; ignored for `landing-grid` (`sectionLandingData.ts:72`); unclamped for `detail-related` |
| sorting | YES — fixed | **NO** | **NO** | YES | `content.ts:57` `orderBy:{publishedAt:'desc'}` — no admin control anywhere |
| deduplication | **PARTIAL** — real implementation is dead; live is ad-hoc | n/a | n/a | **PARTIAL — leaks** | dead `DeduplicationContext` `:58-71`; live `shownInHero` `homepageData.ts:77,92,103` |
| fallback behaviour | YES — always fill-auto | **NO** control | **NO** | YES | `slotUtils.ts:27-30`; CSE `fallbackPolicy` `:22,110` unreachable |
| empty-state behaviour | YES | **NO** control | **NO** | YES | synthetic slot `sectionLandingData.ts:89-96`; CSE `emptyBehavior` `:24,400` unreachable |
| published filtering | **YES** | n/a (workflow) | YES (`workflowStatus`) | **YES** — 24 call sites | `lib/fixturePolicy.ts:23-28` `publicArticleWhere()` |
| fixture exclusion | **YES** | NO | slug-prefix convention; no column | **YES** in live path, **NO** in CSE | `fixturePolicy.ts:14-33`; CSE uses bare `workflowStatus` `:82,98,132` |
| entity visibility | PARTIAL | PARTIAL | PARTIAL (`Competitor.status String?`) | PARTIAL | `batch12Content.ts:67,73,123,128` |

### 7.3 Duplication between engine and live resolvers [SOURCE]

| Concern | Dead CSE | Live implementation |
|---|---|---|
| manual-then-auto fill | `:128-144`, `:110-118` | `slotUtils.ts:20-31` |
| deduplication | `DeduplicationContext` `:58-71` | `shownInHero: string[]` `homepageData.ts:77,92` |
| limits | `config.limit` `:79` | `numProp(...)` `homepageData.ts:98` |
| published filter | bare `workflowStatus` `:82` | `publicArticleWhere()` `fixturePolicy.ts:23` |
| empty detection | `isEmpty` `:358` | synthetic slot `sectionLandingData.ts:90` |
| manual order preservation | `:102-107` | `content.ts:70-74` (identical pattern) |

The live versions are narrower but **safer** — the CSE's published filter omits fixture exclusion, so wiring it in as-is would *regress* fixture-leak protection.

### 7.4 Type compatibility — incompatible

CSE emits a flat `ResolvedItem` (`:39-48`) with `publishedAt` as an **ISO string** (`:174`) and a 120-char truncated excerpt (`:173`). The live pipeline passes the full domain `Article` type via `toArticle`, with per-family slot types `HomeSlotData` (`homepageData.ts:27-37`), `LandingSlotData` (`sectionLandingData.ts:8-16`), `DirectorySlotData` (`directoryData.ts:5-12`). Public block components consume `Article`, not `ResolvedItem`. **No mapping glue exists** — none was ever written, consistent with the engine never having been connected.

### 7.5 Fixture exclusion — real, env-gated, one latent bypass

`lib/fixturePolicy.ts` is genuine: `excludeFixturesFromPublic()` returns true only when `appEnv() === 'production'` (`:15`); `publicArticleWhere()` adds `NOT: { slug: { startsWith: FIXTURE_PREFIX } }` (`:26`). Slug-prefix based — there is **no `isFixture` column**.

Applied at **24 call sites** in `lib/`, including every getter in `content.ts`, plus `rodeoContent.ts:3` and the raw-SQL variant at `lib/search/publicSearch.ts:114`. **Not applied** in `contentSourceEngine.ts:82,98,132` — harmless today (dead), a latent regression if wired in. Remaining bare usages (`analytics/events.ts:63`, `adminQueries.ts:193-194`, `analyticsService.ts:375`, `competitorService.ts:75`, `seoService.ts:49`) are admin/analytics counters, correctly excluded.

### 7.6 Deduplication — traced, and leaking in public [RUNTIME]

Live dedup is a single array, `shownInHero`, built from the hero's lead plus secondary ids (`homepageData.ts:77`, pushed at `:92`). It is passed as an exclusion to **only one** slot:

```
homepageData.ts:103   getLatestArticles(need, [...shownInHero, ...ex])     ← excluded
homepageData.ts:106   getPublishedArticlesBySection(categoryKey, {limit, excludeIds: ex})   ← NOT excluded
homepageData.ts:108   learning → filters on `ex` alone                     ← NOT excluded
```

`ex` is only `pickedThenAuto`'s *within-slot* exclusion. And `shownInHero` is never extended past the hero (`:92` is the only push), so two sibling category slots cannot dedup against each other either.

**Confirmed live on the running homepage** [RUNTIME] — repeated `/articles/…` hrefs:

```
3 ×  /articles/how-to-watch-nfr-streaming-cable-cord-cutters/
2 ×  /articles/ticket-advisory-consumer-protection-guide/
2 ×  /articles/las-vegas-in-december-insiders-logistics/
2 ×  /articles/hotel-district-breakdown-las-vegas-resort-corridor/
2 ×  /articles/cowboy-christmas-2026-buyers-handcrafted-curation/
2 ×  /articles/country-music-residencies-after-parties-roundup/
```

Six articles render more than once; one renders three times. The dead `DeduplicationContext` would have handled this correctly via the shared-`ctx` threading in `resolveMultipleSources` (`:364-370`) — **the capability was designed, then not connected.**

### 7.7 The smallest unifying change

**Make `lib/cms/slotUtils.ts` the single entry point and delete `contentSourceEngine.ts`.**

`slotUtils.ts` is already the de-facto shared layer — both `homepageData.ts:14` and `sectionLandingData.ts:4` import from it, and it already composes over `publicArticleWhere()`-backed getters. It is 31 lines, live, and tested by behaviour rather than source text.

1. **Thread a shared exclusion set** through `resolveHomepageSlots` instead of the one-way `shownInHero` array — extend after each slot resolves (`homepageData.ts:96-113`) and pass it at `:106` and `:108` as well as `:103`. This ports the dead `DeduplicationContext` idea into the live path and fixes §7.6.
2. **Promote the hardcoded filter maps to slot props.** `SECTION_CATEGORY` (`:47-51`) and `PRIMARY_SECTIONS[...].categoryKey` (`:105`) are the only reason category/section/discipline filtering is not admin-controllable. A `categoryKey` `select` prop reuses the existing editor type — no new infrastructure.
3. **Delete the dead module and its four source-text tests** (`tests/batch33-unit.test.ts:12-27`), or formally revive it behind real registry props. Keeping it is actively harmful: it *looks* like the content architecture, a passing test vouches for it, and it silently lacks fixture protection.

**What blocks unification today:** nothing structural. The blockers are the hardcoded filter maps and the absence of any `source*` registry prop. Steps 1 and 3 need **no schema change**.

**Adjacent observation:** `directoryData.ts` resolves **no content at all** — it passes slot props through (`:34-43`) while the actual listings come from `listPublicCompetitors`/`listPublicVenues` (`batch12Content.ts:151,170`), called directly by the routes entirely outside the slot system.

---

## 8. Admin UX and Client Control Analysis

### 8.1 The seven owner questions

| # | Question a non-technical owner must be able to answer | Verdict | Evidence |
|---|---|---|---|
| 1 | Which page am I editing? | **PARTIAL** | A page-key selector exists, but keys are technical (`template:rodeo-hub`, `directory:venues`). `PAGE_KEY_LABELS` provides friendly names (`sectionRegistry.ts:641-658`), yet the admin is still organised by subsystem tab, not by page — contrary to `BLUEPRINT:288-295` (UX-01) and `:326` (UX-06) |
| 2 | Which sections appear on that page? | **PARTIAL** | The list is accurate for the 6 composing keys. For the 9 tail-append/CTA-only keys it **overstates reality** — blocks are listed that cannot render (§6.5 allowlists) |
| 3 | Where will a block appear? | **FAIL** | No rendered canvas. Position is inferable only from list order, and for detail/directory pages the list order does not correspond to visible position at all |
| 4 | Where does its content come from? | **FAIL** | No Content Source panel exists (`BLUEPRINT:311`, UX-07 unimplemented). Category/section mapping is a hardcoded map (§7.2) invisible to the admin |
| 5 | Which changes are saved as drafts? | **PASS** | Draft/published state is explicit, and the publish/reset/schedule/history controls are wired (`AdminPageLayoutEditor.tsx:315-414`) |
| 6 | What will visitors see after publishing? | **PARTIAL** | Preview shows genuinely correct draft data for all 15 keys, but opens in a separate tab (`:836-839`) with no inline view and **no viewport control** |
| 7 | How do I preview, publish or restore? | **PASS** | All present, including restore-to-draft-only semantics (`pageLayoutService.ts:371-377`), which is the safe design |

### 8.2 Builder interface audit [SOURCE] `views/admin/AdminPageLayoutEditor.tsx`

| Capability | Status | Evidence |
|---|---|---|
| Canvas renders the actual page | **FAIL** | `<div className="divide-y divide-stone-100">` of text rows (`:716-765`); each row shows only label (`:744`) and description (`:748`) plus an index, a Visible/Hidden pill (`:750`) and up/down/eye buttons. Own comment: `{/* ── Left: Canvas (block list) ── */}` (`:660`) |
| Block renderer used in admin | **FAIL** | `blockRegistry` is **never imported**; no iframe; no `PageRenderer` usage in the file |
| Block tree / section navigator | **PASS** | The ordered list serves this purpose well |
| Click-to-select | **PARTIAL** | Works (`:732`), maps correctly to slot id → `selectedDef` (`:141-142`) — but on a list row, not a visual section |
| Properties panel shows real saved values | **PASS** | Read from `slot.props[prop.key]` (`:429`) |
| Editing a property updates the canvas | **FAIL** | No visual canvas to update |
| Responsive previews | **FAIL** | No viewport state; fixed `lg:grid-cols-[1fr_300px]` (`:658`) — **two** panels despite a "three-panel builder" comment at `:657`; iframe fixed height (`preview/route.ts:53`) |
| Add / remove / reorder / duplicate / hide | **PASS** | `addBlock` (`:202`, enforces `maxInstances`), `duplicateBlock` (`:220`, gated on `duplicatable`), `removeBlock` (`:240`, blocks `required`), `toggleVisible` (`:251`), `moveBlock` (`:259`), HTML5 drag-and-drop (`:274-303`). All reorder paths renormalise `order` |
| Media picker | **PASS** | `image` prop type mounts MediaPicker with preview (`:563`) |
| Content selection | **PARTIAL** | `featured` type provides a real search/recent/reorder picker (`:479`). Candidate search filters `workflowStatus:'PUBLISHED'` (`page-layout-actions.ts:45`), partially satisfying CSE-12 — but it does not apply the full `publicArticleWhere()` fixture filter, so admin candidates and public visibility can diverge |
| Property editor coverage | **PARTIAL** | 9 types at `:426-609`; `richtext` falls through to a plain `textarea` (`:468`) |
| **helpText rendering** | **FAIL** | Rendered in only **3 of 9** branches — `number` (`:439`), `featured` (`:499`), `image` (`:585`). **Absent** from the `text` fallback (`:600-608`), `textarea` (`:468`), `select` (`:454`), `boolean`, `color` |
| Save feedback / error handling | **PASS** | Actions return `ActionResult` via `toActionError` (`lib/cms/guard.ts`) |
| Empty states | **PARTIAL** | Public empty state exists (synthetic slot); admin-side empty-layout guidance [UNVERIFIED] |
| Role-based permissions | **PASS** | All mutating actions gated on `requireActor('system.config')` (`page-layout-actions.ts:12,17,22,27`) |

### 8.3 The `helpText` defect in full

This is the clearest illustration of the project's verification problem, so it is documented end to end.

- The help string exists in the registry: `quick-access.kicker` declares `helpText: 'The links shown here are managed in Admin → Header & Nav under "Homepage — Quick Access".'` (`lib/cms/sectionRegistry.ts:108`) [SOURCE].
- `quick-access.kicker` is of type **`text`**.
- The `text` branch of `renderPropField` (`:600-608`) **does not render `helpText`** [SOURCE].
- Therefore the string is stored in the registry, persists in the database, and **never reaches the DOM**.
- The test written to guard this behaviour passes anyway — see §13.3.
- A prior audit reported this feature as a verified PASS on the strength of a `grep`.

The owner observed the absence in the running UI. The owner was right; two layers of automated and manual verification were wrong.

### 8.4 Duplicate and misleading management interfaces

| Surface | Problem |
|---|---|
| **"Appearance" tab** | Named as site appearance; **all 21 `AppearanceConfig` fields are `introBanner*`** (`siteConfigService.ts:77-99`) and are consumed **only** by the homepage `IntroBanner` (`app/(public)/page.tsx:34`). An owner will reasonably expect site-wide theming. The Blueprint resolves this by **removing** the screen (`:316,376`) |
| **Footer links in two places** | Header & Nav (`footer-sections`, `footer-academy`) vs Website→Footer columns. `SiteFooter.tsx:67-74` — config columns **replace** the menu-driven columns when configured. Editing nav then produces **no public change**, with no warning in either module. This is the most likely source of "I changed it and nothing happened" |
| **Homepage hero in two places** | `editorial-hero` block vs Appearance intro banner |
| **Section identity in two places** | `SectionConfig` (Settings) vs `landing-hero` props |
| **Announcements vs Global Blocks** | Two models, two editors, both producing site-wide promotional surfaces, both loaded at `app/(public)/layout.tsx:17-18`. No code conflict; ownership is ambiguous to an operator |
| **Landing SEO not in the nav** | `app/admin/(dashboard)/landing-seo/page.tsx` is absent from `CMS_MODULES` (`permissions.ts:20-39`); reachable only via a contextual button on Rodeo Coverage (`AdminRodeoCoveragePage.tsx:76`). The editor for all 8 landing-entity SEO records has no primary nav entry |

### 8.5 Routine website changes that still require a developer

[SOURCE] — each item is a change an owner would reasonably expect to self-serve:

1. Change the site logo or wordmark.
2. Change any site-wide colour, font or the page background.
3. Edit the footer legal affiliation disclaimer (locked in code by design — but not labelled as locked).
4. Edit any of the 7 legal/policy pages **without** the public page reverting to hardcoded text mid-edit (D-05).
5. Clear the "Draft — pending owner review" banner and `noindex` from those 7 live pages.
6. Set the homepage SEO title or meta description.
7. Set a directory or coverage-page SEO title or description.
8. Add, remove or re-slug a primary section.
9. Change which category feeds a homepage section slot.
10. Change the sort order of any article feed.
11. Change the number of articles in a section-landing grid (`articleCount` is ignored).
12. Set a hero image on a section landing, detail or directory page (3 inert `heroImageUrl` props).
13. Change the directory grid column count.
14. Edit the "Rodeo Hubs" / "Recurring Events" headings on `/rodeo-events/`.
15. Edit the search page's group headings.
16. Edit the directory filter labels, placeholder or `Apply`/`Reset` buttons.
17. Edit the "Related Championship Coverage" heading, or any `detail-related` title.
18. Show more than 2 announcements.
19. Change `robots.txt` crawl rules.
20. Add a redirect for any path other than an article slug change.
21. Edit discipline deep-guide content (competition format, scoring breakdown) or a discipline image; create or delete a discipline.
22. Preview a legal page before publishing it.
23. Check how any page looks on mobile from inside the Builder.

---

## 9. Header, Footer, Navigation and Global Configuration Analysis

All public routes live under `app/(public)/`; `app/layout.tsx:29` renders bare `{children}` [SOURCE]. **No public page bypasses the global chrome.**

| Element | Admin-editable | Authoritative owner | Public consumer | Hardcoded fallback / gap |
|---|---|---|---|---|
| Header shell | **NO** | code | `SiteHeader.tsx` via `PublicChrome.tsx:58` | structure fully hardcoded |
| **Logo / wordmark** | **NO** | code | `SiteHeader.tsx:83-85` | `NFR<span>Guide</span>` literal. No upload, no text field |
| Primary navigation | YES | `NavigationItem('header')` | `nav?.header` → `SiteHeader.tsx:33` | `NAV_FALLBACK` 5 links (`:17-24`) |
| Nav ordering / visibility | YES | `NavigationItem` | as above | `navigationService.ts:38-46` CRUD + `setNavVisible`, `restoreCanonicalNav` |
| Nav nesting | [UNVERIFIED] | — | — | not inspected |
| Mobile navigation | [UNVERIFIED] | — | `SiteHeader.tsx` | no browser session |
| Search placeholder | **NO** | code | `SiteHeader.tsx` | `SEARCH_PLACEHOLDER` literal (`:25`) |
| Announcements | YES | `Announcement` | `getActiveAnnouncements(2)` → `layout.tsx:17`, `PublicChrome.tsx:59` | **cap `2` hardcoded at the call site**; no draft layer |
| Footer tagline / description / copyright / status | YES | `SiteConfig('footer')` | `SiteFooter.tsx:93-150` | `DEFAULT_COPYRIGHT` (`:58`), `DEFAULT_DESCRIPTION` via `text()` (`:60`) |
| Footer columns | YES (max 6) | **CONFLICT** — `SiteConfig('footer').columns` *replaces* `NavigationItem` columns | `config.columns` → `SiteFooter.tsx:69` | `SECTIONS_FALLBACK`/`ACADEMY_FALLBACK` (`:11-21`); silent precedence (`:67-74`) |
| Footer section / academy links | YES | `NavigationItem` — **overridden** by the above | `SiteFooter.tsx:63-65` | `DIRECTORY_LINKS` **force-merged** (`:65`) regardless of admin nav |
| Social links | YES (max 10, https-only) | `SiteConfig('footer')` | `SiteFooter.tsx:76,100-102` | none |
| Footer policy / legal links | **NO** | `config/legalPages` | `SiteFooter.tsx:48` | `POLICY_LINKS` code-derived. An admin-created info page never cross-links; a removed legacy page's link cannot be deleted |
| **Footer legal affiliation disclaimer** | **NO** | code — **by design** (`BLUEPRINT:374`) | `SiteFooter.tsx:119` | PRCA/WPRA/NFR/Las Vegas Events paragraph. Locked deliberately, but not *labelled* as locked anywhere in the admin |
| Homepage intro banner | YES | `SiteConfig('appearance')` — **conflicts with** `editorial-hero` | `app/(public)/page.tsx:34` | 21 `introBanner*` fields; Blueprint retires this in favour of the slot (`:368,299`) |
| Quick-access links | YES | `NavigationItem('quick-access')` | `homepageData.ts:71` → `QuickAccessBlock` | functional; the Builder block's helpText pointing here never renders (§8.3) |
| Global content blocks | YES | `GlobalBlock` | `layout.tsx:18` (`footer-top`), `page.tsx:32-33`, `ArticleView.tsx:19` | 7 placements declared, **3 dead** (`globalBlockService.ts:17-19`) |
| Global CTA | **NO** | — | — | no such concept exists |
| **Global appearance (colours / fonts / theme)** | **NO** | — | — | `bg-[#F7F3EA]` (`PublicChrome.tsx:57`); `#D4A757` literal across header and footer. OPEN Q6 — deferred by design |
| Site-wide SEO defaults | **NO** | — | — | `SITE_CONFIG_KEYS` contains no SEO key (`siteConfigService.ts:14`) |
| Global indexing rules | **NO** | code | `app/robots.ts:8` | literal `allow`/`disallow`. Confirmed live [RUNTIME] |
| Site Identity (`siteName`, `tagline`) | YES — **but inert** | `SystemSetting` | **none** | `settingsService.ts:102`; zero public readers |

### 9.1 Global vs per-page control — recommendation

| Should be global | Should be per-page | Currently misplaced |
|---|---|---|
| Logo, brand colours, fonts, page background | Hero content and image | Homepage hero is **both** (Appearance *and* slot) |
| Primary nav, footer structure, social links, legal links | Section identity (name/tagline/description) | Section identity is global-only (`SectionConfig`), with a conflicting slot prop |
| `robots.txt` policy, site-wide SEO defaults | Per-page SEO overrides | Per-page SEO exists for 8 entity types; site-wide defaults do not exist |
| Announcement inventory + scheduling | Which announcements a page shows | Announcements are global-only, capped at 2 in code |
| Global block inventory | Block placement | 3 of 7 placements are dead |

**Migration consequence of collapsing duplicates.** Retiring the Appearance intro banner (Blueprint `:368`) is **not** a pure deletion: 21 stored `introBanner*` fields are live on the homepage today. Removing the screen without migrating those values into `editorial-hero` props would blank the homepage banner for any owner who configured it. Likewise, resolving the footer-column conflict in favour of `SiteConfig` makes already-configured `NavigationItem` footer rows permanently inert — they should be migrated or explicitly marked superseded in the UI, not silently ignored as they are now.

---

## 10. SEO Intelligence Integration Audit

### 10.1 Architecture — genuinely centralised [SOURCE]

One emitter, one policy. **Do not build a second SEO engine.**

- `lib/seo.tsx:53` — `buildMetadata()`, the **sole** Metadata emitter (title, description, canonical, robots, OG, Twitter).
- `lib/seo/robots.ts:17-72` — `RobotsPolicy` with independent index/follow; `combineRobots()` keeps most-restrictive.
- `lib/seo/policy.ts:60-101` — `effectiveRobots` / `isIndexable` / `isInSitemap` as pure functions.
- `lib/cms/entitySeoService.ts:90` — `mergeSeoMeta()`, override→derived fallback; **noindex additive-only** (`:98-101`), so an editor cannot force-index a page policy excludes.
- `lib/seo/canonical.ts` — single same-site normaliser, shared by render, save-validation and sitemap.
- `lib/seo/sitemapEntries.ts:226` → `app/sitemap.ts:11`.
- `lib/seo-intel/{analyzers,rules,orchestrator,auditLock,types}.ts` — the SEO Intelligence audit engine, surfaced by `app/admin/(dashboard)/seo/page.tsx` via `getSeoDashboard`/`listFindings`/`listSeoRules`/`getSeoThresholds`, gated on `seo.config`/`seo.audit.run`/`seo.finding.manage`.

### 10.2 Ownership

`LandingEntityType` (`schema.prisma:1540-1549`) has 8 values, **all 8** editable via Landing SEO (`lib/cms/landingEntities.ts:17`), all 5 `EntitySeo` fields exposed (`views/admin/AdminLandingSeoPage.tsx:109-115`). Articles own SEO via `ArticleSeo` + `views/admin/ArticleSeoPanel.tsx`.

**Families with no admin-editable SEO:**

| Family | Status | Evidence |
|---|---|---|
| **Homepage** | **HARDCODED** | `app/(public)/page.tsx:14-23` — literal, no `getEntitySeo`. **No `HOMEPAGE` enum member exists** |
| **Directories** ×2 | **HARDCODED** | `competitors/page.tsx:18`, `venues/page.tsx:18`; only `robots` is dynamic via `directoryListingRobots(filtered)` |
| **Schedule / Results / Standings** | **HARDCODED** | `…/schedule/page.tsx:18-23`; `noindex: rows.length === 0` |
| **Search** | **N/A** | `search/page.tsx:19-23`, `index:false, follow:true` — intentional |

### 10.3 Per-field rendering matrix [SOURCE] + [RUNTIME]

| Family | Title | Desc | Canonical | Robots | OG | Twitter | Social img | JSON-LD | Breadcrumbs | Img ALT |
|---|---|---|---|---|---|---|---|---|---|---|
| Homepage | HARDCODED | HARDCODED | derived | derived | PASS | PASS | hero only | **FAIL** | FAIL | FAIL |
| Section landings | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Articles | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS** (richest) | PASS | FAIL |
| Disciplines | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Categories | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Rodeo hub / event | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Rodeo edition | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Competitor | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PARTIAL** ¹ | PASS | FAIL |
| Venue | PASS | PASS | PASS | PASS | PASS | PASS | **PARTIAL** ² | **PARTIAL** ¹ | PASS | FAIL |
| Directories | HARDCODED | HARDCODED | derived | PASS | PASS | PASS | default | PASS | PASS | FAIL |
| Coverage pages | HARDCODED | HARDCODED | derived | PASS | PASS | PASS | default | PASS | PASS | FAIL |
| Info / legal | PASS | PASS | **FAIL** ³ | **PARTIAL** ⁴ | PASS | PASS | **FAIL** ³ | PASS | PASS | FAIL |
| Search | N/A | N/A | N/A | PASS | N/A | N/A | N/A | FAIL | N/A | N/A |

¹ `competitorJsonLd`/`venueJsonLd` receive **relative** URLs — `competitors/[slug]/page.tsx:58` passes `ROUTES.COMPETITOR(c.slug)`, consumed raw at `lib/seo.tsx:217`; venue likewise (`venues/[slug]/page.tsx:57` → `:192`). Contrast `rodeo-events/[slug]/[edition]/page.tsx:47-48`, which correctly prefixes `SITE_URL`. Schema.org `url` must be absolute.
² Venue derived meta omits `image` (`venues/[slug]/page.tsx:32-37`).
³ `InfoPage` (`schema.prisma:1568-1583`) has **no** canonical / ogImage / robots columns; `LegalPageView.tsx:13-18` emits none.
⁴ Info robots is derived-only (`LegalPageView.tsx:17`); no editorial control.

**Runtime `<head>` confirmation** [RUNTIME]:

- `/` → title, description, `robots: index, follow`, canonical, full OG + Twitter. **Zero `application/ld+json` blocks.**
- `/competition/`, `/competitors/`, `/venues/` → full metadata + **2** JSON-LD blocks each.
- `/articles/inside-the-chutes-nfr-roughstock-intensity/` → absolute canonical, `og:type=article`, and a rich graph: `Article`, `Person`, `Organization`, `BreadcrumbList`, 3× `ListItem`.
- `/about/`, `/terms/` → **`robots: noindex, nofollow`** plus visitor-visible "Draft — pending owner" text.
- `og:image` is the same `hero_bull_riding_*` asset on `/`, `/competition/`, `/competitors/`, `/venues/` — the global default, with no per-page override available on the hardcoded families.

### 10.4 Dead SEO fields — stored, never read [SOURCE]

| Field | Evidence |
|---|---|
| `ArticleSeo.structuredDataType` | `schema.prisma:136`, default `"Article"`. Only other repo-wide occurrence is the type declaration `types/index.ts:81`. `articleJsonLd` derives `@type` from `isNewsArticleType(article.articleType)` (`lib/seo.tsx:108`), ignoring the column. **An admin-set value silently does nothing** |
| Media `altText` | `schema.prisma:222,325`. `buildMetadata` emits `images: [{ url: ogImage }]` (`lib/seo.tsx:82`) and `twitter.images: [ogImage]` (`:90`) — **no `alt` key** anywhere in `lib/seo.tsx` or `lib/seo/`. Violates `BLUEPRINT:183` (SEO-05) |

### 10.5 Sitemap, robots and indexing consistency

`app/robots.ts:8` — literal rules, not admin-editable. Confirmed live [RUNTIME]:

```
User-Agent: *
Allow: /
Disallow: /admin/
Host: http://localhost:3000
Sitemap: http://localhost:3000/sitemap.xml
```

Policy sharing is genuine: `sitemapExclusionReason` (`policy.ts:89-97`) rejects unpublished, content-noindex, stored-robots-noindex, editor-noindex, canonical-away and type-excluded entries. The sitemap re-derives robots from the same `EntitySeo`/`ArticleSeo` sources the pages render (`sitemapEntries.ts:110-113,156-157`), with eligibility predicates commented as mirroring the page rule (`:172,183`) [SOURCE].

**Live sitemap — 39 URLs** [RUNTIME]: 11 `/articles`, 9 `/rodeo-events`, 7 `/disciplines`, 5 `/categories`, 4 section landings, 1 `/competitors`, 1 `/venues`, 1 `/`.

**One confirmed inconsistency.** Zero `/info/…` or legacy legal URLs appear [RUNTIME]. Root cause [SOURCE]: `sitemapEntries.ts:213` iterates the **static `LEGAL_PAGES` config**; the published-InfoPage query (`:106`) serves only as an eligibility/lastModified lookup keyed by those slugs (`:212,216`). An admin-created InfoPage whose slug is not in `LEGAL_PAGES` renders at `/info/<slug>/` and **is indexable** (`LegalPageView.tsx:17` → `noindex: !db && …` is false when `db` exists) yet never appears in the sitemap. **The `/info/[slug]/` family has no sitemap representation at all.**

**[UNVERIFIED]** — zero competitor/venue *detail* URLs appear, but the local dataset contains no such records, so this cannot be distinguished from empty data.

### 10.6 Redirects [SOURCE]

**No admin redirect UI.** `ArticleRedirect` (`schema.prisma:574-581`) is written automatically on slug change or unpublish inside `articleService.ts:433-444` and consumed at `lib/content.ts:147` → `articles/[slug]/page.tsx:43`. Article-scoped only; no arbitrary path redirects, no management surface. `seo-intel/orchestrator.ts:73` reads them for auditing.

### 10.7 Admin SEO usability [SOURCE]

- **Search-snippet preview: articles only** — `components/admin/editor/SearchAppearancePreview.tsx`, used by `views/admin/AdminArticleEditorShell.tsx`. Landing SEO has plain inputs with no preview.
- **Social-card preview: absent repo-wide.**
- **Validation / findings: present and real** — the `seo-intel` engine with rules, analyzers, orchestrator, audit locking and thresholds.
- **Indexability signal: weak** — list rows show `seo·noindex`/`seo`/`no-seo` (`AdminLandingSeoPage.tsx:51`), reflecting only the editor flag, **not** effective robots after content rules. An admin cannot see that a thin hub is noindexed regardless of their setting.
- **Draft isolation for SEO:** `BLUEPRINT:182` (SEO-04) requires preview responses to carry `X-Robots-Tag: noindex`. The preview route (`preview/route.ts`) sets no such header [SOURCE] — the iframe content is same-origin draft HTML, so this is a real residual gap, mitigated only by the admin path being `Disallow`ed in `robots.txt`.

### 10.8 Historical S1–S7 re-verification [HISTORICAL] → current verdict

| Claim | Verdict | Evidence |
|---|---|---|
| S1 Article SEO renders | **FIXED** | `articles/[slug]/page.tsx:34` → `articleMetadataInput` (`articleMeta.ts:58-69`) consumes all five stored fields |
| S2 Section landing SEO renders | **FIXED** | `[section]/page.tsx:29-30`, `rodeo-events/page.tsx:22-23` → `sectionMetadataInput` → `mergeSeoMeta` |
| S3 noindex/follow correctness | **FIXED** | `EDITOR_NOINDEX = {index:false, follow:true}` (`robots.ts:24`) vs `LEGACY_NOINDEX` nofollow (`:26`); combined most-restrictively (`:66-72`); additive-only (`entitySeoService.ts:98-101`) |
| S4 central indexing policy | **FIXED** | `lib/seo/policy.ts` single source, consumed by the sitemap |
| S5 canonical single normaliser | **FIXED** | `entitySeoService.ts:30`, `articleMeta.ts:39`, `policy.ts:77` all delegate to `canonical.ts`; save-validation uses the render rule (`entitySeoService.ts:46`) |
| S6/S7 sitemap consistency, validator thresholds | **PARTIAL** | Sitemap/robots agree for all entity families; the `/info/` gap (§10.5) is live. Thresholds exist (`getSeoThresholds`) but their alignment with render-time policy is **[UNVERIFIED]** — `seo-intel/rules.ts` values were not traced against `policy.ts` |

---

## 11. Draft, Preview, Publishing and Revision Analysis

### 11.1 Lifecycle by entity [SOURCE]

| Entity | Draft save | Preview = draft? | Publish | Revisions | Schedule | Audit log | Cache invalidation |
|---|---|---|---|---|---|---|---|
| **PageLayout** (15 keys) | `saveDraft` → `draftSections` (`:122-144`) | **YES — verified** | `publishLayout` txn (`:146-177`) | **YES** (`:337-381`) | **YES** (`:218-318`) | **YES** — 8 actions | `revalidatePath('/','layout')` **on draft save too** (D-09) |
| **SiteConfig** (`footer`, `appearance`) | `saveDraft` → `draft` (`siteConfigService.ts:148-160`) | **NO** — no preview path | `publishConfig` (`:162-178`) | **NO** | **NO** | YES | `rev()` (`site-config-actions.ts:8`) |
| **InfoPage** | `saveInfoPageDraft` → single row + `status` enum (`:59-74`) | **NO** — route never calls `isStaffDraftPreview` | `publishInfoPage` (`:100-110`) | **NO** | **NO** | YES | per-slug (`info-page-actions.ts:19-21`) |
| **SectionConfig** | **no draft layer** — live on save | N/A | immediate | **NO** | **NO** | YES | via action |
| **Navigation** | **no draft layer** — live on save | N/A | immediate | **NO** | **NO** | YES | `rev()` (`navigation-actions.ts:9`) |
| **Announcements** | **no draft layer** — `enabled` + date window only | N/A | immediate | **NO** | **NO** | YES | via action |
| **Global Blocks** | **no draft layer** — `enabled` + date window only | N/A | immediate | **NO** | **NO** | YES | via action |
| **EntitySeo / ArticleSeo** | n/a — direct write | n/a | immediate | **NO** | **NO** | YES (`entitySeoService.ts:68`) | via action |

**Four publishing models coexist, not three** (correcting F6): draft→publish for PageLayout and SiteConfig; live-on-save for Navigation, Announcements, Global Blocks **and `SectionConfig`**; a status machine with no draft/published coexistence for InfoPage; and direct write for SEO records. The admin UI does not explain the difference anywhere.

### 11.2 Draft isolation and preview correctness — PASS [SOURCE] + [RUNTIME]

This subsystem is correct and should be preserved as-is.

- **Guard:** `previewGuard.ts:5-9` requires `draftMode().isEnabled` **AND** permission `system.config`. Because the permission check is independent, a forged `__prerender_bypass` cookie alone is insufficient.
- **Branch points verified:** `app/(public)/page.tsx:26-27` (homepage selects `getDraftSections`/`getPublishedSections` in-route); `fetchVisibleSlots` (`detailTemplateData.ts:73-77`); `resolveDirectorySlots` (`directoryData.ts:23`); `resolveSectionLandingSlots` (`sectionLandingData.ts:28`).
- **All 11 Builder-backed call sites pass `{ draft }`:** `categories:46`, `competitors`(dir)`:27`, `competitors/[slug]:49`, `disciplines:53`, `rodeo-events/[slug]:54` & `:73`, `[edition]:45`, `venues`(dir)`:27`, `venues/[slug]:48`, `ArticleView.tsx:18`, `SectionLandingView.tsx:6`. **No resolver was found where `draft` is accepted but not threaded** — the preview-shows-published bug class does not exist here.
- **Preview URL correctness:** `pageKeyToUrl` (`preview/route.ts:77-119`) resolves a real sample entity per template via eight distinct Prisma lookups, covering all 15 keys.
- **Runtime:** `GET /?_preview=draft` as an anonymous client returned **0** draft markers; `/admin/website/preview?pageKey=homepage` redirects anonymous users to `/admin/login/` [RUNTIME].

### 11.3 Lifecycle defects [SOURCE]

1. **InfoPage has no draft-alongside-published model.** `saveInfoPageDraft` refuses live edits — `"Cannot edit a published page directly. Create a new draft revision."` (`:64-66`) — but **no such revision mechanism exists**. The only path is `unpublishInfoPage` (`:123-130`), which flips status to `DRAFT`; `getPublishedInfoPage` filters `status:'PUBLISHED'` (`:55-57`), so the page leaves public output. For the 7 `LEGACY_SLUGS` the hardcoded fallback silently takes over (`LegalPageView.tsx:22-26`) — **editing a live legal page reverts the public page to hardcoded text**. For a non-legacy slug it **404s** (`:24`). Schema confirms the shape: a single row with a `status` enum, no draft/published pair (`schema.prisma:1568-1583`).
2. **Info pages have no preview at all** — `app/(public)/info/[slug]/page.tsx` never calls `isStaffDraftPreview`.
3. **No optimistic concurrency on the interactive path.** `PageLayout.version` exists (`schema.prisma:1607`) and `version: { increment: 1 }` appears **exactly once** — `pageLayoutService.ts:295`, inside `executeScheduledPublish` guarded by `updateMany` (`:282`). `saveDraft` (`:122-144`) is a plain `upsert` with no `expectedVersion`, and `publishLayout` (`:146`) takes none. **Two admins editing one page silently overwrite each other.** This violates `BLUEPRINT:479,628` (SEC-01) and is the unresolved half of F10.
4. **Revision-number race.** `nextRevisionNo` is a read-then-increment (`:328-335`) and is `await`ed **while constructing** the `$transaction([...])` array (`:167`) — so the read happens *outside* the transaction boundary. Concurrent publishes of the same `pageKey` can compute the same `revisionNo` and collide on `@@unique([pageKey, revisionNo])` (`schema.prisma:1626`). It **fails safe** (no corruption) but surfaces an opaque constraint error.
5. **Scheduler is not deploy-safe.** `startScheduler` uses in-process `setInterval` (`scheduledPublishRunner.ts:53-60`) launched from `instrumentation.ts:30-33`; `timer.unref()` (`:59`) means it will not hold the process open. On serverless or scale-to-zero it never fires; on multi-instance every replica runs it. Optimistic locking contains the race, so this is a **reliability** gap, not a correctness one. Note the feature itself was an **open owner decision** (`BLUEPRINT:673`, Q8) that was implemented anyway.
6. **Scheduler revalidation targets `localhost`** — `triggerRevalidation` posts to `http://localhost:${PORT}` (`:12-13`); in a multi-instance deployment only the publishing replica's cache is flushed.
7. **Cache invalidation fires on draft save** and is blanket. `rev()` (`page-layout-actions.ts:9`) calls `revalidatePath('/', 'layout')`, and `saveDraftAction` (`:12`) invokes it — so **saving a draft for `template:venue` flushes the entire public site including the homepage**. Violates `BLUEPRINT:449` (LIFE-06, scoped revalidation) and the Nov 7 recommendation (LIFE-07); still present at HEAD.
8. **Revisions are unbounded.** `nextRevisionNo` increments monotonically; `listRevisions` defaults to `limit:50` (`:341`) but there is **no retention or pruning**, and each publish stores a full `snapshot` JSON (`schema.prisma:1619`). Retention was OPEN Q5 (`BLUEPRINT:670`).
9. **Silent fallback masks database failure.** `getPublishedSections`/`getDraftSections` swallow all errors and return `buildDefaultSlots` (`:90-92`, `:102-104`). A DB outage renders **default layouts** rather than erroring — admin-saved layouts vanish with no signal. Nov 7 flagged this (LIFE-08); unimplemented.
10. **Dead preview params.** `?_preview=draft&_pk=…` (`preview/route.ts:64`) has **no reader** anywhere; preview relies solely on the draft cookie. Harmless but misleading.
11. **Draft mode is session-wide, not page-scoped.** `draftMode().enable()` (`preview/route.ts:38`) applies to the staff user's entire subsequent public browsing until `?exit=1` — they may mistake draft layouts for live ones.
12. **`restoreRevision` restores to draft only** (`:371-377`), requiring a second publish. **Not a defect — this is the correct, safe design and should be preserved.**

### 11.4 Risk of accidental live changes

Ranked by likelihood:

1. **Navigation, Announcements, Global Blocks and `SectionConfig` publish instantly on save** with no draft, no preview and no undo. An owner exploring these tabs changes the live site immediately.
2. **Footer column edits in Header & Nav appear to save but have no effect** once `SiteConfig.footer.columns` is configured — the inverse failure, equally confusing.
3. **Concurrent Builder editing loses work silently** (§11.3 item 3).
4. **Editing a published legal page takes it off the public site** or reverts it to hardcoded prose (§11.3 item 1).

---

## 12. Database, Security and Reliability Findings

### 12.1 Schema review — Builder-relevant models [SOURCE] `prisma/schema.prisma`

| Model | Line | Shape | Observation |
|---|---|---|---|
| `PageLayout` | 1596 | `pageKey @unique`, `draftSections Json`, `publishedSections Json`, `scheduledSections Json?`, `scheduledAt`, `version Int @default(1)` | Sound. `version` exists but is used only by the scheduler (§11.3-3) |
| `PageLayoutRevision` | 1615 | `pageKey`, `revisionNo`, `snapshot Json`, `actorId`, `actorName`, `summary`; `@@unique([pageKey, revisionNo])`; `@@index([pageKey, createdAt])`; `onDelete: Cascade` | Well-modelled. **No retention field** → unbounded growth. Cascade means deleting a layout destroys its history |
| `SiteConfig` | 1685 | `key @id`, `draft Json`, `published Json`, `version Int` | Has the draft/published pair **and** a `version`, but neither a revision model nor a preview path |
| `SectionConfig` | 1553 | `sectionKey @unique`, `displayName?`, `tagline?`, `description?`, `heroImage?`, `visible Boolean` | **`heroImage` and `visible` are write-only** — `getSectionMeta` merges only the first three (`lib/content.ts:271-278`) |
| `InfoPage` | 1568 | single row, `status InfoPageStatus` enum | **No draft/published pair** → root cause of D-05. Schema comment (`:1565-1567`) documents the hardcoded fallback as **intentional**. No canonical/ogImage/robots columns |
| `Announcement` | 1632 | `enabled`, `startsAt?`, `endsAt?`, `priority` | Date-windowed; **no draft layer** |
| `GlobalBlock` | 1656 | `placements String[]`, `enabled`, date window | Array placements unconstrained at DB level; 3 of 7 app-level values are dead |
| `NavigationItem` | 789 | location-keyed | **No draft layer** |
| `EntitySeo` | 1164 | per entity-type/id overrides | Sound; the override→derived merge is the system's strongest piece |
| `ArticleSeo` | 128 | per-article overrides | Sound, except `structuredDataType` is never read (§10.4) |
| `AuditLog` | 773 | `actorId`, `action`, `entityType`, `entityId`, `detail` | Written via `audit()` (`lib/cms/guard.ts:40-48`) |

**Referential integrity:** `PageLayoutRevision → PageLayout` is the only Builder-side FK, correctly cascaded. `PageLayout.pageKey` is a free string validated **in application code only** (`validatePageKey`, `:113-120`) — there is no DB-level constraint, so a direct SQL write could create an orphan key. Acceptable given `system.config` gating, worth noting.

**Schema compatibility:** published configurations are JSON arrays of `SectionSlot` (`sectionRegistry.ts:9-15`). Because the shape is `{ id, sectionType, visible, order, props }` with `props` an open record, **adding or consuming new props is backward-compatible** — existing rows simply lack the key and fall back to defaults. This is the single most important compatibility property of the design and it holds.

### 12.2 Audit logging — complete [SOURCE]

This was initially mis-assessed in this audit and then corrected; the corrected result is a **strength**.

`pageLayoutService.ts` logs **eight** distinct actions: `page_layout.draft_save` (`:142`), `.publish` (`:175`), `.reset_draft` (`:191`), `.restore_defaults` (`:212`), `.schedule` (`:244`), `.cancel_schedule` (`:263`), `.scheduled_publish` (`:315`), `.restore_revision` (`:379`). `siteConfigService`, `navigationService`, `globalBlockService`, `announcementService`, `infoPageService`, `sectionConfigService`, `entitySeoService` (`:68`), `taxonomyService`, `mediaService`, `settingsService` and `teamService` all call `audit()`. `articleService` logs transactionally via `tx.auditLog.create` (`:520,524,663,688`). `landingAdminService` has no `audit()` call because it is **read-only** — its writes route through `entitySeoService` and `faqService` (5 calls), both logged.

**Coverage is complete for website-control operations.** Preserve it.

### 12.3 Permission enforcement [SOURCE] + [RUNTIME]

- All mutating Builder actions gate on `requireActor('system.config')` (`page-layout-actions.ts:12,17,22,27`).
- `isStaffDraftPreview` requires the same permission independently of the draft cookie (`previewGuard.ts:5-9`).
- Admin module visibility is default-deny (`permissions.ts:43`).
- **Runtime:** `/admin/website/` and `/admin/info-pages/` return `307 → /admin/login/`; the preview route lands anonymous users on `/admin/login/` [RUNTIME].

### 12.4 Server-side validation gaps

Fully detailed in §6.4. Summary: string-only sanitisation; XSS check is `/<script/i` alone; `PropDef.max` unenforced server-side (and unenforced anywhere for `detail-related.articleCount`, giving an unbounded Prisma `take`); `select` options unvalidated; non-string props entirely unchecked; no prop whitelist; `required` not enforced outside the UI.

### 12.5 Concurrency

| Path | Protection | Verdict |
|---|---|---|
| `executeScheduledPublish` | `updateMany` + `version: { increment: 1 }` (`:282-297`) | **Correct** — prevents double-publish |
| `saveDraft` | none (`:130-141`) | **Last-write-wins, silent** |
| `publishLayout` | none (`:146`) | No `expectedVersion` |
| `nextRevisionNo` | read-then-increment outside the transaction (`:167`, `:328-335`) | **Race** → opaque unique-constraint error; fails safe |

### 12.6 Silent fallback and reliability

`getPublishedSections`/`getDraftSections` swallow every error and return `buildDefaultSlots` (`:90-92`, `:102-104`). Operationally this means a database fault is indistinguishable from "the layout was reset to defaults" — and during remediation work it will actively mask regressions, so it should be fixed early.

### 12.7 Security finding — weak internal secret, confirmed exploitable

**This is the one item that warrants action independent of the product roadmap.**

```
app/api/internal/revalidate/route.ts:7
  const INTERNAL_SECRET = process.env.INTERNAL_REVALIDATE_SECRET || '__scheduled_publish_revalidate__';

lib/cms/scheduledPublishRunner.ts:9
  const REVALIDATE_SECRET = process.env.INTERNAL_REVALIDATE_SECRET || '__scheduled_publish_revalidate__';
```

[SOURCE] the fallback is a literal in both files. [RUNTIME] `INTERNAL_REVALIDATE_SECRET` is **absent from `.env` and from `.env.example`**, so the fallback is active. The repository is **public** on GitHub, so the constant is readable by anyone.

**Confirmed exploitable** [RUNTIME]:

```
POST /api/internal/revalidate/  {"secret":"__scheduled_publish_revalidate__","path":"/"}
  → 200  {"ok":true,"revalidated":"/"}

POST /api/internal/revalidate/  {"secret":"wrong","path":"/"}
  → 403  {"error":"forbidden"}
```

`path` is caller-supplied and passed to `revalidatePath(path, 'layout')` (`:15-16`) with no allowlist, so an unauthenticated caller can repeatedly flush any path's cache — a cache-stampede / denial-of-service vector against origin rendering.

### 12.8 Fixture leakage

Real mechanism, correctly applied at 24 call sites, with one latent bypass in dead code — see §7.5. One residual divergence: the Builder's featured-article candidate search filters `workflowStatus:'PUBLISHED'` (`page-layout-actions.ts:45`) but does **not** apply `publicArticleWhere()`, so in production an admin could pin a fixture article that the public query then suppresses — the slot would silently fall back to auto-fill. Violates `BLUEPRINT:360` (CSE-12).

### 12.9 Potential data-loss scenarios, ranked

1. **Concurrent draft editing** — silent overwrite, no warning, no recovery (§12.5).
2. **Editing a published legal page** — public page reverts to hardcoded text or 404s (§11.3-1).
3. **Deleting a `PageLayout` row** — cascades away all revision history (`schema.prisma:1624`).
4. **Retiring the Appearance screen without migrating** 21 stored `introBanner*` fields — blanks the configured homepage banner (§9.1).
5. **Resolving the footer-column conflict** without migrating `NavigationItem` footer rows — permanently inert admin data (§9.1).

### 12.10 Proposed schema changes — **APPROVAL REQUIRED**

No schema change was made. These are the changes the findings imply; each needs owner sign-off:

| # | Change | Driven by | Risk |
|---|---|---|---|
| S-1 | `InfoPage`: add draft/published column pair (or a revision table) | D-05 | Migration on a live content table |
| S-2 | `LandingEntityType`: add `HOMEPAGE` enum value | D-06 | Enum migration; low render-side risk since `mergeSeoMeta` already handles override→derived |
| S-3 | `InfoPage`: add `canonical`, `ogImage`, `robots` columns | §10.3 note 3 | Additive, low risk |
| S-4 | `PageLayoutRevision`: retention policy (count or age) | §11.3-8; OPEN Q5 | Deletes history — needs an explicit owner decision on how much to keep |
| S-5 | `SectionConfig`: draft/published state | LIFE-01, which conflicts with `BLUEPRINT:52` ("no changes to existing columns") | **Design conflict — resolve before implementing** |
| S-6 | Drop `ArticleSeo.structuredDataType`, **or** consume it | §10.4 | Dropping loses stored values; consuming changes emitted `@type` |

---

## 13. Test Coverage and Verification Results

### 13.1 Executed results — current, this audit [EXECUTED]

| Command | Status | Result |
|---|---|---|
| `npx vitest run` | **EXECUTED** | **77 files · 1528 tests · 1528 passed · 0 failed · 0 skipped · 116.94s** |
| `npx tsc --noEmit` | **EXECUTED** | **0 errors** (exit 0) |
| `npx playwright test` (9 specs) | **NOT EXECUTED** | `playwright.config.ts:39-40` requires `webServer: npx next start` — a production build, a seeded DB and admin-login fixtures; specs authenticate into `/admin/login/` (`e2e/page-builder.spec.ts:6`) and would mutate admin session state |
| `scripts/*.mts` (11 harnesses) | **NOT EXECUTED** | `route-smoke`, `cache-invalidation`, `migration-replay`, `cloud-data-import`, `r2-verify` require a running server, cloud credentials, or migration replay against a database |

**Database safety confirmed.** `vitest.config.ts` gates on `decideTestDatabase()`: it throws on `refused` and blanks `DATABASE_URL` unless an isolated database is present. Startup reported `[tests] isolated DB: localhost:5432/nfrguide_test`, so the 33 DB-integration files ran against the **disposable test database**. The guard works as designed and is a genuine strength.

**The 1528 figure reproduced exactly** — and that is the finding. A fully green suite at HEAD `fd4fb10`, while `helpText` does not render, ~10 props are inert, and the homepage duplicates six articles in public output.

### 13.2 Inventory and classification [SOURCE]

**77 `tests/*.test.ts`** (plus `tests/stubs/`, `tests/support/`, `tests/allowed-skips.json`), **9 Playwright specs** in `e2e/`, **11 harnesses** in `scripts/`. Categories count files by *method present*, so they overlap.

| Category | Files | Representative |
|---|---|---|
| **Source-text assertions** (`readFileSync` + `toContain`) | **25** | `batch-a-renderer`, `batch-c-revisions`, `batch-t4-quick-access-helptext` |
| DB integration (imports `@prisma/client` / `lib/db`) | **33** | `cms.test.ts`, `batch-g-info-pages`, `landing.test.ts` |
| Pure unit (logic, no I/O) | ~20 | `seo-policy.test.ts` (31 tests), `seo-robots`, `url`, `rbac` |
| SEO output / metadata | ~10 | `seo-article-meta`, `seo-section-meta`, `seo-canonical`, `sitemap-policy` |
| **Public rendering** (`renderToStaticMarkup`) | **3** | `batch18-ui`, `batch19-admin-ui`, `batchA` |
| Service tests with mocks (`vi.mock`/`vi.fn`) | **1** | effectively absent |
| Browser E2E | 9 specs | `e2e/page-builder.spec.ts`, `e2e/page-layout.spec.ts` |
| **Responsive / visual** | **0** | none |

Two structural facts matter most:

- **Rendering capability exists but is barely used.** `vitest.config.ts` sets `environment: 'node'`, yet `renderToStaticMarkup` works there — three files prove it. But they render only loading spinners (`batch18-ui.test.ts:13`, `batch19-admin-ui.test.ts:13`) and JSON-LD helpers (`batchA.test.ts:6-8`). **No test renders a single block component.** The tool was available and never pointed at the Builder.
- **Mocking is essentially unused** (1 file), so services are tested either against the real isolated DB or not at all.

### 13.3 The source-text assertion problem, quantified [SOURCE]

**25 of 77 files (32%)** read a source file as a string and assert on its contents. Within those files: **1259 `toContain`/`toMatch` assertions** out of roughly 1348 suite-wide — **≈93% of all substring assertions in the suite target source text rather than behaviour.**

The concentration is the real finding. **All 13 Builder/CMS batch files use this method**, and together they hold **611 of 1528 tests (40% of the suite)**:

```
batch-c-revisions 87 · batch-g-info-pages 84 · batch-t2-detail-templates 80
batch-d-scheduling 79 · batch-i-hardening 54 · batch-t3 46 · batch-f-preview 40
batch-t1 37 · batch-e-directory 25 · batch-h-integration 22 · batch-b 21
batch-a-renderer 20 · batch-t4 16
```

What these assertions actually do:

- `tests/batch-a-renderer.test.ts:9` reads `components/blocks/registry.tsx` into a string, then `:17` asserts `expect(registrySrc).toContain("'editorial-hero'")` for all 15 homepage types. It never imports `blockRegistry`, never renders a block, never checks a prop. It proves the *string* appears in the file.
- `tests/batch-c-revisions.test.ts:141` tests `publishLayout` by **slicing the service source**: `const fnBody = service.slice(service.indexOf('export async function publishLayout'))`, then asserting the text contains `$transaction`. **The function is never called.** Same pattern at `:146,156,164,398,406,414`.
- `tests/batch-c-revisions.test.ts:546` asserts `expect(actions).toContain('export async function saveDraftAction')` — that a declaration line exists in a file.

This method verifies **that code was written**, never **that it works**. It is structurally blind to every defect where code exists but has no effect — precisely the defect class that shipped.

### 13.4 Causation coverage — the central question

**No test proves that an Admin-edited property reaches public HTML. Not one.** [SOURCE]

- **Builder path.** Five files reference `saveDraft`/`publishLayout` (`batch-c-revisions`, `batch-d-scheduling`, `batch-i-hardening`, `batch31-unit`, `batch33-unit`). **Every reference is a source-text assertion.** No test writes a draft → publishes → resolves slots → renders → asserts the prop in output. The chain is never traversed.
- **`blockRegistry`.** Referenced by 6 files — **all by source-grep**. `batch-h-integration.test.ts:61-64` even asserts the *inverse* by substring (`expect(registry).not.toContain("'detail-hero':")`). **No file imports the registry object.**
- **SEO path.** Nine files touch `mergeSeoMeta`/`buildMetadata` and genuinely unit-test the merge logic (`seo-article-meta`, `seo-section-meta`, `seo-canonical` — these are real and valuable). But `generateMetadata` is referenced in only 3 files, again as source text. **No test asserts that a stored `EntitySeo` override emerges from a route's `generateMetadata` output.** The merge is tested in isolation; its wiring into 30 routes is not.
- **E2E does not close the gap.** `e2e/page-builder.spec.ts` asserts only admin-UI visibility — "Page Canvas heading visible" (`:43`), "Properties heading visible" (`:44`), "Add Section opens block library" (`:51-53`), "premium block types listed" (`:62-63`). It never edits a property, publishes, and visits the public page. **Note `:43`: it asserts a heading named "Page Canvas" is visible — which passes against a block list, and thereby helped legitimise the non-visual canvas.**

### 13.5 The Task 4 false pass, precisely [SOURCE]

`tests/batch-t4-quick-access-helptext.test.ts:60-69`:

```js
describe('Task 4 — Builder helpText rendering', () => {
  const editorSrc = read('views/admin/AdminPageLayoutEditor.tsx');

  it('editor renders helpText for text props', () => {
    expect(editorSrc).toContain('helpText');          // :64
  });

  it('editor renders helpText in small/muted styling', () => {
    expect(editorSrc).toContain('prop.helpText');     // :68
  });
});
```

**Line 64 is the false-confidence assertion.** The test is *named* "editor renders helpText for **text** props", but the assertion searches the **entire file** for the substring `helpText`. That substring is present three times — in the `number` branch (`AdminPageLayoutEditor.tsx:439`), `featured` (`:499`) and `image` (`:585`). The `text` branch (`:600-608`) contains no `helpText` at all. Line 68 fails the same way: `prop.helpText` appears in those same three branches.

**The test passes on evidence from branches it is not testing.** The name asserts a claim about one code path; the assertion is scoped to the whole file and cannot distinguish paths. The remaining 14 tests in that file (`:14-55`) are sound registry-shape checks — prop counts, defaults, `maxInstances`, category, icon. The two *behavioural* claims are the only ones that matter, and both are unfalsifiable as written.

### 13.6 Suite-level gaps

Framed as missing *kinds* of verification:

1. **Prop-causation tests (highest value).** For every `editableProps` entry: render the block via `renderToStaticMarkup` with a sentinel value and assert it appears in output, or assert a documented exemption. One parameterised suite over the registry would have caught **all** ~10 inert props *and* forced registry and renderers into agreement. `renderToStaticMarkup` already works in the current `node` environment — **no config change needed.** This is the Blueprint's own R3 contract test (`:404,429,636`), never built.
2. **End-to-end layout causation.** One integration test against the isolated DB: `saveDraft` → `publishLayout` → `getPublishedSections` → resolver → `renderToStaticMarkup` → assert the sentinel in HTML. This single test traverses the chain that 611 existing tests only describe.
3. **Metadata causation per route family.** Write an `EntitySeo` override, invoke the route's exported `generateMetadata`, assert the override appears.
4. **Ban source-text assertions for behavioural claims.** Reading a file is legitimate for structural invariants (e.g. keeping server-only types out of a client registry) but must not stand in for behaviour. A rule forbidding `readFileSync` + `toContain` in any test whose name contains "renders", "shows" or "displays" would have blocked T4's two tests.
5. **Assertion-to-name scoping.** T4 failed because a file-wide assertion backed a path-specific name. Behavioural assertions must target the narrowest available unit.
6. **Sitemap/robots consistency invariant.** Assert no URL is simultaneously indexable and absent from the sitemap — the `/info/<slug>/` gap is exactly this shape, and `sitemap-policy.test.ts` tests the policy functions without testing the generated set.
7. **Dedup invariant.** Assert no article id appears twice in a resolved page's slots — would have caught §7.6.
8. **Responsive/visual coverage is wholly absent** (0 files).

The Blueprint already mandates the fix: **TEST-05, "new website tests assert behaviour, not source text"** (`:644`) [DOC]. It was written and not adopted.

---

## 14. November 7 Audit Reassessment

Baseline reconciliation: Nov 7 assessed `main @ feb4711` **plus uncommitted working-tree fixes**. Those are now committed via `7514f67`, then reshaped by `c471b22`, `35eb467` and `fd4fb10`. **No fix was reverted;** two were superseded by better architecture.

| ID | Previous claim | Current status | Severity now |
|---|---|---|---|
| **F1** | Homepage sections ignore props; `HomeView` built a fixed `sectionMap` | **SUPERSEDED (improved)** — `homepageData.ts` exists; `sectionMap` gone; `HomeView.tsx:41` delegates to `<PageRenderer>` (added `c471b22`). Fix landed, then was replaced by Nov 7's own recommendation #1 | **Resolved** |
| **F2** | Section landings ignore slot order and most props | **FIXED-BUT-INCOMPLETE** — order now honoured (`SectionLandingView.tsx:10` → `SectionLandingSlots` → `PageRenderer`); `rich-text-block` (`registry.tsx:143`) and `cta-banner` (`:146`) now render on landings. **`landing-grid.articleCount` and `landing-hero.heroImageUrl` remain unconsumed.** Nov 7 correctly diagnosed the mechanism ("rendering decoupled from the registry"), which is exactly why the prop half still fails | **Medium** (was High) |
| **F3** | 4 of 13 page keys never read | **FIXED-BUT-INCOMPLETE** — `DEAD_PAGE_KEYS` is now empty (`sectionRegistry.ts:661`); all four resolve via `detailTemplateData.ts` and appear in `preview/route.ts`. But they **tail-append only**, and 3 of 5 declared detail blocks are inert. *Nov 7 missed that making a key live ≠ making its blocks render* | **Medium** |
| **F4** | Content Source Engine unused | **STILL BROKEN — unchanged.** 402 lines, **zero importers**, unreachable by construction. Sole external reference is `tests/batch33-unit.test.ts:12-15`. Recommendation #3 not implemented | **High — and rising.** Phases B–E added `directoryData.ts` and `detailTemplateData.ts`, each re-implementing fetching inline; consolidation cost grows per batch |
| **F5** | Draft preview works only for the homepage; template previews point to wrong URLs | **FIXED-VERIFIED** — `pageKeyToUrl` (`preview/route.ts:77-119`) resolves a real sample entity per template via 8 Prisma lookups; draft threading correct across all 11 Builder-backed routes. **Recommendation #7 bullet 3 (viewport toggle) not implemented** | **Low** (residual = owner req. G) |
| **F6** | Three publish models coexist | **STILL PRESENT**, and the finding was **incomplete** — the split is **2-vs-4**: `SectionConfig` is a fourth live-on-save surface Nov 7 did not list among the publish models. Recommendation #6 bullet 3 not implemented | **Medium** |
| **F7** | Same thing configured in two places (section identity; homepage hero) | **STILL PRESENT, compounded.** 42 `introBanner` references in `siteConfigService.ts` alongside a surviving `editorial-hero`; `displayName` merge still in `lib/content.ts`. Now worse because **all 21 Appearance fields are `introBanner*`**, making the tab misleading as well as duplicative | **Medium** |
| **F8** | Footer editor was UI only — `SiteFooter` never read `SiteConfig('footer')` | **FIXED-VERIFIED** — `SiteFooter.tsx:54` accepts `config?: FooterConfig`; consumes tagline (`:93`), description (`:97`), columns (`:69`), social links with https filter (`:76`), copyright (`:146`), status (`:149`); supplied at `layout.tsx:16,26` | **Resolved** (ownership ambiguity is F7/D-11, not F8) |
| **F9** | "New Announcement" / "New Global Block" modals could not open | **FIXED-VERIFIED repo-wide** — `AdminModal.tsx:6` declares `isOpen` required; all 8 consumers pass it, counts matching modal instances exactly (Announcements 1/1, GlobalBlocks 1/1, EditorialOrg 2/2, Monetization 2/2, RodeoCoverage 4/4, Sources 1/1, Team 1/1, WebsiteNav 1/1) | **Resolved** |
| **F10** | No concurrency protection on layouts | **FIXED-BUT-INCOMPLETE** — `version: { increment: 1 }` appears **once**, `pageLayoutService.ts:295`, inside `executeScheduledPublish` only. `saveDraft` and `publishLayout` take no `expectedVersion`. **Interactive editing remains last-write-wins.** Independently re-derived in this audit (§12.5) | **Medium** (unchanged for the human path) |
| **F11** | Tests assert source text, not behaviour — "this is why F1, F2, F3 and F8 shipped with green tests" | **STILL BROKEN — regressed.** `read()` vs `it()` ratios: `batch-a-renderer` **18/20**, `batch-b-detail` 13/21, `batch31-unit` 28/33, `batch33-unit` 23/37, `batch32-unit` 14/35. Across 77 files, **no** test in the `batch-a`…`batch-i` or `batch-t1`…`batch-t4` series imports a React renderer. `batch-f-preview` and `batch-h-integration` contain zero render or `generateMetadata` invocations. Recommendation #2 not implemented | **Raise to High** — this is the single mechanism by which ~10 inert props and a non-rendering `helpText` shipped behind 1528 green tests |

**Score:** 4 resolved (F1, F5, F8, F9 — F5 with a residual) · 4 fixed-but-incomplete (F2, F3, F10, and F5's viewport gap) · 3 still present (F4, F6, F7) · 1 regressed (F11).

### 14.1 What November 7 missed, and why

Nov 7 named the right root cause — "the registry advertises blocks and props with no check that a renderer consumes them" — but applied it only to the three cases it had already found by tracing the homepage. **It never enumerated every declared prop against its consumer**, so ~10 inert props went unlisted; its own recommendation #2 was precisely the test that would have found them. Similarly it noted "controls that silently do nothing" as a UX complaint rather than converting it into an inventory.

**The non-visual canvas is the starkest omission.** Nov 7 criticised the admin as "organised by technical subsystem, not by page" and asked "which page am I editing?", yet never stated that the canvas shows no rendered page. It said only that preview "is not representative… and has no mobile view" — treating preview as a side feature rather than recognising that the canvas itself was never visual. **"Only 6 of 15 keys compose"** follows directly from F2 + F3 but was never aggregated into a coverage count.

**Three findings were outside its scope and are fairly absent:** the revalidate secret (`/api/internal/revalidate` did not exist at `feb4711`), the legal-page `noindex` + visitor banner, and the InfoPage live-edit reversion (info pages were Phase G, after the audit). Nov 7 *did* catch the adjacent silent-fallback and fixture-leakage issues, so its security method was sound — the surface simply arrived later.

**Method gap in one sentence:** Nov 7 traced representative paths and reasoned about structure, but never performed an exhaustive declaration-versus-consumption diff and never ran a runtime check against rendered HTML. Both omissions are exactly what its own recommendations #2 and #7 would have closed — and both are how this audit found the six confirmed live defects.

### 14.2 On adopting its Phase 0–6 roadmap

Not adopted. Two reasons. First, its sequencing predates `c471b22`/`35eb467`/`fd4fb10`, which already delivered parts of Phases 0–1 (the shared renderer, live template keys) — so the roadmap's early phases are partly complete and partly superseded. Second, it placed the contract test (recommendation #2) inside a later phase; this audit's evidence is that **no remediation should ship before that test exists**, because the suite as it stands cannot distinguish a fix from a no-op. §18 re-sequences accordingly.

---

## 15. Complete Requirements Traceability Matrix

### 15.1 Owner requirements A–H (authoritative)

Source: `docs/NFRGUIDE-SITE-BUILDER-COMPREHENSIVE-AUDIT.md:406-417`. These are the only owner-level requirements stated as a closed set in the repository (§2.6).

| Req | Requirement | Admin UI | Persistence | Public Rendering | SEO Integration | Tests | Overall | Evidence |
|---|---|---|---|---|---|---|---|---|
| **OWN-A** | Complete homepage management — order, visibility, copy, counts, pins, hero image | VERIFIED COMPLETE | VERIFIED COMPLETE | **PARTIAL** | **BROKEN** | **MISSING** | **PARTIAL** | All 15 blocks compose (`HomeView.tsx:41`); order+visibility honoured (`homepageData.ts:67`); `editorial-hero` all 6 props consumed (`:81-86`). But `newsletter-signup` is inert (`PremiumBlocks.tsx:110-111`), `featuredIds` absent from 4 blocks' defaults (`:133,150,167,198`), SEO is hardcoded (`page.tsx:17-19`), 0 JSON-LD [RUNTIME], and **6 articles render duplicated** [RUNTIME] |
| **OWN-B** | Independent section landing management | VERIFIED COMPLETE | VERIFIED COMPLETE | **PARTIAL** | VERIFIED COMPLETE | **MISSING** | **PARTIAL** | Order now honoured (F2 half-fixed). `landing-grid.articleCount` ignored (`sectionLandingData.ts:72`); `landing-hero.heroImageUrl` structurally unconsumable (`SectionLandingHero.tsx:4-12`); 2 synthetic slots uncontrollable (`:84,93`) |
| **OWN-C** | Reusable block library | PARTIAL | VERIFIED COMPLETE | **PARTIAL** | N/A | **MISSING** | **PARTIAL** | `PremiumBlocks` genuinely shared; central `PageRenderer.tsx:12` exists. But 2 types defined twice (`:211/:391`, `:270/:408`), 6 declared types have no renderer, and detail/directory blocks ignore `slot.props` entirely (`DetailBlocks.tsx:16,22`) |
| **OWN-D** | Manual / auto / mixed content fetching | **PARTIAL** | PARTIAL | PARTIAL | N/A | **MISSING** | **PARTIAL** | Works in the live path via `pickedThenAuto` (`slotUtils.ts:20-31`) — manual, auto and mixed all function. But there is **no mode selector** (always mixed), no sort control, no filter control, and the documented engine is dead (§7.1) |
| **OWN-E** | Nav and footer changes appear publicly | VERIFIED COMPLETE | VERIFIED COMPLETE | **PARTIAL** | N/A | **MISSING** | **PARTIAL** | F8 fixed and verified (`SiteFooter.tsx:54,93-150`). But footer-column edits made in Header & Nav are **silently overridden** by `SiteConfig` (`:67-74`), so a real admin action produces no public change |
| **OWN-F** | Draft isolated from public | VERIFIED COMPLETE | VERIFIED COMPLETE | **VERIFIED COMPLETE** | PARTIAL | PARTIAL | **VERIFIED COMPLETE** | Double-gated (`previewGuard.ts:5-9`); threaded through all 11 Builder routes; anonymous draft access impossible [RUNTIME]. Residual: preview sets no `X-Robots-Tag` (`BLUEPRINT:182`) |
| **OWN-G** | Desktop / mobile preview | **MISSING** | N/A | N/A | N/A | **MISSING** | **MISSING** | No viewport state anywhere; editor grid fixed `lg:grid-cols-[1fr_300px]` (`AdminPageLayoutEditor.tsx:658`); preview iframe fixed height (`preview/route.ts:53`). F5 recommendation bullet 3 never implemented |
| **OWN-H** | Respects permissions and editorial rules | VERIFIED COMPLETE | VERIFIED COMPLETE | N/A | N/A | PARTIAL | **PARTIAL** | RBAC solid and runtime-verified; audit logging complete (8 Builder actions). But **no optimistic concurrency** on the interactive path (`:122-144`) and `required`/`max` unenforced server-side (§6.4) |

**Owner-requirement score: 1 of 8 VERIFIED COMPLETE (OWN-F). 6 PARTIAL. 1 MISSING (OWN-G).**

### 15.2 Blueprint design items — status, not grade

These carry `PROPOSED` / `DECISION` / `OPEN` status on an **unapproved** document (`BLUEPRINT:6`). They are reported as *design status*, never as owner-level failure.

| Req | Design requirement | Implementation state | Note |
|---|---|---|---|
| ARCH-01 | One **server-side** `PageRenderer` for all slots via one registry | **PARTIALLY DELIVERED** | Exists and is central (`PageRenderer.tsx:12`); the cited duplication (`getSlot`/`slotProp`/`renderPremiumBlock`) is **gone**. But it is `'use client'` (`:1`) and applies neither visibility nor order |
| ARCH-02 | Runtime registry `{ [type]: { Component, resolveData } }` | **NOT DELIVERED** | `registry.tsx:132-160` maps type→Component only; `resolveData` lives in four separate resolvers |
| ARCH-03 | `getLayoutForRender(pageKey)` returns draft for staff, else published | **DELIVERED, different shape** | Achieved via `isStaffDraftPreview()` + per-resolver branching rather than one function |
| ARCH-04 | `resolvePageData` with one `DeduplicationContext` per request | **NOT DELIVERED** | Dead `DeduplicationContext` (`contentSourceEngine.ts:58-71`); live dedup leaks in public [RUNTIME] |
| ARCH-05 | `SectionDef` extended with `families`, `contentSource`, `propsSchema` (zod) | **NOT DELIVERED** | No `contentSource` or `propsSchema` on `SectionDef` |
| ARCH-06 | R1 — unknown slot type skipped **and logged** | **HALF DELIVERED** | `PageRenderer.tsx:17` returns `null` silently — never crashes, never logs |
| ARCH-07 | R2 — no block-level `fetch`/`prisma` | **DELIVERED** | All data is server-resolved before render |
| ARCH-08 | R3 — every offered prop consumed; **contract-tested** | **VIOLATED, untested** | ~10 inert props (§6). The mandated contract test does not exist |
| ARCH-09 | R4 — exactly one `<h1>` per page from the hero | **[UNVERIFIED]** | No enforcing test; synthetic slots render headings outside slot control |
| ARCH-10 | `emptyBehavior` (`collapse`/`placeholder`) honoured by the renderer | **NOT DELIVERED** | Handled ad hoc per block (`null` returns) and by a synthetic slot |
| ARCH-11 | Per-block try/catch → log, render nothing | **NOT DELIVERED** | No per-block error boundary in `PageRenderer` |
| PAGE-01 | Six families with fixed contracts, M/O designation | **DELIVERED (declaration) / VIOLATED (enforcement)** | `required` is UI-only; `maxInstances` resolves from a first-wins map (§6.2) |
| PAGE-02 | No arbitrary pages | **DELIVERED** | `validatePageKey` (`:113-120`) restricts to 15 known keys |
| PAGE-04 | Dead `template:*` keys hidden until a page renders them | **DELIVERED differently** | Keys were made live (F3) instead of hidden; 3 of 5 detail blocks remain inert |
| CSE-01…CSE-12 | Content-source layer, modes, fallback policy, filters, limits, fixture filter in every resolver, admin/public filter parity | **NOT DELIVERED** | Engine dead (§7.1). CSE-10 is satisfied by `publicArticleWhere()` at 24 sites, but **not** by the Builder's candidate search (§12.8) |
| UX-01…UX-07 | Page-oriented IA; never offer an ineffective control; show where output appears; one status vocabulary; limits shown; no technical keys; plain-language source summary | **NOT DELIVERED** | Admin remains subsystem-tabbed; technical keys visible; ~10 ineffective controls offered; no Content Source panel |
| OWNR-01…OWNR-08 | One owner per element; Appearance retired; `SectionConfig.visible` removed from UI; duplicate-ownership contract test | **NOT DELIVERED** | All duplicates in §4.2 persist; `SectionConfig.visible` still offered and still inert |
| LIFE-01 | Draft→Preview→Publish→Revision for layouts, section identity, nav, footer | **PARTIAL** | Full chain for PageLayout only; nav/announcements/global blocks/`SectionConfig` have no draft layer |
| LIFE-02 | `WebsiteRevision` table for history and rollback | **DELIVERED, renamed** | `PageLayoutRevision` (`schema.prisma:1615`), scoped to layouts only |
| LIFE-04 | Preview HTML equals post-publish HTML apart from the preview bar | **[UNVERIFIED]** | No fidelity test exists |
| LIFE-05 | Preview at 1280 / 768 / 390 | **NOT DELIVERED** | = OWN-G |
| LIFE-06 | Scoped revalidation replacing blanket `rev()` | **NOT DELIVERED** | `revalidatePath('/','layout')` (`page-layout-actions.ts:9`) |
| LIFE-07 | Revalidate only on publish, not draft save | **VIOLATED** | `saveDraftAction:12` calls `rev()` (D-09) |
| LIFE-08 | Log when `getPublishedSections` falls back | **NOT DELIVERED** | Silent (`:90-92`) |
| SEC-01 | Optimistic concurrency via `expectedVersion` → conflict UI | **PARTIAL** | Scheduler only (`:295`); interactive path unprotected |
| SEC-02 | Every publish audited and versioned | **DELIVERED** | 8 audited actions (§12.2) |
| SEC-03 | Server-side validation per block | **PARTIAL** | §6.4 gaps |
| SEO-01 | Landing title/description from `buildMetadata` via `SectionConfig`/`PRIMARY_SECTIONS` | **DELIVERED** | Verified in live HTML [RUNTIME] |
| SEO-02 | Breadcrumb JSON-LD on landings | **DELIVERED** | 2 JSON-LD blocks on `/competition/` [RUNTIME] |
| SEO-03 | `ItemList` JSON-LD for feed blocks (PROPOSED) | **NOT DELIVERED** | unapproved |
| SEO-04 | No `noindex` on public pages; preview sends `X-Robots-Tag: noindex` | **VIOLATED (both halves)** | 7 legal pages serve `noindex` [RUNTIME]; preview sets no header |
| SEO-05 | Every rendered image has alt text from `imageAltText` or block `*Alt` | **PARTIAL** | Block `*Alt` props consumed; media `altText` never reaches OG/Twitter (§10.4) |
| TEST-01…TEST-05 | Registry contract test; render tests; engine tests; E2E lifecycle; **behaviour not source text** | **NOT DELIVERED** | §13. TEST-05 is the explicit policy that the suite still violates in 93% of its substring assertions |

### 15.3 Requirements that were never approved

Per §3.3, the following must **not** be scored as gaps: newsletter backend, site-wide appearance tokens/logo colours, the Appearance screen's retirement, scheduled publishing (implemented anyway), homepage `Organization`/`WebSite` JSON-LD, revision retention count, `/latest/` route, editor presence, sub-topic filtering, `website.edit` permission, `venueId`/`relatedEntityId` filters, arbitrary pages. Detail/directory **template** target state is **AMBIGUOUS** (§3.4) and is reported descriptively in §5 rather than graded.

---

## 16. Critical and High-Severity Defect Register

Severity: **CRITICAL** = live public harm, security exposure, or blocks the core goal outright · **HIGH** = essential capability absent or silently broken · **MEDIUM** = significant but contained.

IDs are new (`D-nn`). Where a defect corresponds to the previous audit's register, the prior ID is cross-referenced.

---

### D-01 — Internal revalidate endpoint accepts a secret hardcoded in a public repository
- **Severity:** CRITICAL (security) · *prior ID R-01*
- **Module:** `app/api/internal/revalidate/route.ts`, `lib/cms/scheduledPublishRunner.ts`
- **Expected:** the endpoint authenticates with a deployment-provided secret and fails closed if none is configured.
- **Actual:** falls back to the literal `'__scheduled_publish_revalidate__'`; the env var is absent from `.env` and `.env.example`, so the fallback is live, and the repo is public.
- **Source:** `route.ts:7` (`INTERNAL_SECRET`), `scheduledPublishRunner.ts:9` (`REVALIDATE_SECRET`), `route.ts:11-16` (`POST`).
- **Evidence:** [RUNTIME] `POST` with the published constant → `200 {"ok":true,"revalidated":"/"}`; wrong secret → `403`. [RUNTIME] env var absent from both files.
- **Root cause:** a development convenience default on an authentication boundary.
- **User impact:** any unauthenticated caller can flush the cache for an arbitrary `path` repeatedly — cache-stampede/DoS against origin rendering.
- **Correction:** require `INTERNAL_REVALIDATE_SECRET`; throw or 500 when unset; allowlist `path`. Change both files in one commit.
- **Dependencies:** none. **Regression risk:** HIGH if only one file is changed — the scheduler would stop revalidating silently.
- **Verification:** with the var unset, the old constant returns non-200; with it set, a scheduled publish revalidates successfully.

### D-02 — Builder canvas is a block list, not a rendered page
- **Severity:** CRITICAL (blocks the core goal) · *prior ID B-01*
- **Module:** `views/admin/AdminPageLayoutEditor.tsx`
- **Expected:** the central canvas shows the real page; the admin clicks a visible section to select it; property edits update the view (OWN-A/G, ARCH-01, UX-01).
- **Actual:** a `divide-y` list of text rows showing label, description, index and three buttons.
- **Source:** canvas `:716-765`; label `:744`; description `:748`; visibility pill `:750`; own comment `{/* ── Left: Canvas (block list) ── */}` `:660`; two-panel grid `:658` (despite a "three-panel" comment at `:657`); click-select on a row `:732`.
- **Evidence:** [SOURCE] `blockRegistry` is never imported; no iframe; no `PageRenderer` usage in the file. Independently consistent with an owner-supplied screenshot. **Not browser-verified by this audit.**
- **Root cause:** the Builder was built as a layout-data editor; visual rendering was never in its scope, and the preview iframe that *does* render real draft pages was placed on a separate route instead of in the canvas.
- **User impact:** the owner cannot see what they are building. This is the gap between "block management" and "visual website builder".
- **Correction:** mount the existing preview iframe (`preview/route.ts:38-64`) as the canvas; emit `data-slot-id` from `components/blocks/registry.tsx`; postMessage click→select; refresh on save.
- **Dependencies:** **D-03/D-04 must land first** — a visual canvas that visibly ignores edited props is worse than a list, because the admin can then *see* that nothing changed.
- **Regression risk:** MEDIUM — iframe + draft cookie + `sandbox` interaction; postMessage needs same-origin, which must be reviewed against existing XSS hardening.
- **Verification:** select a section in the rendered page → correct block selected; edit `kicker` → canvas reflects it.

### D-03 — Ten declared block properties are never consumed by public rendering
- **Severity:** CRITICAL (trust) · *prior ID B-02*
- **Module:** `lib/cms/sectionRegistry.ts` + the renderers named below
- **Expected:** ARCH-08/R3 — "Every `editableProps` key of every block offered for a family is consumed by that block's component."
- **Actual:** an admin can edit, save and publish ten properties with **zero** effect.
- **Source / evidence:** `detail-hero.heroImageUrl`, `.showImage` (`:442-443`, no renderer entry) · `detail-body` (`:455`, no renderer) · `detail-faq.title` (`:479`, no renderer) · `detail-related.title` (`:466`; resolver passes only `relatedArticles` at `detailTemplateData.ts:36,62`; `DetailBlocks.tsx:19` omits it; `RelatedArticles.tsx:15` hardcodes the heading) · `landing-hero.heroImageUrl` (`:343`; **structurally unconsumable** — `SectionLandingHero.tsx:4-12` has no image field) · `landing-grid.articleCount` (`:371`; resolver passes unsliced at `sectionLandingData.ts:72`; `LandingBlocks.tsx:138` hardcodes `columns={3}`) · `directory-hero.heroImageUrl` (`:510`; resolved at `directoryData.ts:37-38`, read by neither consumer) · `directory-grid.columns` (`:525`; no renderer).
- **Root cause:** the registry is the single source of advertised capability, with **no enforcement** that a renderer consumes what it advertises — and the mandated contract test was never written.
- **User impact:** every control in the Builder becomes untrustworthy once the owner discovers one that does nothing.
- **Correction:** per prop, consume it or delete the declaration. `landing-hero.heroImageUrl` needs a component change, not a wiring fix.
- **Dependencies:** D-04 (the enforcing test) should land first. **Regression risk:** MEDIUM — wiring a previously-ignored prop will change live pages for any owner who already saved a value; query `PageLayout.draftSections`/`publishedSections` for these keys before shipping.
- **Verification:** per prop, set a sentinel, publish, assert it appears in public HTML — or assert the declaration is gone.

### D-04 — No test proves an admin edit reaches public output
- **Severity:** CRITICAL (verification integrity) · extends *F11*
- **Module:** `tests/` (suite-wide)
- **Expected:** TEST-01/TEST-05 — a registry contract test and behaviour-based assertions.
- **Actual:** **≈1259 of ~1348 substring assertions (93%) target source text.** All 13 Builder/CMS batch files use the method and hold **611 of 1528 tests (40%)**. No test renders a block; no test traverses save→publish→render; no test asserts an `EntitySeo` override reaches `generateMetadata`.
- **Source / evidence:** [EXECUTED] `npx vitest run` → 77 files / 1528 tests / 0 failures / 116.94s. [SOURCE] `batch-a-renderer.test.ts:9,17`; `batch-c-revisions.test.ts:141,146,156,164,398,406,414,546`; `batch-t4-quick-access-helptext.test.ts:64,68`; `batch-h-integration.test.ts:61-64`; `e2e/page-builder.spec.ts:43`.
- **Root cause:** source-text assertion adopted as the default method for Builder work, combined with test *names* that claim behaviour while their assertions are file-scoped.
- **User impact:** indirect but the most consequential defect here — it is why D-03 and D-05 shipped, and why two prior reports declared features complete that were not. **Any fix shipped before this is corrected will be reported complete on the same evidence that has already failed twice.**
- **Correction:** add a parameterised registry contract test using `renderToStaticMarkup` (already works in the current `node` environment); add one end-to-end layout-causation test against the isolated DB; forbid `readFileSync` + `toContain` in tests whose names claim rendering.
- **Dependencies:** none — **this is the first thing to build.**
- **Verification:** deliberately break one wired prop; the suite must fail.

### D-05 — Editing a published legal page reverts the public page to hardcoded text
- **Severity:** CRITICAL (content integrity) · *prior ID L-01*
- **Module:** `lib/cms/infoPageService.ts`, `views/LegalPageView.tsx`, `prisma/schema.prisma`
- **Expected:** editing a published page keeps the published version live until the new draft is published.
- **Actual:** `saveInfoPageDraft` refuses the edit with `"Cannot edit a published page directly. Create a new draft revision."` — **but no revision mechanism exists.** The only path is `unpublishInfoPage`, which removes the page from public output; for the 7 legacy slugs the hardcoded config silently takes over, and for a new slug the URL 404s.
- **Source:** refusal `infoPageService.ts:64-66`; unpublish `:123-130`; published filter `:55-57`; fallback `LegalPageView.tsx:22-26`; 404 `:24`; schema has **no draft/published pair** `schema.prisma:1568-1583`.
- **Evidence:** [SOURCE]. The hardcoded fallback is **documented as intentional** (`schema.prisma:1565-1567`) — the defect is the absent draft model, not the fallback.
- **Root cause:** a status-enum workflow was modelled without draft/published coexistence.
- **User impact:** routine legal-page editing silently degrades or removes a live page.
- **Correction:** add draft/published columns (or a revision table) to `InfoPage`; allow draft edits while published content stays live.
- **Dependencies:** **blocks D-06**; enables info-page preview. **Regression risk:** MEDIUM — requires a migration on a live content table (S-1, approval required).
- **Verification:** publish, edit, confirm the public page still serves published content, publish again, confirm it updates. Must include the legacy-slug case.

### D-06 — Seven live legal pages serve `noindex` and show visitors a draft banner
- **Severity:** CRITICAL (live public harm) · *prior ID R-02*
- **Module:** `config/legalPages.ts`, `views/LegalPageView.tsx`
- **Expected:** public policy pages are indexable and carry no internal review notice.
- **Actual:** all seven serve `robots: noindex, nofollow` and render an amber "Draft — pending owner and legal review" banner to real visitors.
- **Source:** review flags `config/legalPages.ts:39,65,95,119,143,175,204`; noindex `LegalPageView.tsx:17`; banner `:46`.
- **Evidence:** **[RUNTIME]** `/about/` and `/terms/` both return `<meta name="robots" content="noindex, nofollow">` and contain the draft text.
- **Root cause:** a content-review flag wired to both indexing and a visitor-visible notice, left set on shipped content.
- **User impact:** About, Terms, Privacy, Contact, Editorial Policy, Corrections and Affiliate Disclosure are absent from search and visibly marked unfinished — directly damaging to a publication's credibility and to affiliate-disclosure compliance.
- **Correction:** seed published `InfoPage` rows and clear the flags, **or** gate the banner to staff-only.
- **Dependencies:** **D-05 first** — otherwise the first edit reverts the page. **Regression risk:** this is a **sign-off problem, not a code problem** — clearing `noindex` publishes legal prose. Must not be bundled into an engineering PR.
- **Verification:** [RUNTIME] each of the 7 URLs returns `index, follow` with no draft string.

### D-07 — Homepage renders duplicate articles
- **Severity:** HIGH (live public defect) · **new**
- **Module:** `lib/cms/homepageData.ts`
- **Expected:** an article appears at most once per page (ARCH-04, one `DeduplicationContext` per request).
- **Actual:** the `shownInHero` exclusion reaches only `latest-coverage`; category slots receive only their within-slot exclusion, and `shownInHero` is never extended past the hero.
- **Source:** built `:77`, pushed `:92` (the only push), passed `:103` only; not passed at `:106` or `:108`.
- **Evidence:** **[RUNTIME]** live homepage — `how-to-watch-nfr-streaming-cable-cord-cutters` renders **3×**; `ticket-advisory-consumer-protection-guide`, `las-vegas-in-december-insiders-logistics`, `hotel-district-breakdown-las-vegas-resort-corridor`, `cowboy-christmas-2026-buyers-handcrafted-curation`, `country-music-residencies-after-parties-roundup` each **2×**.
- **Root cause:** dedup was designed as a shared context in `contentSourceEngine.ts:58-71`, which is dead; the live replacement is a one-way array passed to a single slot.
- **User impact:** the homepage looks unedited and thin; the same story occupies several slots, wasting the most valuable real estate on the site.
- **Correction:** thread a shared exclusion set through `resolveHomepageSlots` (`:96-113`), extending after each slot and passing it at `:106` and `:108`.
- **Dependencies:** none. **Regression risk:** LOW — slots may show different articles after the fix, which is the intent.
- **Verification:** assert no article id appears twice across resolved homepage slots; re-run the live href count and expect all counts = 1.

### D-08 — `helpText` never reaches the DOM for most property types
- **Severity:** HIGH · *prior ID B-03*; the originating false pass
- **Module:** `views/admin/AdminPageLayoutEditor.tsx`
- **Expected:** declared `helpText` renders beside its field.
- **Actual:** rendered in **3 of 9** branches — `number` (`:439`), `featured` (`:499`), `image` (`:585`). Absent from the `text` fallback (`:600-608`), `textarea` (`:468`), `select` (`:454`), `boolean`, `color`. `quick-access.kicker` is type `text` (`sectionRegistry.ts:108`), so the one help string the project added is stored and never shown.
- **Evidence:** [SOURCE]. Confirmed as the subject of the false pass at `tests/batch-t4-quick-access-helptext.test.ts:64` (§13.5).
- **Root cause:** `helpText` was added per-branch rather than in shared field chrome; the guarding test asserted file-wide.
- **User impact:** the guidance intended to resolve "where do Quick Access links come from?" is invisible — the exact question OWN-D and UX-03 exist to answer.
- **Correction:** render `helpText` in shared field chrome so every type inherits it.
- **Dependencies:** none — smallest P0-adjacent fix in the project. **Regression risk:** NONE.
- **Verification:** the `quick-access` → `kicker` field shows its string in the rendered DOM, not merely in the registry.

### D-09 — Draft save flushes the entire public site cache
- **Severity:** HIGH · **new** (Nov 7 LIFE-07, unimplemented)
- **Module:** `app/admin/page-layout-actions.ts`
- **Expected:** LIFE-06/LIFE-07 — scoped revalidation, on publish only.
- **Actual:** `rev()` calls `revalidatePath('/', 'layout')` and is invoked by `saveDraftAction` — so saving a draft for `template:venue` invalidates the whole public site including the homepage.
- **Source:** `rev()` `:9`; `saveDraftAction` `:12`; also `:17,22,27`.
- **Evidence:** [SOURCE].
- **Root cause:** one blanket helper reused across all four actions, including the non-publishing one.
- **User impact:** every keystroke-level draft save triggers a full-site cache rebuild — latency spikes for visitors, and cache hit rates collapse while an admin is editing.
- **Correction:** remove `rev()` from `saveDraftAction`; scope the remaining calls to the affected `pageKey`'s routes.
- **Dependencies:** none. **Regression risk:** LOW — but verify the admin list view still reflects saved drafts without the broad invalidation.
- **Verification:** `scripts/cache-invalidation.mts` (currently NOT EXECUTED) extended to assert a draft save does not invalidate `/`.

### D-10 — Content Source Engine is dead code that misrepresents the architecture
- **Severity:** HIGH · *F4, unchanged*
- **Module:** `lib/cms/contentSourceEngine.ts` (402 lines)
- **Expected:** CSE-01 — every content block declares a `source` resolved by this engine.
- **Actual:** **zero importers**; unreachable by construction, since `parseContentSource` returns `null` without `props.sourceMode` (`:374-375`) and no `source*` prop exists anywhere in the registry.
- **Source / evidence:** [SOURCE] sole external reference is `tests/batch33-unit.test.ts:12-15`, a source-text assertion. Type exports have zero references.
- **Root cause:** built ahead of the registry props that would feed it; those props were never added.
- **User impact:** indirect — it is why sorting, filtering and dedup are not admin-controllable, and why four resolvers each re-implement fetching. It also **lacks fixture exclusion** (`:82,98,132`), so wiring it in as-is would regress a working protection.
- **Correction:** promote `lib/cms/slotUtils.ts` to the single entry point and **delete** the engine, or revive it behind real registry props. Keeping it is actively harmful: it looks like the architecture and a passing test vouches for it.
- **Dependencies:** D-07 ports its dedup idea into the live path. **Regression risk:** LOW for deletion; HIGH for naive revival (fixture bypass).
- **Verification:** no module imports it; the four source-text tests are removed with it; dedup and limits still pass behavioural tests.

### D-11 — Footer column edits in Header & Nav are silently overridden
- **Severity:** HIGH · *prior ID G-04*; *F7 family*
- **Module:** `components/SiteFooter.tsx`
- **Expected:** OWNR-03 — one authoritative owner per public element.
- **Actual:** `SiteConfig('footer').columns` **replaces** the two menu-driven columns when configured. An admin editing footer links in Header & Nav sees no public change, with no warning in either module. `DIRECTORY_LINKS` is additionally force-merged (`:65`) regardless of admin nav.
- **Source:** precedence `:67-74`; consumers `:63-65,69`; fallbacks `:11-21`.
- **Evidence:** [SOURCE].
- **Root cause:** two features shipped against the same output with precedence resolved in the renderer rather than at the model level.
- **User impact:** the clearest "I changed it and nothing happened" case in the product.
- **Correction:** pick one owner; if `SiteConfig` wins, migrate existing `NavigationItem` footer rows and mark them superseded in the UI.
- **Dependencies:** none. **Regression risk:** MEDIUM — resolving in favour of `SiteConfig` makes already-configured nav rows permanently inert; migrate rather than ignore.
- **Verification:** editing footer links in the admin produces a visible public change, **or** the UI states that Footer columns override it.

### D-12 — `newsletter-signup` renders a non-functional form publicly
- **Severity:** HIGH · *prior ID B-07*
- **Module:** `components/blocks/PremiumBlocks.tsx`
- **Expected:** `BLUEPRINT:126` — the block is **hidden** until a subscription backend exists.
- **Actual:** it is offered in the Builder and renders publicly with a `readOnly` input and a button with no handler.
- **Source:** `:102` (component), `:110` (`readOnly`), `:111` (no handler); registry entry `sectionRegistry.ts` homepage family.
- **Evidence:** [SOURCE].
- **Root cause:** the deferral was decided in the design document and never enforced in the registry.
- **User impact:** visitors enter an email address and nothing happens — a broken promise on the public site, and a plausible data-protection concern if it ever did capture.
- **Correction:** remove from the registry until a backend exists (the documented decision), or implement capture.
- **Dependencies:** none. **Regression risk:** LOW — removing it hides the block for any layout that includes it; check stored layouts first.
- **Verification:** the block is absent from the Builder's available types and from public HTML.

### D-13 — Homepage SEO is hardcoded and emits no structured data
- **Severity:** HIGH · *prior IDs S-01, S-02*
- **Module:** `app/(public)/page.tsx`, `prisma/schema.prisma`, `lib/seo.tsx`
- **Expected:** the homepage is admin-manageable like every other page family.
- **Actual:** literal title and description; no `getEntitySeo` call; **no `HOMEPAGE` member** in `LandingEntityType`; zero JSON-LD; no sitewide `Organization`/`WebSite` entity anywhere.
- **Source:** `app/(public)/page.tsx:14-23`; enum `schema.prisma:1540-1549`; JSON-LD generators `lib/seo.tsx:105-246`.
- **Evidence:** **[RUNTIME]** `/` emits **0** `application/ld+json` blocks while `/competition/`, `/competitors/` and `/venues/` each emit 2.
- **Root cause:** the homepage predates the landing-entity SEO model and was never migrated into it.
- **User impact:** the most-linked URL on the site has no admin SEO control and no entity markup.
- **Correction:** add `HOMEPAGE` to the enum (S-2, approval required), route `generateMetadata` through `mergeSeoMeta`, add `Organization`/`WebSite` JSON-LD (OPEN Q7 — needs owner approval).
- **Dependencies:** none technically; Q7 needs a decision. **Regression risk:** LOW — `mergeSeoMeta` already handles override→derived fallback.
- **Verification:** set a homepage SEO title in Landing SEO, publish, assert `<title>` changes [RUNTIME].

### D-14 — Nine of fifteen Builder page keys do not compose their page
- **Severity:** HIGH · *prior ID B-04*; *F2 + F3 aggregate*
- **Module:** `lib/cms/detailTemplateData.ts`, `lib/cms/directoryData.ts`, `views/ArticleAppendageSlots.tsx`, `views/DirectorySlots.tsx`
- **Expected:** a page listed in the Builder is composed by the Builder.
- **Actual:** 6 keys compose fully; 7 `template:*` keys append slots **below** fixed JSX and emit only `detail-related`/`detail-cta`; 2 `directory:*` keys render only `directory-cta`, with the hero read manually by each route.
- **Source:** `ArticleAppendageSlots.tsx:7`; allowlist `detailTemplateData.ts:33-41,48-67`; `DirectorySlots.tsx:6`; manual hero `competitors/page.tsx:32-33`.
- **Evidence:** [SOURCE].
- **Root cause:** per-family resolver allowlists rather than registry-driven rendering — so a visible, saved, schema-valid block silently vanishes.
- **User impact:** the Builder overstates its own reach; owners configure blocks on 9 page families that cannot render them.
- **Correction:** make allowlists registry-driven; then either promote `detail-hero`/`detail-body`/`detail-faq` to real blocks **or** formally adopt appendage-only and delete the three dead markers. **This needs an owner decision** — the Blueprint is silent on detail-template target state (§3.4).
- **Dependencies:** D-02 (canvas) makes the shortfall visible and should land first. **Regression risk:** MEDIUM — promoting detail blocks changes entity-page layout.
- **Verification:** per page key, add each offered block, publish, assert it appears; or assert it is not offered.

### D-15 — No optimistic concurrency on interactive editing
- **Severity:** MEDIUM (data loss) · *F10 residual*
- **Module:** `lib/cms/pageLayoutService.ts`
- **Expected:** SEC-01 — `expectedVersion` on save and publish, with a conflict UI.
- **Actual:** `version` is incremented in exactly one place (`:295`, inside `executeScheduledPublish`, guarded by `updateMany` at `:282`). `saveDraft` (`:130-141`) is a plain `upsert`; `publishLayout` (`:146`) takes no version.
- **Evidence:** [SOURCE], independently re-derived in this audit.
- **Root cause:** concurrency was implemented for the scheduler only.
- **User impact:** two admins editing one page silently overwrite each other with no warning and no recovery.
- **Correction:** accept `expectedVersion` in `saveDraft`/`publishLayout`, increment on write, return a conflict result the editor surfaces.
- **Dependencies:** none. **Regression risk:** LOW. **Verification:** two concurrent saves with a stale version — the second must fail with a conflict, not overwrite.

### D-16 — Revision number is computed outside its transaction
- **Severity:** MEDIUM · **new**
- **Module:** `lib/cms/pageLayoutService.ts`
- **Expected:** revision numbering is atomic with the publish.
- **Actual:** `nextRevisionNo` is a read-then-increment (`:328-335`) `await`ed **while constructing** the `$transaction([...])` array (`:167`), so the read happens outside the transaction boundary.
- **Evidence:** [SOURCE].
- **Root cause:** `await` inside an array literal passed to `$transaction` evaluates before the transaction opens.
- **User impact:** concurrent publishes of one `pageKey` can compute the same number and collide on `@@unique([pageKey, revisionNo])` (`schema.prisma:1626`) — **fails safe** (no corruption) but surfaces an opaque constraint error.
- **Correction:** compute the number inside an interactive transaction, or derive it from a DB sequence.
- **Dependencies:** pairs naturally with D-15. **Regression risk:** LOW. **Verification:** concurrent publishes produce consecutive revision numbers with no constraint error.

### D-17 — Two block types are defined twice, and the stricter limit is unreachable
- **Severity:** MEDIUM · **new**
- **Module:** `lib/cms/sectionRegistry.ts`, `lib/cms/pageLayoutService.ts`
- **Expected:** one definition per block type; the limit shown is the limit enforced.
- **Actual:** `rich-text-block` is defined at `:211` and `:391`; `cta-banner` at `:270` and `:408`, with divergent `maxInstances`. `getAvailableBlockTypes` dedupes **first-wins** (`:588-598`, verified) and `validateBlockLimits` resolves from that deduped map (`pageLayoutService.ts:57-58`), so on section-landing pages the **homepage** limits silently apply.
- **Evidence:** [SOURCE] — line numbers confirmed directly in this audit.
- **Root cause:** the same block was added to two family arrays instead of declaring multi-family membership (ARCH-05's `families` field was never implemented).
- **User impact:** the admin is shown a limit that is not enforced; the stricter declared limit can never apply.
- **Correction:** single definition with a `families` array. **Dependencies:** none. **Regression risk:** LOW. **Verification:** adding blocks beyond the landing limit is rejected with the landing limit's message.

### D-18 — `detail-related.articleCount` is unclamped
- **Severity:** MEDIUM (reliability) · **new**
- **Module:** `lib/cms/detailTemplateData.ts`
- **Expected:** the declared `max: 6` is enforced.
- **Actual:** `Number(…) || 3` with **no clamp** (`:34`, `:59`) feeds a Prisma `take` — an arbitrary saved value becomes an unbounded query. `0` also silently becomes `3`.
- **Evidence:** [SOURCE]. `PropDef.max` is never enforced server-side anywhere (§6.4).
- **Root cause:** homepage and landing clamp via `numProp` (`slotUtils.ts:9`); the detail resolver does not use it.
- **User impact:** a large value (saved through the UI or a crafted action) issues an unbounded query on every entity-page render.
- **Correction:** use `numProp` with the declared max; enforce `PropDef.max` in `saveDraft`.
- **Dependencies:** none. **Regression risk:** LOW. **Verification:** a saved value of 1000 yields at most 6 items and the save is rejected.

### D-19 — Prop validation is string-only with a token XSS check and no whitelist
- **Severity:** MEDIUM (security hardening) · **new**
- **Module:** `lib/cms/pageLayoutService.ts:29-53`
- **Expected:** SEC-03 — server-side validation per block.
- **Actual:** checks run only when `typeof val === 'string'` (`:38`); XSS is `/<script/i` **alone** (`:40`) so `<img onerror>`/`<svg onload>` pass; URL checks apply only to keys matching `/url$/i` (`:43-49`); `select` options are unvalidated; non-string props are entirely unchecked; `props: z.record(z.string(), z.unknown())` (`:21`) persists arbitrary undeclared keys; `required` is not enforced; `:48` is dead code.
- **Evidence:** [SOURCE].
- **Root cause:** validation written against the string props that existed at the time.
- **User impact:** limited today — React escapes text children, and the `*Url` props that reach `<img src>`/`<a href>` *are* scheme-checked. The real exposure is unbounded storage of undeclared keys and unenforced contracts.
- **Correction:** validate per `PropDef` (type, max, options), whitelist declared keys, enforce `required`.
- **Dependencies:** complements D-17/D-18. **Regression risk:** MEDIUM — a strict whitelist would reject existing rows carrying stray keys; audit stored props first.
- **Verification:** an undeclared key is rejected; an out-of-range number is rejected; a non-option `select` value is rejected.

### D-20 — Database failure silently renders default layouts
- **Severity:** MEDIUM (observability) · *prior ID L-06*; Nov 7 LIFE-08
- **Module:** `lib/cms/pageLayoutService.ts`
- **Expected:** an empty layout and a failed query are distinguishable.
- **Actual:** `getPublishedSections`/`getDraftSections` swallow every error and return `buildDefaultSlots` (`:90-92`, `:102-104`).
- **Evidence:** [SOURCE].
- **Root cause:** a defensive fallback with no logging.
- **User impact:** a DB fault presents as "the layout reset itself", and **during remediation it will mask regressions** — which is why it is listed early despite MEDIUM severity.
- **Correction:** log and distinguish; keep the fallback for genuinely empty layouts only.
- **Dependencies:** none. **Regression risk:** NONE. **Verification:** force a query failure; assert a log entry and a distinguishable result.

### 16.1 Medium and lower, by reference

Carried from §§6–12 without individual cards, with prior IDs where applicable: scheduler not deploy-safe (*L-03*) · scheduler revalidates `localhost` (*L-04*) · revisions unbounded (*L-05*, OPEN Q5) · draft mode session-wide (*L-07*) · dead preview params (*L-08*) · no draft layer for nav/announcements/global blocks/`SectionConfig` (*L-09*, F6) · logo uneditable (*G-01*, OPEN Q6) · Appearance tab misnamed (*G-02*, F7) · footer legal disclaimer uneditable-by-design but unlabelled (*G-03*) · footer policy links code-derived (*G-05*) · announcement cap 2 (*G-07*) · Site Identity inert (*C-01*) · `SectionConfig.heroImage`/`visible` inert (*C-02*) · 3 dead global-block placements (*C-03*) · 4 dead ad scopes (*C-04*) · `Category.description` inert (*C-05*) · discipline content partly unowned (*C-06*) · section identity code-only (*C-07*) · category copy override missing (*C-08*) · Landing SEO absent from nav (*C-09*) · coverage/search not draft-aware (*D-01 prior*) · `ArticleSeo.structuredDataType` dead (*S-04*) · no OG/Twitter image alt (*S-05*) · directory + coverage SEO hardcoded (*S-06*) · InfoPage lacks canonical/ogImage/robots (*S-07*) · relative competitor/venue JSON-LD `url` (*S-08*) · venue social-image fallback (*S-09*) · no social-card preview (*S-10*) · weak effective-indexability signal (*S-11*) · no admin redirects (*S-12*) · `robots.txt` uneditable (*S-13*) · validator threshold alignment [UNVERIFIED] (*S-14*) · `/info/` absent from sitemap (*S-03*) · preview sends no `X-Robots-Tag` (SEO-04) · `richtext` is a textarea · `landing-stat-pills.pills[]` inert · `showImage` type mismatch · `featuredIds` missing from 4 defaultProps · 2 synthetic slots uncontrollable · admin candidate search lacks the public fixture filter (CSE-12).

---

## 17. Target Architecture Assessment

The proposed incremental architecture is **sound and achievable**. Assessment only — nothing below was implemented.

### 17.1 Preserve

| Component | Why |
|---|---|
| `PageLayout` JSON slot storage | `SectionSlot` (`sectionRegistry.ts:9-15`) with an open `props` record is **forward-compatible**: new props are additive and existing rows fall back to defaults. This is the design's most valuable property |
| The SEO core | `lib/seo.tsx:53` + `lib/seo/{robots,policy,canonical}.ts` + `entitySeoService.mergeSeoMeta`. Single emitter, single policy, sitemap re-derives from the same sources. Verified in live HTML. **Extend; never fork** |
| Article SEO depth | Full override consumption + `Article`/`Person`/`Organization`/`BreadcrumbList` graph [RUNTIME] |
| The S1–S5 corrections | All five genuinely fixed, including the non-obvious additive-only noindex guarantee |
| `PageLayoutRevision` + restore-to-draft-only | `pageLayoutService.ts:371-377` — correct, safe semantics |
| Draft isolation | Double-gated (`previewGuard.ts:5-9`); threaded through all 11 Builder routes; anonymous access impossible [RUNTIME] |
| Audit logging | 8 Builder actions + complete coverage across website-control services (§12.2) |
| Block management | add/remove/reorder/duplicate/hide + drag-and-drop with `maxInstances`/`required` guards and order renormalisation |
| **The preview iframe mechanism** | `preview/route.ts:38-64` already renders real draft pages for all 15 keys. **Mount it; do not rebuild it** |
| `lib/fixturePolicy.ts` | Real, env-gated, applied at 24 sites |
| Isolated-test-DB guard | `decideTestDatabase()` — verified working [EXECUTED] |
| RBAC | `lib/auth/{rbac,permissions}.ts`, default-deny, runtime-verified |
| Competition coverage | Admin-editable end-to-end (`competitionService.ts:79-278` → `:317-325`) |
| `app/go/[id]` affiliate redirect | DB-only destination, re-validated, safe fallback, non-blocking click record |
| The 83-model data layer and `lib/cms/` boundary | Sound |

### 17.2 Repair

D-01 secret · D-03 ten inert props · D-04 test methodology · D-05 InfoPage lifecycle · D-06 legal pages · D-07 dedup · D-08 helpText · D-09 cache scope · D-13 homepage SEO · D-15 concurrency · D-16 revision race · D-17 duplicate definitions · D-18 clamp · D-19 validation · D-20 observability.

### 17.3 Consolidate

| Consolidation | From → To | Blocker |
|---|---|---|
| Content resolution | 4 resolvers + 1 dead engine → `slotUtils.ts` as the single entry point | Hardcoded filter maps (`homepageData.ts:47-51,105`); no `source*` registry prop |
| Block prop contract | `slot.props` (homepage/landing) vs `data` (detail/directory) → one convention | Must pick one; detail/directory renderers need signature changes |
| Visibility + ordering | 4 resolvers → `PageRenderer` | Low risk; prerequisite for one rendering contract |
| Renderer execution | `'use client'` → server component | 4 blocks use `useRouter` (`registry.tsx:34,52,88`); lift to `<Link>` |
| Block definitions | 2 duplicated types → one definition with `families` | ARCH-05's `families` field was never implemented |
| Homepage hero | `editorial-hero` + Appearance intro banner → the slot | **Migrate 21 stored `introBanner*` fields first** |
| Footer columns | `SiteConfig` + `NavigationItem` → one owner | **Migrate existing nav footer rows** |
| Section identity | `SectionConfig` + `landing-hero` props → `SectionConfig` | Low risk |

### 17.4 Missing

A visual canvas (D-02) · responsive preview (OWN-G) · a Content Source panel (UX-07) · page-oriented admin IA (UX-01) · a registry contract test (TEST-01) · admin-managed redirects · site-wide theme tokens (deferred by design) · global SEO defaults · sitewide `Organization`/`WebSite` JSON-LD (OPEN Q7) · `ItemList` JSON-LD (unapproved).

### 17.5 Requires a product decision

1. **Detail-template target state** — promote `detail-hero`/`detail-body`/`detail-faq` to real blocks, or formally adopt appendage-only and delete them? The Blueprint is silent (§3.4). **This is the single largest scope question.**
2. **Hybrid Management (Option C)** — undefined in the repository (§19 B-1).
3. The ten OPEN questions Q1–Q8 plus the two ambiguities in §3.4.
4. Whether `SectionConfig` gains draft state (LIFE-01 vs `BLUEPRINT:52` — a direct conflict).
5. Revision retention count (OPEN Q5).
6. Whether to keep or drop `ArticleSeo.structuredDataType`.

### 17.6 Requires schema change

See §12.10 (S-1…S-6) — all flagged **approval required**. Only S-1 and S-2 are needed for the P0 set.

### 17.7 What could break during migration

Ranked: wiring previously-inert props changes live pages for owners who already saved values (D-03) · retiring Appearance without migrating 21 `introBanner*` fields blanks the homepage banner · resolving footer ownership makes configured nav rows inert · a strict prop whitelist rejects rows with stray keys (D-19) · promoting detail blocks changes six entity-page families at once · `InfoPage` migration touches live content · removing `newsletter-signup` hides it from layouts that include it · making `PageRenderer` a server component breaks the four `useRouter` blocks until navigation is lifted.

### 17.8 Backward compatibility of published configurations

**Published configurations remain compatible throughout**, provided three rules hold: (1) `SectionSlot`'s shape is unchanged — only `props` keys are added; (2) every new prop has a default so existing rows render identically; (3) removing a block type is preceded by a query over `PageLayout.draftSections`/`publishedSections` for that type. The open `props` record means no migration of layout JSON is required for any item in §18.

---

## 18. Dependency-Aware Corrective Workstreams

**Sequencing principle:** the suite cannot currently distinguish a fix from a no-op (D-04). **Workstream 0 must land first** — otherwise every later item will be reported complete on the same evidence that has already failed twice.

### Workstream 0 — Make verification capable (blocks everything)
1. **D-04** — parameterised registry contract test using `renderToStaticMarkup` (already works under `environment: 'node'`); one end-to-end layout-causation test against the isolated DB; forbid `readFileSync` + `toContain` in tests claiming rendering.
2. **D-20** — log and distinguish the `buildDefaultSlots` fallback, so later regressions are not masked.

*No dependencies. No migration. Deliberately break one wired prop and confirm the suite fails.*

### Workstream 1 — Urgent, independent
3. **D-01** — require the revalidate secret; fail closed; allowlist `path`. Both files in one commit.
4. **D-08** — render `helpText` in shared field chrome.
5. **D-07** — thread a shared exclusion set through `resolveHomepageSlots`.
6. **D-09** — remove `rev()` from `saveDraftAction`; scope the rest.
7. **G-02 rename** — relabel "Appearance" as "Homepage Intro Banner" (truth-in-labelling; real theming deferred).

*All independent of each other and of Workstream 0, except that 5 should carry a dedup test from WS0.*

### Workstream 2 — Property integrity (prerequisite for the canvas)
8. **D-03** — consume or delete each of the ten props. Audit stored values first. `landing-hero.heroImageUrl` is a component change.
9. **D-17** — single definition per block type with a `families` array.
10. **D-18** — clamp via `numProp`; **D-19** — validate per `PropDef`, whitelist declared keys, enforce `required`.
11. **D-12** — remove `newsletter-signup` from the registry (the documented decision) or implement capture.
12. Resolve the inert config surfaces: `C-01`, `C-02`, `C-05`.

*Depends on WS0 for its acceptance evidence.*

### Workstream 3 — The visual canvas (the core goal)
13. Emit `data-slot-id` from `components/blocks/registry.tsx`.
14. Mount the existing preview iframe as the canvas panel.
15. postMessage click-to-select, iframe → parent, mapped to slot id.
16. **OWN-G** — viewport switcher at 1280 / 768 / 390.
17. Re-render on property change (debounced draft save + iframe refresh).

*Depends on WS2 — a visual canvas that visibly ignores edited props is worse than a list. Scope to the homepage first (§18.1).*

### Workstream 4 — Content integrity
18. **D-05** — `InfoPage` draft-alongside-published (**migration S-1, approval required**).
19. Info-page preview (depends on 18).
20. **D-06** — seed legal `InfoPage` rows and clear the pending flags — **after owner sign-off**, not as an engineering task.

### Workstream 5 — SEO completion
21. **D-13** — `HOMEPAGE` enum (**S-2**) + route `generateMetadata` through `mergeSeoMeta`; `Organization`/`WebSite` JSON-LD **pending Q7**.
22. **S-03** — sitemap from published InfoPages.
23. **S-06** — directory + coverage SEO via EntitySeo.
24. **S-07** — InfoPage SEO columns (**S-3**).
25. **S-05**, **S-08**, **S-09** — OG alt, absolute JSON-LD `url`, venue image fallback.
26. SEO-04 — `X-Robots-Tag: noindex` on preview responses.

### Workstream 6 — Builder coverage *(blocked on a product decision)*
27. Make resolver allowlists registry-driven.
28. **D-14** — then promote the three detail blocks **or** formally adopt appendage-only and delete them. **Requires the §17.5-1 decision.**

### Workstream 7 — Reliability and consolidation
29. **D-15**, **D-16** — `expectedVersion` + atomic revision numbering.
30. **D-10** — promote `slotUtils.ts`, delete the dead engine and its four source-text tests.
31. Promote hardcoded filter maps to slot props (enables admin control of category/section/discipline filtering and sorting).
32. `L-03`, `L-04` scheduler; `L-05` retention (**Q5**); `L-09` draft layer for chrome.
33. **D-11** — resolve footer ownership **with migration**.

### Workstream 8 — Global control and UX
34. `G-01` logo (**Q6**), `G-03` label the locked disclaimer, `G-05` policy links from InfoPage, `G-07` announcement cap.
35. UX-01 page-oriented IA; UX-07 Content Source panel; `C-09` Landing SEO in the nav.

### 18.1 Smallest end-to-end vertical slice

**Target: the homepage.** It already composes fully (`HomeView.tsx:41`), has 15 blocks, the richest working prop set, and a working preview URL.

1. WS0 item 1, scoped to homepage blocks — the contract test that proves props reach HTML.
2. **D-08** — one-line-class fix making Task 4 actually true.
3. **D-07** — dedup fix, with the test from step 1 asserting no duplicate ids.
4. **D-02 core** — `data-slot-id`, iframe canvas for `pageKey=homepage`, click-to-select, refresh on save.
5. **OWN-G minimal** — three viewport widths on the iframe container.

**Touches:** `tests/` (new), `AdminPageLayoutEditor.tsx`, `components/blocks/registry.tsx`, `lib/cms/homepageData.ts`. **No migration. No schema change.** If it works on the homepage, section landings are configuration; detail families remain the separate decision in §17.5-1.

---

## 19. Risks, Open Decisions and Blockers

### 19.1 Blockers

| ID | Blocker | Impact |
|---|---|---|
| **B-1** | **"Hybrid Management (Option C)" is undefined in the repository.** No content match across 274 markdown files; no enumeration of three management options. The only "Option A/B" hit is unrelated (`NFRGUIDE-SEO-ENGINE-COMPREHENSIVE-AUDIT.md:296`, about a `PAGE` enum value) | Cannot assess whether the implementation matches the selected management model. **The owner must supply the definition.** This audit did not infer it |
| **B-2** | **Developer Master Requirements v2.0 is absent** — only a banner line in 7 files | No authoritative requirement baseline. §15 uses owner requirements A–H as the best available substitute |
| **B-3** | **Detail-template target state is undefined** (§3.4) | Workstream 6 cannot be scoped. Six entity page families are affected |
| **B-4** | **Legal-page content needs owner/legal sign-off**, not engineering | D-06 cannot ship without it, and D-06 is a live public defect |

### 19.2 Open decisions

The Blueprint's Q1–Q8 (`:666-673`) remain open: editor `website.edit` permission · sub-topic filtering · editor presence · `/latest/` route · revision retention · site-wide appearance tokens · homepage `Organization` JSON-LD · scheduled publishing (**already implemented ahead of this decision**). Plus: LIFE-01 vs `BLUEPRINT:52` on `SectionConfig` drafting; keep or drop `ArticleSeo.structuredDataType`; which owner wins for footer columns.

### 19.3 Technical risks

1. **Stored values for inert props** — wiring D-03 changes live pages on next publish. Query stored layouts first.
2. **`landing-hero.heroImageUrl` is structurally unconsumable** — `SectionLandingHero.tsx:4-12` has no image field. A component change, not a one-liner.
3. **Legal text is a governance risk, not a code risk** — clearing `noindex` publishes unreviewed prose.
4. **Iframe canvas security** — the preview iframe uses `sandbox="allow-same-origin allow-scripts"` (`preview/route.ts:64`); postMessage needs same-origin. Review against existing XSS hardening, especially given D-19's token XSS check.
5. **Scheduler replacement is deployment-shaped** — depends on hosting, which is out of scope here. Optimistic locking contains the race, so this is reliability, not correctness.
6. **Silent DB fallback will mask regressions** during remediation — hence D-20 in Workstream 0.
7. **Footer dual ownership will generate false bug reports** until resolved; "I edited the footer and nothing changed" is currently expected behaviour.
8. **The dead engine is a trap for a new agent** — it looks like the content architecture and a passing test vouches for it. Delete or revive explicitly; do not leave it.
9. **Promoting detail blocks changes six page families at once** — stage per family.
10. **No test asserts prop→HTML causation today**, so any claim of completion before Workstream 0 is unverifiable by construction.

---

## 20. Recommended Verification and Acceptance Criteria

### 20.1 The standard

**A control is complete only when changing it in the Admin changes the public HTML, and a test proves it.** Source-text assertions do not satisfy this. 1528 green tests coexisted with ten inert props, an invisible `helpText` and six duplicated articles in public output.

### 20.2 Acceptance per defect

| ID | Acceptance evidence required |
|---|---|
| D-01 | With the env var unset, `POST /api/internal/revalidate/` using the old constant returns non-200. With it set, a scheduled publish revalidates. Both files changed in one commit |
| D-02 | Admin opens Page Builder → sees the rendered homepage → clicks the hero → hero block selected → edits `kicker` → canvas shows the new kicker |
| D-03 | Per prop: set a sentinel, publish, assert it in public HTML — **or** the declaration is deleted in the same PR. No prop may remain declared-and-unconsumed |
| D-04 | A deliberately broken wired prop makes the suite fail. Suite reports ≥1 test that renders a block and ≥1 that traverses save→publish→render |
| D-05 | Publish an info page, edit it, **assert the public page still serves published content**, publish, assert it updates. Must include the legacy-slug case |
| D-06 | [RUNTIME] each of the 7 legal URLs returns `index, follow` with no "Draft — pending" string |
| D-07 | [RUNTIME] every `/articles/…` href on the homepage appears exactly once; plus a resolver test asserting no duplicate ids across slots |
| D-08 | The `quick-access` → `kicker` field shows its help string **in the rendered DOM** |
| D-09 | A draft save does not invalidate `/`; a publish does |
| D-10 | No module imports `contentSourceEngine`; its four source-text tests are removed with it; dedup and limits still pass behavioural tests |
| D-11 | Editing footer links in the admin produces a visible public change, **or** the UI states Footer columns override it |
| D-12 | Absent from the Builder's available types and from public HTML |
| D-13 | Set a homepage SEO title in Landing SEO, publish, assert `<title>` changes; `/` emits `Organization` + `WebSite` JSON-LD (if Q7 approved) |
| D-14 | Per page key: add each offered block, publish, assert it appears — or assert it is not offered |
| D-15 | Two concurrent saves with a stale version: the second fails with a conflict, not an overwrite |
| D-16 | Concurrent publishes produce consecutive revision numbers with no constraint error |
| D-17 | Adding blocks beyond the landing limit is rejected **with the landing limit's message** |
| D-18 | A saved value of 1000 yields at most 6 items, and the save is rejected |
| D-19 | An undeclared prop key, an out-of-range number and a non-option `select` value are each rejected |
| D-20 | A forced query failure produces a log entry and a result distinguishable from an empty layout |
| OWN-G | Viewport switch changes iframe width; a mobile-only layout difference is visible |

### 20.3 Regression suite to institute

1. **Prop-causation** — parameterised over every `editableProps` entry. Would have caught D-03 and D-08.
2. **Layout causation** — one test: `saveDraft` → `publishLayout` → `getPublishedSections` → resolver → `renderToStaticMarkup` → assert sentinel.
3. **Metadata causation** — per family, an `EntitySeo` override through the route's `generateMetadata`.
4. **Dedup invariant** — no article id twice in a resolved page. Would have caught D-07.
5. **Sitemap/robots consistency** — no URL simultaneously indexable and absent from the sitemap. Would have caught S-03.
6. **Draft isolation** — anonymous requests never return draft content (currently passing; protect it).
7. **Ownership uniqueness** — fail if two props claim the same public element (OWNR-08). Would have caught D-11.
8. **Hardcoded-string guard** — fail on a new literal user-facing heading in a block component.
9. **Responsive/visual** — currently zero coverage.

### 20.4 Commands available

`npm run typecheck` · `npm run test` · `npm run test:routes` · `npm run test:cache` · `npm run test:migration` · `npm run test:e2e` · `npm run build`

The last four were **NOT EXECUTED** in this audit (§13.1) and should be wired into CI with the new causation tests before remediation begins.

---

## Appendix A — Audit Integrity Statement

**Performed:** Git baseline verification · source reading at HEAD `fd4fb10` across 30 public routes, 25 admin pages, 25 server-action modules, 41 CMS services, the SEO layer, the block registry, four resolvers and the Builder editor · schema review of 83 models and 19 migrations · documentation review of the Blueprint, the Site Builder audit (F1–F11), the SEO engine audit and the Nov 7 functional audit · runtime verification against a locally running instance (rendered `<head>` on five page families, `robots.txt`, `sitemap.xml` composition and coverage, legal-page robots and banner state, homepage article-duplication counts, admin route protection, anonymous draft-access attempt, and one confirmed exploit of the revalidate endpoint) · executed `npx vitest run` and `npx tsc --noEmit`.

**Not performed:** browser/UI verification (no credentials) · Playwright E2E (needs build + seeded DB + admin fixtures) · the 11 `scripts/*.mts` harnesses · tracing `seo-intel/rules.ts` thresholds against `lib/seo/policy.ts` (S-14) · distinguishing competitor/venue sitemap coverage from empty local data.

**One correction made during this audit, recorded for transparency:** audit-log coverage was initially assessed as absent for the Page Builder after a grep on the wrong symbol. Verification showed the opposite — `pageLayoutService.ts` logs eight distinct actions and coverage across website-control services is complete. The false finding was withdrawn before reporting. It is noted here because it is the same class of error — accepting a grep as evidence — that this report identifies as the project's central methodological problem.

**Integrity:** no application code, database record, configuration, migration, dependency or Git state was modified. No commit was created. The working tree was clean at audit start and contains only this report at audit end. The single state change was one cache revalidation against the local development server, performed to confirm D-01.

