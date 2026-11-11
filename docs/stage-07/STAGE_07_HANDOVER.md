# Stage 07 — Handover to Stage 08

**Stage:** 07 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

**Stage 08 scope (from the Stage 02 roadmap):** publishing, revisions and global controls — revision retention (D-07), footer ownership (D-05), Appearance controls (D-06), scheduler and deployment (D-12), and the KD-08 draft-save cache flush.

---

## 1. Working baseline

**103 files · 2,283 tests · 2,283 passing · 0 failed · 0 skipped** · `tsc` 0 errors · `next build` succeeds · Chromium 32/32 · route harness 37/37 · 19 migrations unchanged.

**There is still no known-failing test.** Any failure in Stage 08 is a new regression.

> **A warning this handover owes you, because the last one got it wrong.** The Stage 06 handover stated its baseline as "95 files · 2046 tests". The real figure was **97 · 2079**. Stage 07 verified it before editing and found the discrepancy, exactly as its directive anticipated. **Verify these numbers yourself before your first edit** — the command is `cd apps/web && npx vitest run`. If they differ, record the discrepancy rather than trusting this page.

---

## 2. What Stage 08 inherits

| Asset | Where | Use |
|---|---|---|
| **The one slot-selection authority** | `lib/cms/slotSelection.ts` | `selectRenderableSlots` / `selectRenderableResolved`. **Never hand-write `.filter(visible).sort(order)` again** — §4.1 |
| **`orderAfter`** | same module | the *only* correct way to order a resolver-injected system slot. §4.2 |
| **Registry-driven resolvers** | `detailTemplateData.ts`, `directoryData.ts` | neither keeps an allowlist; the registry governs what may be added and saved |
| **Per-family registry fields** | `sectionRegistry.ts` | `familyLimits`, `excludeFromDefaultsIn`, `systemContent`, `retiredBy`. All **lists/maps, not booleans**, so one shared definition object serves several families — §4.3 |
| **The capability declaration** | `lib/cms/pageCapability.ts` | **update this when you change what a page or block can do.** §4.4 |
| **Directory block model** | `components/blocks/DirectoryBlocks.tsx` | hero + listing + CTA; the listing receives route data, never layout JSON |
| **The shared test-quality gate** | `tests/support/testQualityGate.ts` | assertion-level detection, shared by the gate and the measurement scripts |
| **211 Stage 07 tests** | `tests/stage07-*.test.ts`, `e2e/stage07-templates.spec.ts` | regression net for selection, composition, directories, ownership |
| **Measurement scripts** | `scripts/stage07-*.mts` | re-derive the capability matrix, family composition and gate impact from live code |
| **A self-cleaning e2e harness** | `e2e/global-teardown.ts` | now clears `PageLayout` / `PageLayoutRevision` — §4.5 |

---

## 3. Recommended Stage 08 sequence

1. **Nothing in Stage 07 blocks you.** Start with D-07 (revision retention) once the owner decides, since `PageLayoutRevision` is unbounded today and Stage 08 owns it.
2. **Wire `test:cache` before KD-08.** The draft-save cache flush cannot be verified without it; the script exists (`scripts/cache-invalidation.mts`) and is not in any gate.
3. **Take the `EditorialHero` accessibility fix early** (§5, item 1). It is small, it is a real user-facing defect, and it is the kind of change that gets postponed indefinitely once a stage fills up.
4. **If you touch revisions or scheduling, convert the quality-gate entries in that area as you go** (§6). Six entries live in `batch-c-revisions` and `batch-d-scheduling`.

---

## 4. The five things that will break if you ignore them

### 4.1 Do not reintroduce a local filter/sort

The rule lived in **five** hand-written copies before Stage 07 and was guaranteed nowhere. `tests/batch-b-detail.test.ts`, `batch-e-directory.test.ts` and `batch-i-hardening.test.ts` now each assert that the resolver contains `selectRenderableSlots` and does **not** contain `.filter((s) => s.visible)`. A sixth copy fails those immediately — which is the point.

### 4.2 An injected system slot MUST get a real order

This is the trap that made Stage 06 defer the consolidation, and it is subtle enough to re-enter.

`resolveSectionLandingSlots` injects slots at a **positional index**. If you stamp one with a placeholder `order` (the old code used `-1`), the array order and the `order` fields contradict each other, and `PageRenderer`'s sort hoists the block to the **top of the page** — the discipline guides above the section hero.

Use `orderAfter(anchorSlot, fallbackLast)`. `tests/stage07-slot-selection.test.ts` has a standing regression test named for the hazard, and mutation **M2** confirms it is load-bearing.

### 4.3 A shared block must stay ONE object

`tests/stage04-property-fixes.test.ts` asserts **object identity** for a block that appears in several family arrays, because Stage 04 found two divergent literals where first-wins dedupe silently discarded one.

**Stage 07 broke this and the test caught it.** The first implementation added shared blocks to the detail family by spreading them:

```ts
{ ...SHARED_RICH_TEXT_BLOCK, excludeFromDefaults: true, familyLimits: { …, 'detail-template': 2 } }   // WRONG
```

That produced four distinct objects for `rich-text-block`. The correct form puts the per-family difference **on the shared object**:

```ts
familyLimits: { homepage: 5, 'section-landing': 3, 'detail-template': 2, directory: 2 },
excludeFromDefaultsIn: ['detail-template', 'directory'],
```

and the family arrays reference `SHARED_RICH_TEXT_BLOCK` by identity. Three tests now assert this, from both the Stage 04 side and the detail side.

### 4.4 `pageCapability.ts` must not drift — and now there is a stronger check

The mirror rule from Stage 06 still holds: `RENDERED_SECTION_TYPES` must equal `Object.keys(blockRegistry)` in both directions, or `tests/stage06-page-capability.test.ts` fails. Adding a renderer without updating the mirror makes the Admin label a block "Editable" when nothing renders it.

Stage 07 added two more obligations:

- **`no block type is left classified `unsupported`.** Derived from the live registry, so a block you add without a renderer fails there rather than shipping as a confident lie.
- **Retirement is checked across ALL families.** `classifyBlockSupport` previously inspected only `homepage` and `section-landing`; a detail-family retirement was mislabelled. If you add a family, `getAllFamilies()` covers it automatically — do not reintroduce a hardcoded family list.

### 4.5 The Admin editor re-computes what the server computes

`views/admin/AdminPageLayoutEditor.tsx` builds **its own copy** of the default layout for the structure tree, while the canvas renders the **server's** computation. They must agree, including on every filter.

Stage 06 learned this the hard way: random default slot ids made the two disagree and click-to-select silently did nothing on **every** page, because no stored layout exists. Stage 07 added `excludeFromDefaultsIn` and had to mirror the filter in both places for the same reason.

**If you add a rule to `buildDefaultSlots`, add it to `buildDefaultSlotsFromRegistry` and pass the field through `app/admin/(dashboard)/website/page.tsx`'s `toReg`.** The same applies to anything the library displays: `familyLimits` was being ignored there, so a cap was shown wrong and enforced only on save.

---

## 5. Carried-forward items

| Item | Priority | Note |
|---|---|---|
| **`EditorialHero` secondary stories are `<article onClick>`** | **recommend Stage 08** | not keyboard-focusable, not announced as links, **no `href`** — invisible to crawlers, cannot be opened in a new tab. The lead CTA is a `<button>` with the same crawlability cost. Fix: wrap the card content in a real `<Link href={ROUTES.ARTICLE(slug)}>` and drop the callback. Touches `components/sections/EditorialHero.tsx` and the homepage hero's public markup, so it needs visual verification at 1280/768/390. Found while investigating Task B; deliberately not folded into Stage 07 |
| **Production `PageLayout` inventory** | **owner action** | the only thing blocking physical deletion of the four legacy block types. Retirement already delivers every behavioural outcome, so this is cleanup, not a defect |
| `PageRenderer` → Server Component | unscheduled | **declined in Stage 07 on measured evidence** — see the completion report §4 Task B. The worthwhile version is splitting `registry.tsx` into server-renderable and client-island halves so the 22 blocks stop shipping wholesale. That is its own stage-sized change |
| KD-08 draft-save cache flush | **08** | still **needs `test:cache` wired up first** |
| KD-09 / KD-10 concurrency | 08 | interactive `expectedVersion`; atomic revision numbering |
| D-05 footer ownership · D-06 Appearance · D-07 retention · D-12 scheduler | 08 | owner decisions, all unblocked by Stage 07 |
| KD-11 / KD-12 legal pages (D-13) · KD-13 / KD-14 SEO gaps (D-14) | 09 | |
| Homepage hero content priority | awaiting ratification | the hero claims its articles before any other slot regardless of placement. Stage 07 **changed no content-selection precedence**. A one-line change if the owner prefers block position to decide |
| Canvas fidelity vs. live editing | unscheduled | the canvas still shows the last **saved** draft and says so. Closing the gap needs silent autosave or a second renderer; both remain forbidden |
| **Undo/redo** | unscheduled | no undo in the draft architecture, and **no buttons were added** — a dead control is worse than none. Revision history is the recovery path |
| `richtext` prop type | unscheduled | declared in `PropType`, used by no block, rendered as a plain textarea |
| Section-landing cross-slot dedup | if needed | one feed per landing, so nothing to deduplicate |
| Newsletter component | when D-11 is revisited | `NewsletterSignup` remains in `PremiumBlocks.tsx`, unreachable. **Do not re-register** |

---

## 6. Test quality gate — the state you inherit

The gate was **widened and sharpened** in Stage 07 (Task J), measured before being changed.

- Detection is **assertion-level**: it reads the test's own body, not the file. The old file-level gate had **19 false positives** out of 49 and **missed 23** real violations — and it flagged Stage 07's own correct conversions, which is what forced the change.
- Three verbs added on the measurement: `clamps`, `handles`, `supports`. Three **rejected**: `has`, `uses`, `includes` would have added ~145 hits that are legitimate structural claims about schema fields and wiring.
- Baseline **49 → 53**: −19 false positives, +23 real findings. It may shrink but never grow, and a stale entry still fails.
- Logic lives in `tests/support/testQualityGate.ts`, shared with `scripts/stage07-quality-gate-impact.mts` and `scripts/stage07-gate-compare.mts`, so a measurement cannot disagree with enforcement.

**The best next conversion, if you want one cheap win:** 11 of the 53 are preview-URL mapping tests in `batch-i-hardening`, `batch-t2-detail-templates` and `batch-t3-competitor-venue`. They all assert source text about `pageKeyToUrl` in `app/admin/(dashboard)/website/preview/route.ts`, which is private and async. **Export it as a test seam and call it** — one small change clears 11 entries. The remaining clusters and their plans are in the test report §5.7.

To regenerate the baseline **after a deliberate detection change** (never to silence a new violation): `npx tsx scripts/stage07-regen-gate-baseline.mts`, which prints the added and removed entries for review.

### Mutation gaps still open

- **Draft isolation** still has no mutation proving its assertion is load-bearing. The honest mutation leaks unpublished content and deserves a deliberate run with the owner's awareness. Stage 07 added behavioural isolation assertions for the detail and directory families, which is not the same thing.
- **The quality gate** is now mutation-tested for detection (M10). What remains is an end-to-end proof that a deliberately-bad test file is **blocked**, not merely detected.

---

## 7. Browser verification — keep it running, and know the trap

```bash
cd apps/web

# 1. No conflicting server
netstat -ano | grep -E ":3000|:3100" | grep LISTENING

# 2. Build against the ISOLATED test database. APP_ENV=test satisfies the
#    environment isolation guard — do not weaken the guard instead.
export DATABASE_URL="$(grep -E '^TEST_DATABASE_URL=' .env | head -1 | sed 's/^TEST_DATABASE_URL=//' | tr -d '"\r')"
export APP_ENV=test
npx next build

# 3. Run the specs
npx playwright test e2e/stage06-visual-builder.spec.ts e2e/stage07-templates.spec.ts --reporter=list
```

Chromium **is** installed (`ms-playwright/chromium-1248`); no download needed.

### The trap Stage 07 hit, so you do not

**The Builder specs write to the test database, and until Stage 07 nothing cleaned it up.** The Stage 06 test "the canvas reloads after a successful Save Draft" relied on a page having **no stored layout** in order to start dirty — and then saved one. It passed in Stage 06 because that was the first run against a fresh database, and failed on every run after. The Stage 06 handover's claim that the test database is "written only by the existing e2e global-setup, which cleans up after itself" was **not true** for these specs.

Two fixes are in place: the test now makes the page dirty explicitly, and `e2e/global-teardown.ts` clears `PageLayout` / `PageLayoutRevision`. **If you add a spec that saves a draft, make sure the teardown still covers what you create.**

### Vitest still has no DOM

`vitest.config.ts` is `environment: 'node'` with no jsdom, and `include` matches only `*.test.ts` (not `.tsx`). Use `renderToStaticMarkup` + `React.createElement` for structure, call exported pure predicates for behaviour, and prove real event interaction in the browser. **Adding jsdom is a dependency change** — if Stage 08 wants in-process event tests, take that decision deliberately first.

Three blocks call `useRouter` during render, so a suite that renders real blocks needs:

```ts
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, /* … */ }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
```

### Writing a DB-backed suite

Follow `tests/stage07-directory-template.test.ts`: guard on `process.env.DATABASE_URL`, probe with `prisma.pageLayout.findFirst()`, use `describe.runIf(available)`, upsert under a **real** page key, and delete in `afterAll`. Do **not** run a DB-writing Vitest suite concurrently with Playwright — both use the same isolated database and the browser will observe your rows.

---

## 8. What Stage 08 must not do

- **Do not hand-write a sixth `.filter(visible).sort(order)`.** §4.1
- **Do not give a resolver-injected slot a placeholder `order`.** §4.2
- **Do not clone a shared block definition** to vary it per family. §4.3
- **Do not let `pageCapability.ts` drift**, and do not reintroduce a hardcoded family list in `classifyBlockSupport`. §4.4
- **Do not add a rule to `buildDefaultSlots` without mirroring it in the editor.** §4.5
- **Do not physically delete a legacy block type** until the production inventory is run or the owner confirms in writing.
- **Do not mark a page `composed`** while its structured core is route-owned. D-02 keeps that core for detail templates; the directory listing is database-owned.
- **Do not introduce a per-entity template override.** D-03 limits entity-level overrides to SEO and FAQ.
- **Do not build a second renderer.** The canvas mounts the real preview route; keep it that way.
- **Do not weaken the environment isolation guard** to get a build or harness running. `APP_ENV=test` with the isolated database satisfies it.
- **Do not reintroduce parallel slot resolution** — it would reopen KD-01.
- **Do not add a content-source control that does not exist.** A test asserts the inspector never mentions `fallbackPolicy`, `emptyBehavior`, tag/author/date filters, sort order, randomisation, trending or personalisation.
- **Do not add a speculative directory control** — no filter beyond what each route already had, no sort mode, no personalisation.
- **Do not re-register the newsletter block**, add a subscription backend, or collect visitor data.
- **Do not grant the canvas iframe `allow-popups`, `allow-top-navigation` or `allow-downloads`**; a test asserts their absence.
- **Do not use `postMessage` with a `'*'` target origin**, and do not relax the `event.source` check — it is the check that distinguishes the Builder from a hostile same-origin frame.
- **Do not add a source-text assertion** to a test whose name claims a rendering outcome **or a behaviour** (`clamps`, `handles`, `supports` are now flagged too).
- **Do not regenerate the quality-gate baseline to silence a new violation.** Regenerate only after a deliberate detection change.
- **Do not add undo/redo buttons** until the draft architecture supports undo.
- **Do not introduce autosave.**

---

## 9. Git and environment state at handover

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge, reset or branch created** |
| Prisma migrations | **19 — unchanged**; none authored or applied |
| Schema | **unmodified** |
| Production database | **never contacted** in any stage |
| Development database | **never written to** |
| Isolated test database | verified empty of `PageLayout` rows after the work; the e2e teardown now keeps it that way |
| `.next` | holds a **test-database** build from the browser run. Harmless for `npm run dev`; overwritten by the next `next build` |
| Dev servers | terminated; ports 3000 and 3100 confirmed free |
| Docker / deployment | none |
| Prior stages' work | **fully preserved** — nothing reset, discarded or cleaned up |

Git finalization remains deferred until the owner explicitly requests it. **Stage 08 was not started.**
