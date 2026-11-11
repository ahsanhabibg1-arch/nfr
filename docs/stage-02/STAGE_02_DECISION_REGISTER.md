# Stage 02 — Architecture Decision Register

**Stage:** 02 of 10 (max 12) · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`
**Purpose:** separate decisions only the owner can make from engineering work that needs no approval.

> **Most of this register is still unapproved.** Every recommendation is a proposal unless marked APPROVED below. No decision was silently adopted, and no unresolved decision was treated as settled anywhere in the Stage 02 deliverables.

---

## Owner approvals received

Recorded as they arrive. Historical analysis above is preserved unchanged; approval is additive, so the original options and rationale remain auditable.

### 2026-11-09 — D-15 and D-01 **APPROVED** (at Stage 03 authorization)

The owner approved **Controlled Hybrid Management (Option C)** when authorizing Stage 03, resolving the D-15 blocker and ratifying D-01. The approved model, as stated by the owner:

1. The structured CMS is authoritative for factual editorial and entity records.
2. The Website Builder controls presentation, approved block composition, visibility, order, layout, and content selection **through entity references**.
3. SEO Intelligence remains centralized in the existing SEO services.
4. **Detail pages retain shared structured editorial templates, with optional approved appendage sections.**
5. No free-form, Elementor-style builder.
6. Existing working systems are preserved — no parallel renderer, SEO engine, or content database.

**Consequences for this register:**

| ID | Previous status | New status |
|---|---|---|
| **D-15** | BLOCKER — undefined in the repository | **RESOLVED.** Option C is now defined by the owner's statement above and matches the model specified in `STAGE_02_HYBRID_BUILDER_ARCHITECTURE.md` §2 |
| **D-01** | Pending — ratify the hybrid boundary | **APPROVED as specified**, including the references-not-copies rule |
| **D-02** | Pending — recommendation was Option B | **APPROVED as Option B.** Point 4 of the approval ("shared structured editorial templates, with optional approved appendage sections") is Option B. Stage 07 is therefore unblocked, and the three inert detail markers (`detail-hero`, `detail-body`, `detail-faq`) are confirmed for removal rather than promotion |
| **D-03** | Pending — template-level layout | **IMPLICITLY APPROVED.** "Shared structured editorial templates" settles layout at template level; entity-level overrides remain limited to SEO and FAQ |

**Still requiring owner approval:** D-04 (content engine retire/integrate — blocks Stage 05), D-05, D-06, D-07, D-09 (publication half), D-10 is engineering, D-11, D-12, D-13, D-14. The approval above does **not** extend to these, to unrelated schema migrations, or to any feature implementation.

### 2026-11-09 — D-04 and D-11 **APPROVED** (at Stage 05 authorization)

The owner approved both as final for Stage 05. Historical analysis above is preserved unchanged.

| ID | Decision as approved | Implementation |
|---|---|---|
| **D-04** | **Retire** the unused `lib/cms/contentSourceEngine.ts` and consolidate the working `slotUtils` and resolver pathways into one coherent content-source contract. **Do not integrate or activate the obsolete engine.** | **DONE in Stage 05.** The 402-line engine was deleted. Its one valuable idea — a per-request deduplication context — was reimplemented as `SelectionContext` in `lib/cms/slotUtils.ts`, the pathway that actually serves pages. Nothing else was carried over, and no parallel engine was created. The six source-text tests that asserted symbols inside the dead file were replaced with behavioural assertions on the live contract. |
| **D-11** | **Remove** the non-functional `newsletter-signup` block from the Builder's available registry until a working subscription backend and consent workflow are approved. **Do not create a backend or collect visitor email addresses.** | **DONE in Stage 05.** The block is absent from every family's block library and from all default layouts, and has no renderer — so a legacy slot renders nothing: no form, no input, no submit control, no data path. Its definition is **retained** marked `retired` so a layout stored before the retirement stays valid and editable. No backend was created, no provider introduced, and a test asserts no newsletter or subscription API route exists. |

**Rationale recorded for D-04's chosen option.** Integration was rejected because the engine was unreachable by construction (it required a `sourceMode` prop that existed nowhere in the registry) and, critically, it omitted the fixture-exclusion filter the live path applies at 24 call sites — so wiring it in unchanged would have regressed a working protection.

**Still requiring owner approval after Stage 05:** D-05 (footer ownership), D-06 (appearance controls), D-07 (revision retention), D-09 (info-page publication), D-12 (scheduler/deployment), D-13 (legal content), D-14 (sitewide JSON-LD). D-10 remains engineering. These approvals do **not** extend to those, to schema migrations, or to Stage 06 implementation.

### 2026-11-11 — D-05, D-06, D-07 and D-12 **APPROVED WITH LIMITATIONS** (at Stage 09 authorization)

The owner approved all four at Stage 09 authorization. Historical analysis below is preserved unchanged. **Each approval carries explicit limitations, and those limitations are part of the approval** — an approval read without them would authorise work the owner did not authorise.

| ID | Decision as approved | Limitations stated in the approval | Implementation status at Stage 09 preflight |
|---|---|---|---|
| **D-05** | **`SiteConfig` is the authoritative owner of footer columns.** | Existing navigation/footer data must be **safely inventoried and migrated before ownership changes**. **No silent loss of existing links.** **No production data migration without separate authorization.** | **NOT IMPLEMENTED.** Stage 08 audited and pinned the current two-owner behaviour by test but changed nothing, because D-05 was unapproved at the time. The inventory-and-migrate prerequisite is now the gating item |
| **D-06** | **Rename the misleading Appearance tab to "Homepage Intro Banner".** | **Preserve the existing configuration and rendering behavior.** **Do not implement full sitewide theming.** Future Builder integration requires a **separately verified migration** | **PARTIALLY IMPLEMENTED.** Stage 08 fixed one defect inside this area — `introBannerMobileFocalX/Y` had a slider, a schema entry and persistence and were read by nothing — explicitly as a defect fix, not as a D-06 implementation. **The rename itself is outstanding** |
| **D-07** | **Preserve all existing revisions. No pruning or deletion.** | A future 50-revisions-per-page policy may be considered **only after dry-run, logging, backup verification and separate deletion authorization** | **ALREADY SATISFIED.** Stage 08 enforces no retention and asserts it: twelve publishes leave twelve revisions, and the service exports no `prune\|purge\|deleteRevision\|trimRevision\|cleanup` function. **This approval confirms the existing state; it authorises no deletion** |
| **D-12** | **Scheduled publishing remains a supported capability.** Production triggering should use an **authenticated external cron** | Hosting-specific deployment integration is **deferred until the hosting environment is selected**. **No production deployment or scheduler activation during this stage** | **CORRECTNESS IMPLEMENTED; INTEGRATION DEFERRED.** Stage 08 verified fourteen deployment-independent properties and fixed the atomicity defect, and documented the deployment-neutral contract `runDuePublications()`. The `localhost` revalidation target remains, pending the hosting decision |

**What these four approvals do NOT authorise**, recorded because a later stage will read this table and not the prompt:

- **No production data migration** (D-05 says so explicitly), and therefore no footer ownership switch until the inventory and migration are prepared and separately authorised.
- **No sitewide theming** (D-06), and no migration of the 21 `introBanner*` fields into Builder props without separate verification.
- **No revision deletion of any kind** (D-07). The 50-per-page figure is a candidate for future consideration, not an approved policy.
- **No scheduler activation, no deployment, no hosting choice** (D-12).

**Still requiring owner approval after Stage 09 authorization:** **D-09** (information/legal page publication workflow, and its schema change **S-1**), **D-13** (legal content approval), **D-14** (publisher identity and sitewide `Organization`/`WebSite` JSON-LD). These three are the subject of the Stage 09 decision packages in `docs/stage-09/STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md`. **D-10 remains engineering.** The approvals above extend to none of them, and to no schema migration.

---

**Legend — Approval:** `YES` = blocks implementation until the owner decides · `NO` = engineering may proceed under existing approved scope.

---

## Summary

| ID | Decision | Recommendation | Approval | Blocks stage |
|---|---|---|---|---|
| D-01 | Controlled Hybrid Management boundaries | Adopt as specified | **YES** | 04 onward |
| D-02 | Shared detail templates vs fully composable detail pages | **Option B** — keep templates, make the appendage honest | **YES** | **07** |
| D-03 | Template-level vs entity-level overrides | Template-level layout; entity-level SEO/FAQ only | **YES** | 07 |
| D-04 | Content source engine: integrate, consolidate or retire | **Retire**; promote `slotUtils` | **YES** | 05 |
| D-05 | Footer/navigation publishing ownership | `SiteConfig` owns columns; migrate nav rows | **APPROVED 2026-11-11, with limitations** | 08 — implementation outstanding |
| D-06 | Site-wide appearance controls | Rename now; defer real theming | **APPROVED 2026-11-11 (rename only)** | 08 — rename outstanding |
| D-07 | Revision retention policy | Keep 50 per page key | **APPROVED 2026-11-11 as PRESERVE ALL; no deletion authorised** | satisfied |
| D-08 | Draft-save cache behaviour | Scoped two-tier model | **NO** — engineering | 08 |
| D-09 | Information/legal page publication workflow | Engineering fix now; publication by owner/legal | **YES** (publication only) | 09 |
| D-10 | Builder property validation and compatibility | Validate per `PropDef`; warn-then-enforce | **NO** — engineering | 04 |
| D-11 | Newsletter block readiness | Remove from registry until a backend exists | **YES** | 04 |
| D-12 | Scheduling and deployment dependencies | External cron; defer until hosting is settled | **APPROVED 2026-11-11; integration deferred** | 08 — correctness done |
| D-13 | Legal content approval | Owner/legal sign-off required | **YES** | 09 |
| D-14 | Sitewide `Organization`/`WebSite` JSON-LD | Add it | **YES** | 09 |
| D-15 | "Hybrid Management (Option C)" definition | **Undefined in the repository** | **YES — BLOCKER** | all |

**15 decisions · 13 require owner approval · 1 is a blocker.**

---

## D-15 — "Hybrid Management (Option C)" is undefined — **BLOCKER**

**Current state.** The Stage 01 and Stage 02 directives both state the owner selected "Hybrid Management (Option C)". A content search across all 274 markdown files in the repository finds **no** match for "Hybrid Management", no enumeration of three management options, and no definition of Option C. The only "Option A/B" hit is unrelated — a choice about a `PAGE` enum value in the SEO engine audit.

**Options.** (a) The owner supplies the definition. (b) The owner confirms that the Controlled Hybrid model specified in `STAGE_02_HYBRID_BUILDER_ARCHITECTURE.md` §2 *is* Option C. (c) The decision is withdrawn.

**Recommendation:** **(b)** — confirm or correct §2. It was written from the directive's own description (structured CMS owns records; Builder owns presentation; SEO stays integrated) and is the closest good-faith reconstruction.

**Rationale.** Stage 02 could not verify a decision that exists nowhere in the repository, and inventing its meaning would be the exact failure mode these audits were commissioned to correct. §2 is therefore offered as a proposal to be ratified, not as a restatement of something known.

**Migration impact:** none yet — but every later stage inherits whatever this means.
**Approval required: YES.** This is the one item that should be resolved before Stage 03 scope is finalised, because it defines the boundary all later stages are measured against.

---

## D-01 — Controlled Hybrid Management boundaries

**Current state.** No written boundary. Four elements are owned twice (homepage hero, footer columns, section identity, category copy), and seven admin surfaces write data nothing public reads.

**Options.** (a) Ratify §2 — three domains, references not copies, one owner per element. (b) A looser boundary allowing the Builder to store entity copies for performance. (c) A stricter boundary where the Builder owns no copy at all, including page-level section headings.

**Recommendation: (a).**

**Rationale.** (b) is how CMS products accumulate stale content — correcting an article would stop correcting it everywhere it appears, which is the single most valuable property the current design already has. (c) is impractical: a section heading like "More Rodeo" belongs to the page, not to any entity, and forcing it into an entity record would be artificial.

**Migration impact.** Resolving the four double-owned elements needs data migration, not just code — see D-05 and D-06.
**Approval required: YES** — it defines what the Builder is permitted to own.

---

## D-02 — Shared detail templates vs fully composable detail pages

**The largest scope decision in the programme.** Six entity page families depend on it.

**Current state.** Seven `template:*` page keys are live in the Builder but **tail-append only** — slots render *below* fixed JSX. Of five declared detail block types, only `detail-related` and `detail-cta` render; `detail-hero`, `detail-body` and `detail-faq` are inert markers with no renderer. The historical Blueprint is **silent** on the target state for detail templates, so there is no approved requirement either way.

**Options.**

**A — Fully composable.** Promote `detail-hero`, `detail-body`, `detail-faq` to real blocks; detail pages compose entirely from slots.
*For:* uniform mental model; maximum owner control.
*Against:* six families change at once; the entity body is factual content whose structure is the reason these pages are trustworthy, and making it rearrangeable invites layouts that omit required editorial elements; largest regression surface in the programme; needs per-family staging.

**B — Honest appendage** *(recommended)*. Keep templates authoritative for entity body and hero. Delete the three inert markers. Keep `detail-related` and `detail-cta`, fix `detail-related.title`, and add a small number of approved tail block types (rich text, CTA, FAQ) usable below entity content. Label the Builder page clearly: *"This page's main content is managed by its template; sections below are editable."*
*For:* removes the three inert types and the misleading promise; preserves editorial integrity of factual pages; smallest risk; deliverable in one stage.
*Against:* owners cannot restructure entity bodies — a real limitation that must be stated plainly rather than implied away.

**C — Hybrid with template variants.** Templates stay fixed but gain named variants per family, selectable in the Builder, plus the tail appendage from B.
*For:* meaningful presentation control without arbitrary rearrangement.
*Against:* variants must be designed and built per family; a larger surface than B for benefit that has not been requested.

**Recommendation: B**, with C as the natural follow-on if owners later ask for more control.

**Rationale.** The current state is the worst of all worlds: it advertises five block types and delivers two. B makes the product honest in one stage and removes three of the ten inert properties. A changes six public page families simultaneously on the strength of no stated requirement, and its main benefit — rearranging factual entity content — is of questionable editorial value for a publication whose credibility rests on consistent article and profile structure.

**Migration impact.** B: delete three registry entries after querying stored layouts for their use. No schema change. A: no schema change either, but a large rendering change across six families plus new per-family tests.
**Approval required: YES.** **Blocks Stage 07.**

---

## D-03 — Template-level vs entity-level overrides

**Current state.** Layout is template-level — one `PageLayout` row per page key, shared by every entity of that type. SEO and FAQ are already entity-level via `EntitySeo` / `EntityFaq`.

**Options.** (a) Keep layout template-level; keep SEO/FAQ entity-level. (b) Add per-entity layout overrides. (c) Per-entity overrides for a whitelisted subset of entities (e.g. flagship hubs).

**Recommendation: (a)** for Stages 03–10.

**Rationale.** (b) multiplies the layout surface by the entity count — hundreds of rows to keep coherent, each a place where a template fix silently fails to apply — for a need nobody has stated. The existing split is already correct: presentation is shared, while the things that genuinely differ per entity (metadata, FAQ) are already per-entity. If a specific flagship page later needs bespoke treatment, (c) is the cheap escalation and can be added without disturbing (a).

**Migration impact:** none.
**Approval required: YES** — confirm that owners do not expect per-article layout control, since that expectation would change Stage 07 substantially.

---

## D-04 — Content source engine: integrate, consolidate or retire

**Current state, re-verified in Stage 02.** `lib/cms/contentSourceEngine.ts` (402 lines) has **zero importers**. Its only repository reference is a source-text assertion in `tests/batch33-unit.test.ts:12`. It is unreachable by construction — `parseContentSource` returns `null` without `props.sourceMode`, and `sourceMode` appears **nowhere** in the registry (re-confirmed: count zero). It also omits the fixture-exclusion filter the live path applies at 24 call sites. Meanwhile `lib/cms/slotUtils.ts` (31 lines) is live, shared by the homepage and section-landing resolvers, and fixture-safe.

**Options.**

**A — Integrate the engine.** Add `source*` props to the registry, add fixture protection, write an adapter from its flat `ResolvedItem` to the domain `Article` type the components consume.
*Against:* three separate pieces of work to reach parity with a 31-line module that already behaves correctly; and integrating it unchanged would **regress** fixture protection.

**B — Retire the engine; promote `slotUtils`** *(recommended)*. Implement the §5.3 contract on `slotUtils`, port the engine's per-request dedup idea into the live path, delete the engine and its four source-text tests.
*For:* builds on working, tested code; removes a 402-line decoy that currently *looks* like the content architecture and is vouched for by a passing test.
*Against:* discards design work already written.

**C — Leave it dormant.** *Against:* actively harmful — a new engineer reads it as the content architecture, and a green test implies it works.

**Recommendation: B.**

**Rationale.** The engine's value is its *design*, and that design is preserved by porting the contract and the dedup context. Its *code* has never executed, is unreachable by construction, and silently lacks a protection the live path has. Keeping dead code that a passing test vouches for is precisely the pattern that produced the defects these audits found.

**Migration impact:** none to data. Deleting the module requires removing four source-text assertions in `tests/batch33-unit.test.ts`.
**Approval required: YES** — deleting 402 lines of previously-planned architecture is the owner's call. **Blocks Stage 05.** Nothing was deleted in Stage 02.

---

## D-05 — Footer and navigation publishing ownership

**Current state.** Footer columns have **two** owners. `SiteConfig('footer').columns` silently *replaces* the `NavigationItem`-driven columns when configured, with no warning in either admin module. `DIRECTORY_LINKS` is force-merged regardless of admin nav. Editing footer links in Header & Nav therefore produces **no public change** once Footer columns exist — the clearest "I changed it and nothing happened" case in the product.

**Options.** (a) `SiteConfig` owns columns; Header & Nav keeps header and quick-access only; migrate existing nav footer rows into `SiteConfig` and mark the nav location retired. (b) `NavigationItem` owns columns; drop `SiteConfig.footer.columns`. (c) Keep both but surface the precedence in the UI.

**Recommendation: (a).**

**Rationale.** `SiteConfig` already has the draft/published shape the rest of the publishing model is converging on, and it supports richer column structure. (b) would discard that. (c) leaves a confusing product and asks the owner to understand an implementation detail.

**Migration impact.** Existing `footer-sections` / `footer-academy` nav rows must be migrated into `SiteConfig.footer.columns`, not silently ignored as they are today. Until migration runs, owners who configured nav footer links would lose them — so the migration is a prerequisite, not a follow-up.
**Approval required: YES.**

---

## D-06 — Site-wide appearance controls

**Current state.** The admin has an "Appearance" tab. **All 21 of its `AppearanceConfig` fields are `introBanner*`**, consumed **only** by the homepage intro banner. There is no site-wide theming: the page background and brand gold are literals in `PublicChrome` and the header/footer. The Blueprint proposes **removing** the screen and defers real appearance tokens as an open question.

**Options.** (a) Rename the tab to "Homepage Intro Banner" now; defer real theming. (b) Retire the screen and migrate its fields into `editorial-hero` props. (c) Build real site-wide theme tokens (logo, colours, fonts).

**Recommendation: (a) now, (b) in Stage 08, (c) only if the owner asks.**

**Rationale.** (a) is truth-in-labelling and costs nothing — the tab currently misleads an owner into expecting site-wide control. (b) is the correct end state but **must migrate the 21 stored fields**, or any owner who configured the banner loses it. (c) is a genuine product expansion: the logo being uneditable is a real limitation, but it was explicitly deferred and should not be smuggled in.

**Migration impact.** (b) needs a data migration from `SiteConfig('appearance')` into the homepage `editorial-hero` slot props.
**Approval required: YES** — specifically on whether (c) is wanted, since "I want to change the logo" is a reasonable owner expectation that today requires a developer.

---

## D-07 — Revision retention policy

**Current state.** No retention. `nextRevisionNo` increments monotonically; each publish stores a full snapshot JSON; `listRevisions` defaults to 50 but prunes nothing. `onDelete: Cascade` means deleting a layout row destroys its history. The Blueprint suggests 50 as an open question.

**Options.** (a) Keep the latest 50 per page key, prune on publish. (b) Keep by age (e.g. 180 days). (c) Keep everything. (d) Count plus a floor (50, never fewer than 10 regardless of age).

**Recommendation: (a)** — 50 per page key.

**Rationale.** 50 covers realistic rollback need for a 15-key site, and matches the existing `listRevisions` default so the UI needs no change. Age-based retention is worse here: a rarely-edited page would lose its only history while a busy page keeps dozens.

**Migration impact.** Pruning **deletes data**. The first run on existing history is irreversible, so it needs explicit approval and should log what it removed.
**Approval required: YES.**

---

## D-08 — Draft-save cache behaviour

**Current state.** `rev()` calls `revalidatePath('/', 'layout')` and is invoked by `saveDraftAction` as well as the publish paths, so saving a draft for any page key flushes the **entire** public site. Carried forward from Stage 01 as follow-up FU-1.

**Options.** (a) Two-tier scoped model — draft save refreshes the admin route and the preview iframe only; publish invalidates a `pageKey → paths` map. (b) Remove `rev()` from draft save and leave publish blanket. (c) Move to tag-based invalidation throughout.

**Recommendation: (a)**, with (c) as the long-term shape for `template:*` and `directory:*` keys whose paths fan out.

**Rationale.** (b) fixes the acute problem but leaves every publish flushing the whole site. (c) is correct but a larger change than Stage 08 should take on at once; (a) gets the behaviour right and leaves a clean path to (c).

**Migration impact:** none. Requires the five behavioural checks in the architecture document §6.4, using `scripts/cache-invalidation.mts` — **not executed** in Stage 01 or 02, so wiring it into CI is a Stage 08 prerequisite.
**Approval required: NO** — this is an engineering correction of a defect, within approved scope. Flagged here because it changes how quickly admin edits appear, which the owner should be aware of.

---

## D-09 — Information and legal page publication workflow

**Current state.** `InfoPage` has **no draft/published pair** — a single row with a status enum. `saveInfoPageDraft` refuses to edit a published page and instructs the editor to "create a new draft revision", but **no such mechanism exists**. The only path is `unpublishInfoPage`, which removes the page from public output; for the seven legacy slugs the hardcoded config silently takes over, and for a new slug the URL **404s**. **Editing a live legal page therefore degrades or removes it.**

**Options.** (a) Add draft/published columns so a draft is editable while the published version stays live; add preview. (b) Add a full revision table mirroring `PageLayoutRevision`. (c) Leave the workflow; document the constraint.

**Recommendation: (a)**, with (b) available later if legal history is required.

**Rationale.** (a) is the minimum that makes editing safe and matches the `SiteConfig` shape already in use. (b) is more than is needed today. (c) is untenable — the current behaviour silently damages live legal pages.

**Migration impact.** Schema change S-1 on a live content table. Additive columns, so existing rows are unaffected.

**Approval required: YES, but only for the publication half.** The workflow fix is engineering and should proceed. **Approving the prose and making each page indexable is an owner/legal act** — see D-13.

---

## D-10 — Builder property validation and compatibility

**Current state.** Sanitisation runs only when `typeof val === 'string'`. The XSS check is `/<script/i` **alone**, so `<img onerror>` and `<svg onload>` pass. URL checks apply only to keys matching `/url$/i`. `select` options are never validated. Non-string props are entirely unchecked. `props` is `z.record(z.string(), z.unknown())`, so arbitrary undeclared keys persist. `required` is not enforced server-side. One dead branch exists.

**Options.** (a) Validate per `PropDef` (type, max, options), whitelist declared keys, enforce `required`, broaden the XSS check. (b) Validation only, no whitelist. (c) Whitelist in warn-only mode first, enforce after a stored-data audit.

**Recommendation: (a) for validation, (c) for the whitelist.**

**Rationale.** A strict whitelist could reject existing stored rows carrying stray keys from earlier iterations, which would make a save fail on a page the owner has not touched. Warn-first makes the blast radius visible before it is enforced. Validation itself has no such risk and should be enforced immediately.

**Migration impact.** Requires reading `PageLayout.draftSections` / `publishedSections` to inventory undeclared keys — **not performed in Stage 02** (read-only scope) and listed as a **Stage 04 prerequisite**.
**Approval required: NO** — security and correctness hardening within approved scope.

---

## D-11 — Newsletter block readiness

**Current state.** `newsletter-signup` is offered in the Builder and **renders publicly** with a `readOnly` input and a button with no handler. The Blueprint documents it as **hidden until a subscription backend exists** — the deferral was decided but never enforced, so a visitor can type an email address and nothing happens.

**Options.** (a) Remove from the registry until a backend exists. (b) Implement capture (needs a provider, a consent model and a data-protection position). (c) Leave it, visually disabled with "coming soon".

**Recommendation: (a).**

**Rationale.** (a) enforces the decision already taken. (b) is a product expansion with privacy implications well outside Builder scope. (c) still presents a dead form on a live publication.

**Migration impact.** Removing a block type requires querying stored layouts first — any page already including it would lose that section. Low likelihood, must still be checked.
**Approval required: YES** — it removes a block an owner may believe is functional.

---

## D-12 — Scheduling and deployment dependencies

**Current state.** `startScheduler` is an in-process `setInterval` with `timer.unref()`, launched from `instrumentation.ts`. It never fires on serverless or scale-to-zero; on multi-instance every replica runs it. Its revalidation posts to `http://localhost:${PORT}`, so only the publishing replica's cache is flushed. Optimistic locking prevents double-publish, so the race is contained. Note scheduled publishing was listed as a **deferred open question** in the Blueprint yet was implemented in Phase D — the project built ahead of the decision.

**Options.** (a) External cron (platform scheduler or GitHub Actions) hitting an authenticated route; remove the in-process timer. (b) Keep in-process and require a long-lived single instance. (c) Keep as-is and accept best-effort delivery.

**Recommendation: (a)**, deferred until the hosting platform is settled.

**Rationale.** (a) is the only option that guarantees delivery and works on any platform, and it reuses the authenticated internal-endpoint pattern Stage 01 just hardened. (b) constrains hosting for one feature. (c) means a scheduled publish can silently never happen.

**Migration impact.** Requires `INTERNAL_REVALIDATE_SECRET` configured — already a Stage 01 carry-forward — and a platform cron entry. The revalidation target must change from `localhost` to the public base URL.
**Approval required: YES** — depends on a hosting decision not yet made, and on whether scheduled publishing is wanted at all given it was originally deferred.

---

## D-13 — Legal content approval

**Current state.** **[RUNTIME]** All seven legal pages serve `noindex, nofollow` **and** render a visitor-facing amber *"Draft — pending owner and legal review"* banner. Content comes from a 225-line code config whose entries are all flagged pending review. The hardcoded fallback is documented as intentional in the schema.

**Options.** (a) Owner/legal reviews and approves the existing prose; engineering then clears the flags and seeds published `InfoPage` rows. (b) Engineering separates the banner from the robots flag so the pages become indexable while review continues. (c) Leave as-is.

**Recommendation: a split.** Engineering implements the separation in (b) — the banner becomes staff-only — **but indexing stays off until (a) completes.**

**Rationale.** Three rules hold: no legal content is ever fabricated; a draft legal page is never *automatically* made indexable; and the visitor-facing banner should not be driven by the same flag as the robots directive. Separating them is engineering. Deciding the prose is correct, and that the page may be indexed, is an owner and legal act that no agent should perform or infer.

**Migration impact.** Seeding published rows depends on D-09's draft model landing first, or the first subsequent edit reverts the page to hardcoded text.
**Approval required: YES** — explicitly owner/legal, not engineering.

---

## D-14 — Sitewide `Organization` / `WebSite` JSON-LD

**Current state.** **[RUNTIME]** The homepage emits **zero** `application/ld+json` blocks, while `/competition/`, `/competitors/` and `/venues/` each emit two. There is no sitewide `Organization` or `WebSite` entity anywhere. The Blueprint recommends adding it but leaves it open.

**Options.** (a) Add both to the root layout. (b) Add `Organization` only. (c) Leave it.

**Recommendation: (a).**

**Rationale.** For an independent editorial publication, `Organization` plus `WebSite` is the baseline entity markup search engines use to establish publisher identity — and the site already emits `Organization` *within* article JSON-LD, so the data exists and is merely not expressed at site level. Low risk, well-understood.

**Migration impact.** None. Requires owner-confirmed publisher facts (legal name, logo URL, social profiles) — these must be **supplied, not inferred**.
**Approval required: YES** — the publisher identity values are the owner's to state.

---

## Decisions blocking each stage

| Stage | Blocked by | Can proceed without approval? |
|---|---|---|
| **03** — Behavioural Testing Foundation | none | **YES** — fully unblocked |
| **04** — Block Registry & Property Rendering | D-11; D-02 (for the three inert detail types only) | Partially — all non-detail work can proceed |
| **05** — Content Source Engine | **D-04** | No |
| **06** — Visual Builder Canvas | none | **YES** |
| **07** — Page Template Integration | **D-02**, D-03 | No |
| **08** — Publishing, Revisions, Global Controls | D-05, D-06, D-07, D-12 | Partially — D-08 concurrency and cache work can proceed |
| **09** — SEO & Legal Integration | D-09 (publication), D-13, D-14, D-10 | Partially — the SEO engineering fixes can proceed |
| **10** — QA & Production Readiness | inherits all | No |

**Stages 03 and 06 are fully unblocked** — which is why the roadmap sequences them first and third.
