# Stage 08 — Global Controls Audit and Owner Decisions

**Stage:** 08 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`

This document holds the two audits Stage 08 was asked for (footer ownership, Appearance controls), the scheduler audit, and a decision-ready proposal for every owner decision that blocks work.

---

## 1. The decision gate — result

The directive's §3 required the **exact current wording and approval status** of D-05, D-06, D-07 and D-12 to be checked before any work was planned. It was, in `docs/stage-02/STAGE_02_DECISION_REGISTER.md`.

**The register has exactly two approval rounds, both dated 2026-11-09.** No later round exists in the register or in any Stage 03–07 handover.

| Round | Approved |
|---|---|
| 2026-11-09, at Stage 03 authorization | D-15, D-01, D-02 (Option B), D-03 (implicitly) |
| 2026-11-09, at Stage 05 authorization | D-04, D-11 |

The register's own closing line after the second round reads: *"Still requiring owner approval after Stage 05: **D-05** (footer ownership), **D-06** (appearance controls), **D-07** (revision retention), D-09 (info-page publication), **D-12** (scheduler/deployment), D-13 (legal content), D-14 (sitewide JSON-LD)."*

### 1.1 Work classification, as §3 requires

| Class | Items | Stage 08 action |
|---|---|---|
| **A — policy-independent engineering** | KD-09 concurrency · KD-10 revision numbering · KD-08 cache scoping (**D-08 is explicitly "Approval required: NO"**) · revision recovery hardening · EditorialHero accessibility · Builder save/conflict UX · scheduler safety correctness · test-quality work | **IMPLEMENTED** |
| **B — owner-dependent configuration already authorized** | *(none)* | — |
| **C — blocked business decisions** | **D-05** footer ownership · **D-06** Appearance scope · **D-07** revision retention · **D-12** scheduler deployment target | **AUDITED AND PROPOSED, NOT IMPLEMENTED** |

**Nothing in class C was implemented, and no default was invented.** No retention duration, deletion policy, brand identity, footer owner, scheduler frequency, deployment provider or publication policy was chosen.

### 1.2 Schema-change assessment

**No schema change was needed, so no approval request was raised.** `PageLayout.version Int @default(1)` and `PageLayoutRevision @@unique([pageKey, revisionNo])` both already existed — the concurrency token and the uniqueness constraint were present and simply unused. Prisma migrations remain at **19**, and `schema.prisma` is unmodified.

---

## 2. Task E — footer ownership audit (D-05)

### 2.1 Where footer content comes from

`SiteFooter` has **exactly one consumer** — `components/PublicChrome.tsx`, mounted in `app/(public)/layout.tsx`. So the Task E question "whether different routes render inconsistent footer information" has a clean answer: **they cannot**. Asserted in `tests/stage08-global-controls.test.ts` by walking `app/`, `components/` and `views/` for `<SiteFooter`.

| Element | Source | Editable today? |
|---|---|---|
| `tagline` | `SiteConfig('footer').tagline` | **Yes** |
| `description` | `SiteConfig('footer').description`, else `DEFAULT_DESCRIPTION` | **Yes**, with a hardcoded fallback |
| `copyright` | `SiteConfig('footer').copyright`, else `DEFAULT_COPYRIGHT` | **Yes**, with a hardcoded fallback |
| `statusText` | `SiteConfig('footer').statusText` | **Yes** |
| `socialLinks` | `SiteConfig('footer').socialLinks`, `https:`-only filter | **Yes** |
| Menu columns | **`SiteConfig('footer').columns` when configured, otherwise `NavigationItem`-driven** | **Two owners — the D-05 defect** |
| `DIRECTORY_LINKS` | hardcoded, **force-merged** into the academy column | **No** |
| `SECTIONS_FALLBACK` / `ACADEMY_FALLBACK` | hardcoded, used when nav is empty | **No** |
| Publication-policy column | always present | **No** (correct — required legal links) |
| Independence disclaimer | hardcoded paragraph | **No** (deliberate — legal text, governed by D-13) |

### 2.2 The defect, re-verified and pinned

Once `SiteConfig('footer').columns` is configured it **replaces** the two navigation-driven columns entirely — they are not merged. Editing footer links under Header & Nav therefore produces **no public change**. This is still the clearest "I changed it and nothing happened" case in the product.

Re-verified behaviourally, not from the description: with columns configured, `Editorial Sections` and `Spectator Academy` are **absent** from the rendered footer; without them, both appear. `DIRECTORY_LINKS` appear in both cases.

**Stage 08 changed none of this.** It pinned it, so the owner decides against a measured fact and so a later stage cannot change footer ownership by accident.

### 2.3 Builder layouts do not duplicate footer information

Asserted: no block in `sectionRegistry.ts` declares a `copyright`, `tagline`, `socialLinks` or `statusText` property. Global brand and contact text has not drifted into page-specific layout JSON.

### 2.4 ► DECISION NEEDED — D-05

**The exact decision:** which store owns the footer's menu columns, and what happens to data held by the loser.

| Option | Consequence |
|---|---|
| **(a) `SiteConfig` owns columns** (register's recommendation) | Header & Nav keeps header + quick-access only; the nav footer location is marked retired. **Requires a data migration** of existing `footer-sections` / `footer-academy` nav rows into `SiteConfig.footer.columns` — without it, any owner who configured nav footer links loses them. The migration is a prerequisite, not a follow-up |
| **(b) `NavigationItem` owns columns** | Drop `SiteConfig.footer.columns`. Discards the draft/published shape the rest of the publishing model uses, and the richer column structure |
| **(c) Keep both, surface the precedence in the UI** | No migration and no data loss, but leaves a confusing product and asks the owner to understand an implementation detail |

**Recommendation: (a).** `SiteConfig` already has the draft/published shape the publishing model is converging on, and supports richer columns. (b) throws that away. (c) documents a trap instead of removing it.

**A second, smaller question inside D-05:** should `DIRECTORY_LINKS` remain force-merged and uneditable? It is currently impossible for an administrator to remove the Competitors/Venues links from the footer. Recommendation: fold them into whichever store wins, so they become ordinary editable links.

**Blocks Stage 08 completion?** **No.** The footer renders correctly today; the defect is an editing surprise, not a visitor-facing fault. **It does block any footer implementation work**, which is why Stage 08 did none.

---

## 3. Task F — Appearance controls audit (D-06)

### 3.1 The full control inventory

`SITE_CONFIG_KEYS` is `['footer', 'appearance']` — there is no theme store. `AppearanceConfig` declares **21 fields, every one of them an `introBanner*` field**, re-verified by parsing the interface rather than trusting the count.

| Category (as §9 asks) | Fields | Count |
|---|---|---|
| **Working end to end** — Admin input → Zod validation → `SiteConfig` persistence → public render | `introBannerStyle`, `ImageUrl`, `ImageAlt`, `Eyebrow`, `Headline`, `Description`, `CtaLabel`, `CtaUrl`, `CtaSecondaryLabel`, `CtaSecondaryUrl`, `FocalX`, `FocalY`, `Zoom`, `OverlayDarkness`, `DesktopHeight`, `MobileHeight`, `TextAlign`, `VerticalAlign`, `FullWidth` | **19** |
| **Saved but rendered nothing** → **FIXED in Stage 08** | `introBannerMobileFocalX`, `introBannerMobileFocalY` | **2** |
| **Rendered but not savable** | *(none)* | 0 |
| **Decorative or misleading** | the tab's **name**. "Appearance" implies site-wide control; all 21 fields configure one banner on one page | 1 (labelling) |
| **Requiring owner approval** | real site-wide theming — logo, colours, fonts | D-06 option (c) |

### 3.2 The one defect Stage 08 fixed

`introBannerMobileFocalX` / `introBannerMobileFocalY` had an Admin slider, a `z.number().min(0).max(100)` schema entry, and persistence — and were read by **nothing**. The banner image used the desktop focal point at every width, so an operator could move both sliders, save successfully, and see no change on a phone.

**Fixed**, because it is a defect in an existing labelled control, not an implementation of D-06. The focal point is now published as a CSS custom property and switched at the `md` breakpoint by a media query, so it is correct in the first painted frame and in the static HTML a crawler sees — no JavaScript, no viewport measurement, no hydration step.

**Compatibility:** the mobile values default to the **desktop** values, not to 50%. A configuration stored before the fix renders exactly as it did. Asserted.

**Not a D-06 implementation:** no theme, design token, colour palette, typography option or brand rule was introduced, and `SITE_CONFIG_KEYS` is unchanged.

### 3.3 A second finding, reported and NOT changed

The banner is gated **outside** the component, in `views/HomeView.tsx`:

```tsx
{appearance?.introBannerStyle && appearance.introBannerHeadline && <IntroBanner config={appearance} />}
```

So an operator who uploads a banner image and leaves the headline empty saves successfully and sees nothing — while the component itself would have rendered the image quite happily. **Changing when the banner appears is a product decision inside D-06's scope**, so Stage 08 pinned the behaviour rather than altering it.

### 3.4 Global controls stay global

- No Builder block declares an `introBanner` property, so the homepage hero does not acquire a second owner. D-06 option (b) would create exactly that coupling, and it is unapproved.
- `getPublished<AppearanceConfig>` is read in **exactly one** place — the homepage route. A second reader would be a second owner.

Both asserted from the live tree.

### 3.5 ► DECISION NEEDED — D-06

**The exact decision:** what the Appearance screen is *for*.

| Option | Consequence |
|---|---|
| **(a) Rename the tab to "Homepage Intro Banner"; defer real theming** | Truth-in-labelling; costs nothing; no migration. The tab stops implying site-wide control. Does **not** make the logo editable |
| **(b) Retire the screen and migrate the 21 fields into `editorial-hero` props** | The architecturally correct end state — one owner for the homepage hero, resolving the Stage 02 §2.3 double-ownership violation. **Requires a data migration** from `SiteConfig('appearance')` into the homepage `editorial-hero` slot props, or any owner who configured the banner loses it |
| **(c) Build real site-wide theme tokens** (logo, colours, fonts) | A genuine product expansion. The logo being uneditable is a real limitation — "I want to change the logo" currently requires a developer |

**Recommendation: (a) now, (b) when the migration can be written and verified, (c) only if the owner asks.**

The register noted (b) as a Stage 08 candidate. Stage 08 did **not** do it, for two reasons: it is explicitly `Approval required: YES`, and it needs a data migration, which §15 forbids creating without approval.

**The specific question only the owner can answer:** is (c) wanted? Everything else is sequencing.

**Blocks Stage 08 completion?** **No** for the audit, which is complete. **Yes** for any Appearance implementation, including the rename — (a) is still a D-06 sub-option, and Stage 08 does not get to pick one.

---

## 4. Task G — scheduler audit (D-12)

### 4.1 What was verified, and what was corrected

Everything below is true regardless of where the application runs, so all of it was in scope. Each row is asserted behaviourally in `tests/stage08-scheduler.test.ts` (28 tests).

| Property | Before Stage 08 | After |
|---|---|---|
| Who may schedule / cancel | `system.config` at the action; **no service-level check** | `need(actor)` in the service too |
| Past timestamps | refused | refused (incl. the current instant, so "now" cannot race the runner) |
| Unknown page key | refused | refused |
| Empty draft | refused | refused (an empty schedule cannot blank a live page on a timer) |
| What is published | a **copy** taken at scheduling time, so a later draft edit does not change what was approved | unchanged, and now asserted |
| Timezone handling | `DateTime` compared with `lte: new Date()` — absolute instants, locale-independent | unchanged, and now asserted |
| Idempotent repeat execution | guarded `updateMany` claim-by-update | unchanged, and now asserted |
| Duplicate / concurrent runners | one winner | unchanged, and now asserted with **five concurrent runners** |
| **Revision recorded atomically** | **NO** — the revision `create` was a separate statement outside any transaction, so a failure between the two left content published with **no history** | **FIXED** — one interactive transaction |
| Attribution | `scheduledById`, i.e. whoever scheduled it | unchanged, and now asserted |
| Audit record | written | written, now with the version |
| Missing `INTERNAL_REVALIDATE_SECRET` | skipped with a warning, **no literal fallback** | unchanged, and now asserted |
| Failure of one page in a batch | caught per page; the batch continues | unchanged, and now asserted |
| `version` increment | the only transition that did it | now one of six, consistently |

### 4.2 Findings recorded, not fixed

**S08-5 — the due-ness filter does not do what it reads like.** `getDueSchedules` filters on `scheduledSections: { not: { equals: null } }`, which reads as "skip rows with nothing to publish" and does **not** exclude a database NULL in a nullable `Json` column. Such a row is returned as due.

The consequence is bounded and safe: `executeScheduledPublish` guards on `Array.isArray(scheduled) && length > 0` and declines, so nothing is published and no live page is blanked. The cost is one wasted row per run. Fixing the predicate means choosing between Prisma's `DbNull` and `JsonNull` semantics for this column, which changes which rows a production query returns — so Stage 08 **asserts the real behaviour** and leaves the cleanup to Stage 09 rather than guessing.

**The localhost revalidation target.** `triggerRevalidation` posts to `http://localhost:${PORT}`. On multiple instances only the publishing replica's cache is flushed. The target must become the public base URL — which depends on the hosting decision D-12 has not made.

### 4.3 The deployment-neutral contract

Whatever eventually decides *when* to run calls one exported function:

```
runDuePublications(): Promise<number>   // claims due schedules, publishes, revalidates; returns the count
startScheduler(): void                  // the current in-process setInterval, unref'd
stopScheduler(): void
```

Everything that makes repeated or concurrent execution safe lives **below** that function, in `executeScheduledPublish`'s claim-by-update. So an in-process timer, a platform cron, a CI job or a manual admin trigger are all equally safe callers. **Choosing between them is the blocked decision; being callable from any of them is not, and is now true and tested.**

### 4.4 ► DECISION NEEDED — D-12

**The exact decision:** how scheduled publication is triggered in production — and whether it is wanted at all, given it was a deferred open question in the Blueprint yet was built in Phase D.

| Option | Consequence |
|---|---|
| **(a) External cron hitting an authenticated route; remove the in-process timer** | The only option that guarantees delivery and works on any platform, and it reuses the authenticated internal-endpoint pattern Stage 01 hardened. **Needs:** a platform cron entry, `INTERNAL_REVALIDATE_SECRET` configured, and the revalidation target changed from `localhost` to the public base URL |
| **(b) Keep in-process; require a long-lived single instance** | Constrains the hosting choice for one feature. Never fires on serverless or scale-to-zero; on multiple replicas every replica runs it (contained by the claim-by-update, but wasteful) |
| **(c) Keep as-is and accept best-effort delivery** | A scheduled publish can silently never happen |

**Recommendation: (a)**, deferred until the hosting platform is settled.

**Blocks Stage 08 completion?** **No** for correctness — the scheduler's safety properties are now verified and the atomicity defect is fixed. **Yes** for operational integration, which is marked **BLOCKED** and is not claimed as done.

---

## 5. ► DECISION NEEDED — D-07, revision retention

### 5.1 Current state, re-verified

No retention of any kind. `revisionNo` increments monotonically; every publish stores a full snapshot JSON; `listRevisions` defaults to a page size of 50 but **prunes nothing**. `onDelete: Cascade` means deleting a layout row destroys its history.

Stage 08 asserts this rather than describing it: twelve consecutive publishes leave **twelve** revisions, and the service exports **no** function matching `prune|purge|deleteRevision|trimRevision|cleanup`.

### 5.2 What Stage 08 did instead

Everything recovery-related that needs no policy:

- previous revisions readable under RBAC — **and now authorized at the service level too**, which they were not;
- restore prepares a **draft** and never touches `publishedSections`;
- a restored draft reaches the public site only after an explicit publish;
- history ordered by `revisionNo`, which is unique per page key, so equal timestamps cannot reorder it;
- a **failed restore changes nothing** — including the new malformed-snapshot case;
- restore and publish are separately auditable;
- history reads are paginated, so an unbounded page key cannot produce an unbounded query.

### 5.3 The decision

**The exact decision:** what retention policy applies, and whether the first pruning run may delete existing history.

| Option | Consequence |
|---|---|
| **(a) Keep the latest 50 per page key, prune on publish** | Covers realistic rollback need for a 15-key site and matches the existing `listRevisions` default, so the UI needs no change. **The first run on existing history is an irreversible delete** |
| **(b) Keep by age** (e.g. 180 days) | A rarely-edited page loses its only history while a busy page keeps dozens — worse for this site shape |
| **(c) Keep everything** | No deletion risk. Unbounded growth: a full JSON snapshot per publish, forever |
| **(d) Count plus a floor** (e.g. 50, never fewer than 10 regardless of age) | (a)'s predictability with a guard against an aggressive count |

**Recommendation: (a)**, with two conditions: the first run must **log what it removes**, and it should be runnable in a dry-run mode first.

**Blocks Stage 08 completion?** **No.** The directive is explicit that D-07 remains an owner decision and that Stage 08 must "preserve existing revisions and prepare a decision-ready retention proposal without enabling destructive cleanup". That is what was done. **Retention itself is BLOCKED.**

---

## 6. Decisions reviewed for Stage 09 boundaries

Reviewed as §3 asks, and **not acted on**:

| ID | State | Stage 09 boundary |
|---|---|---|
| **D-09** | Unapproved. `InfoPage` has no draft/published pair; `saveInfoPageDraft` tells the editor to "create a new draft revision" and **no such mechanism exists**, so editing a live legal page degrades or removes it | Stage 09 owns the engineering fix; the publication workflow half is the owner's |
| **D-13** | Unapproved. All seven legal pages serve `noindex, nofollow` **and** a visitor-facing "Draft — pending owner and legal review" banner | Stage 08 published no legal content and changed no legal text |
| **D-14** | Unapproved. The homepage emits **zero** JSON-LD blocks; there is no sitewide `Organization` or `WebSite` entity. Needs owner-supplied publisher facts | Stage 08 introduced no `Organization`/`WebSite` JSON-LD and changed no publisher identity |

---

## 7. Summary — what the owner is being asked

| # | ID | The question | Recommendation | Blocks Stage 08? |
|---|---|---|---|---|
| 1 | **D-07** | Revision retention policy; may the first prune delete existing history? | (a) 50 per page key, with logging and a dry run | **No** — retention is BLOCKED, recovery is done |
| 2 | **D-05** | Which store owns footer menu columns, and what happens to the loser's data? Should `DIRECTORY_LINKS` stay uneditable? | (a) `SiteConfig` owns, **migrate nav rows first** | **No** — blocks footer implementation only |
| 3 | **D-06** | What is the Appearance screen for? Is real theming (logo, colours, fonts) wanted? | (a) rename now, (b) when the migration is verified, (c) only on request | **No** — blocks Appearance implementation only |
| 4 | **D-12** | How is scheduled publication triggered in production — and is it wanted at all? | (a) external cron + authenticated route | **No** for correctness; **Yes** for operational integration |

**None of the four blocks Stage 08's completed work.** Each blocks a specific implementation that Stage 08 therefore did not attempt. Nothing was approved by implication, and no default was invented.
