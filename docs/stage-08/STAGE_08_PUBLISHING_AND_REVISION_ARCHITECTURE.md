# Stage 08 — Publishing and Revision Architecture

**Stage:** 08 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`

The design record for Tasks A–D and I. Audit findings are in §1; the state machine in §2; the concurrency, recovery and cache contracts in §3–§5.

---

## 1. Task A — the audit, produced before any code changed

The directive required a state-transition and persistence matrix **before** changing code, and warned: *"Do not claim a feature exists merely because a database table or UI button exists."* The matrix was built by reading `lib/cms/pageLayoutService.ts` (535 lines at the time), `app/admin/page-layout-actions.ts`, `lib/cms/scheduledPublishRunner.ts`, `views/admin/AdminPageLayoutEditor.tsx`, `app/api/internal/revalidate/route.ts` and `prisma/schema.prisma`.

### 1.1 Persistence surface, as found

`PageLayout` — one row per `pageKey`, `pageKey` unique:

| Column | Written by | Read by |
|---|---|---|
| `draftSections` | saveDraft, resetDraftToPublished, restoreDefaults, restoreRevision | `getDraftSections` (staff preview); schedulePublish copies it |
| `publishedSections` | publishLayout, executeScheduledPublish | `getPublishedSections` (public) |
| `scheduledSections` / `scheduledAt` / `scheduledById` | schedulePublish, cancelSchedule, executeScheduledPublish (clears) | getDueSchedules |
| `publishedAt` / `publishedById` | publishLayout, executeScheduledPublish | Admin display |
| `updatedById` | every mutation except executeScheduledPublish | — |
| **`version`** | **executeScheduledPublish ONLY** | **nothing** |

That last row is the whole of KD-09 in one line: the concurrency column existed from the start, was written by one of eight transitions, and was read by nothing at all.

`PageLayoutRevision` — `@@unique([pageKey, revisionNo])`, `@@index([pageKey, createdAt])`, `onDelete: Cascade`. Created by publishLayout and executeScheduledPublish only.

### 1.2 The eight capability questions, answered honestly

| Capability | Verdict as found | Evidence |
|---|---|---|
| Immutable revision snapshots | **YES** | no update or delete path for `PageLayoutRevision` exists anywhere; `snapshot` is written once at create |
| Deterministic revision ordering | **YES** | `@@unique([pageKey, revisionNo])` + `orderBy: { revisionNo: 'desc' }`. Ordering is by number, not timestamp, so publishes in one clock tick cannot reorder |
| Restore a revision into a new draft | **YES** | writes `draftSections` only |
| Publishing a restored draft | **YES** | restore then publish works; the restored draft is the publish source |
| Correct author / timestamp attribution | **PARTIAL** | revisions carry `actorId`, `actorName`, `createdAt`. `actorName` is denormalised at create, so a later rename leaves history showing the old name — arguably correct for an audit trail. Scheduled publishes attribute to `scheduledById`, which is right |
| Permission enforcement | **PARTIAL** | enforced at every Server Action. But `listRevisions` and `getRevision` took **no actor** and performed **no check** — safe only because every caller happened to be guarded |
| Auditability | **YES**, all eight transitions | each writes an `AuditLog` row |
| Safe handling of missing / malformed revisions | **PARTIAL** | existence and `pageKey` ownership were checked; the snapshot's **shape was not** |

### 1.3 Confirmed defects

| ID | Defect | Severity |
|---|---|---|
| **KD-09** | `saveDraft` accepted no `expectedVersion`, never read `version`, never incremented it — and `LayoutRow`, the payload the editor receives, did not even carry the field. Two editors on one page: **last write wins, silently** | **High** — silent data loss |
| **KD-10** | `publishLayout` built its `$transaction([...])` array by `await nextRevisionNo(pageKey)`. **The array argument is fully evaluated before `$transaction` is called**, so the read happened before the transaction opened. `executeScheduledPublish` was worse: its revision `create` was not in a transaction with the `updateMany` **at all** | **High** — P2002 on concurrent publish; a scheduled publish could publish and then fail to record history |
| **KD-08** | `const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); }` — called by **`saveDraftAction`** as well as every publish path. Saving an unpublished draft for one page key flushed the **entire public site** | **Medium** — D-08, approval NOT required |
| **S08-1** | `restoreRevision` wrote `revision.snapshot` straight into `draftSections`, bypassing `UpdateDraftSchema`, `validateSectionTypes`, `validateBlockLimits` and `validateUniqueIds`. The one write path into a draft with no validation at all | Medium |
| **S08-2** | `version` was maintained by one of eight transitions, so it was unusable as a token even where read | Medium (subsumed by the KD-09 fix) |
| **S08-3** | `listRevisions` / `getRevision` had no service-level authorization. Revision snapshots contain unpublished draft content | Low (actions guarded them) |
| **S08-4** | `getRevision(revisionId)` takes no `pageKey`, so it can read any revision by id | Low (no action exposes it) |
| **S08-5** | `getDueSchedules`'s `scheduledSections: { not: { equals: null } }` filter does not exclude a database NULL in a nullable `Json` column | Low — bounded by the execution guard |

---

## 2. The state machine after Stage 08

```
                       ┌──────────────── restoreDefaults ────────────────┐
                       │                                                 │
                       ▼                                                 │
  (no row) ──saveDraft──►  DRAFT  ──saveDraft(v)──►  DRAFT               │
                            │  ▲                                         │
          resetDraftToPublished │                                        │
                            │  └──── restoreRevision(validated) ◄────────┤
                            │                                            │
              ┌─────────────┴──────────────┐                             │
              │                            │                             │
        publishLayout              schedulePublish                       │
              │                            │                             │
              ▼                            ▼                             │
         PUBLISHED  ◄──executeScheduledPublish── SCHEDULED ──cancelSchedule┘
         + revision          (atomic, idempotent)
```

| # | Transition | Service fn | version | Revision | Cache tier | Audit |
|---|---|---|---|---|---|---|
| T1 | edit → draft saved | `saveDraft` | **+1, guarded** | no | draft | `draft_save` |
| T1′ | stale save refused | `saveDraft` | **unchanged** | no | none | **`draft_save_conflict`** |
| T2 | draft → published | `publishLayout` | **+1** | **yes, atomic** | **publish** | `publish` |
| T3 | draft ← published | `resetDraftToPublished` | **+1** | no | draft | `reset_draft` |
| T4 | draft ← registry defaults | `restoreDefaults` | **+1** | no | draft | `restore_defaults` |
| T5 | draft → scheduled | `schedulePublish` | **+1** | no | draft | `schedule` |
| T6 | scheduled → cancelled | `cancelSchedule` | **+1** | no | draft | `cancel_schedule` |
| T7 | scheduled → published | `executeScheduledPublish` | **+1** | **yes, atomic** | via runner | `scheduled_publish` |
| T8 | revision → draft | `restoreRevision` | **+1** | no | **draft** | `restore_revision` |

Bold entries are what Stage 08 changed. **T8 is draft-tier on purpose**: a restore must not publish, which is Task D requirement 4.

---

## 3. Task B — the concurrency contract

### 3.1 The token, and why it is required rather than optional

```ts
export type ExpectedVersion = number | 'unchecked';

const UpdateDraftSchema = z.object({
  pageKey: z.string().min(1).max(120),
  sections: z.array(SectionSlotSchema).max(50),
  expectedVersion: z.union([z.number().int().min(0), z.literal('unchecked')]),
});
```

`expectedVersion` is a **required** field, and the only way to skip the check is to spell the opt-out. That shape is deliberate:

- a caller **cannot forget** the token, because TypeScript and Zod both demand the field. `expectedVersion?: number` would have let any future action silently reopen KD-09 — which is how the hole was created in the first place;
- the opt-out is visible in review and in a diff. It exists for callers with no loaded editor state to be stale against: service-level tests, maintenance scripts, server-side automation.

The **interactive** path has no opt-out at all. `saveDraftAction(pageKey, sections, expectedVersion: number)` takes a plain number, so the Builder always sends a real token.

When the contract changed, the compiler named all nine call sites. The six service-level test callers now read `expectedVersion: 'unchecked'`, which documents their intent at the call site rather than hiding it in a default.

### 3.2 The guard is one statement

```ts
const { count } = await prisma.pageLayout.updateMany({
  where: expectedVersion === 'unchecked'
    ? { pageKey }
    : { pageKey, version: expectedVersion },
  data: { draftSections: sections, updatedById: actor.id, version: { increment: 1 } },
});
if (count === 0) throw new ServiceError('conflict', CONFLICT_MESSAGE, details);
```

The **database** decides whether the token still matches, in the same statement that writes. There is no window between checking and writing, so no amount of concurrency can slip between them. `count === 0` means someone else saved first and **nothing was written**.

The no-row case is handled with `create`, not `upsert`, so a row appearing between the read and the write raises a unique violation instead of silently overwriting the draft the other editor just created — the same protection, applied to the one case where no version exists yet.

### 3.3 What the operator is told

A refused save throws `ServiceError('conflict', …)` carrying:

```ts
interface SaveConflictDetails {
  pageKey: string;
  expectedVersion: number;   // what the editor thought it was editing
  currentVersion: number;    // what is actually stored
  lastEditedBy: string | null;
  lastEditedAt: string | null;
}
```

`'conflict'` already existed in `ServiceErrorCode`, so it flows through `toActionError` unchanged — no contract change was needed.

The message leads with the fact that matters: *"Your edits have NOT been saved."* A refusal that does not say that is worse than the silent overwrite, because the operator keeps working on a draft the server has already rejected.

The refusal is **audited** as `page_layout.draft_save_conflict`. An operator asking "where did my changes go?" now has an answer in the log — the thing the previous last-write-wins behaviour made impossible.

### 3.4 Atomic, retry-safe revision numbering

```ts
async function publishWithRevision(pageKey, sections, revision, mutateLayout) {
  for (let attempt = 1; attempt <= REVISION_RETRY_LIMIT; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await mutateLayout(tx);
        if (!updated) return null;                       // caller aborted
        const last = await tx.pageLayoutRevision.findFirst({ /* inside the tx */ });
        await tx.pageLayoutRevision.create({ data: { revisionNo: (last?.revisionNo ?? 0) + 1, … } });
        return updated;
      });
    } catch (err) {
      if (isUniqueViolation(err) && attempt < REVISION_RETRY_LIMIT) continue;  // nothing committed
      throw err;
    }
  }
  throw new ServiceError('conflict', 'Could not allocate a revision number after repeated attempts…');
}
```

Three properties, each load-bearing:

1. **Both writes in one interactive transaction.** A published layout can never exist without its revision. That was the `executeScheduledPublish` failure mode exactly.
2. **The number is read inside the transaction.** The old code read it while building the `$transaction` array, i.e. before the transaction opened.
3. **The whole transaction is retried on P2002.** Bounded at five attempts, so a pathological loop cannot hold a connection.

> **Honest caveat on (2) and (3).** Mutation testing showed that removing either — or both — leaves the concurrency suite green. The reason is PostgreSQL's row lock: `publishLayout`'s own `pageLayout.update` locks the layout row, so concurrent publishes of the same page key serialise on that lock and the revision-number read never actually races. The **duplicate-number** half of KD-10 therefore appears unreachable through `publishLayout` in practice, and the retry loop is defensive rather than demonstrably load-bearing.
>
> Property (1) is a different matter and is genuinely load-bearing: `executeScheduledPublish` really did write the layout and its revision as two statements outside any transaction, so a failure between them published content with no history. Mutation **M9** kills that. See `STAGE_08_TEST_AND_MUTATION_REPORT.md` §4 for both survivors and why they survived.

`mutateLayout` receives the transaction client, so each caller keeps its own update shape — an immediate `update`, or the scheduled runner's guarded `updateMany` — while sharing the atomicity. Returning `null` aborts without recording a revision, which is how the scheduled path declines an already-consumed schedule.

### 3.5 Why `version` had to move on six transitions, not one

A token that only some writes advance is not a token. If a publish or a restore left `version` untouched, an editor holding a pre-publish value would still match and could overwrite the published draft. T1, T2, T3, T4, T5, T6, T7 and T8 all increment it now.

### 3.6 How it is proven

`tests/stage08-concurrency.test.ts` (23 tests) runs **real** overlapping operations against the isolated test database, because both defects are races that a single-threaded test cannot see and a source-text assertion cannot see at all:

- two simultaneous saves from one loaded version → exactly one succeeds, one `conflict`, **one** increment;
- five simultaneous saves → one succeeds, four refused;
- **five concurrent publishes → five distinct, contiguous revision numbers and zero failures** (the KD-10 proof);
- the stale writer's content is absent and the first writer's content is intact;
- the refused save does not advance the version, and is audited;
- a reload-and-retry succeeds;
- authorization is refused at the service for save, publish, list, read and restore.

---

## 4. Task C — revision recovery

### 4.1 Restore validates before it writes

```ts
const parsed = z.array(SectionSlotSchema).max(50).safeParse(revision.snapshot);
if (!parsed.success) throw new ServiceError('validation',
  `Revision #${revision.revisionNo} cannot be restored because its stored snapshot is not a valid layout. ` +
  'Your current draft has not been changed. Please choose a different revision.');
```

This closes S08-1. A restore was the only write path into a draft with no validation, so a malformed snapshot — hand-edited JSON, a row from an older shape, a partial write — became the operator's working draft and then failed confusingly on the *next* save, pointing at the wrong cause.

The message names the revision number so the operator can choose another, and states that their draft is untouched. Task C requires a failed restore to change nothing, and the existing draft is left exactly as it was.

### 4.2 What recovery guarantees, all asserted

`tests/stage08-revision-recovery.test.ts` (18 tests):

- a snapshot stays as published, not as the draft later became;
- restore writes the draft, leaves `publishedSections` untouched, and creates **no** revision of its own — a restore is not a publish;
- the restored draft reaches the public site only after an explicit publish, which then records a new revision;
- history is ordered by `revisionNo`, and snapshots are not exposed in the listing;
- a non-existent id, a **foreign page key**, and a malformed snapshot are each refused with the draft intact;
- a valid revision still restores after a malformed one was refused;
- restore and publish are separately auditable;
- history reads are paginated.

### 4.3 Retention — deliberately absent

D-07 is unapproved. Stage 08 enforces **no** retention and asserts that: twelve consecutive publishes leave twelve revisions, and the service exports no function matching `prune|purge|deleteRevision|trimRevision|cleanup`. The decision-ready proposal is in `STAGE_08_GLOBAL_CONTROLS_AND_DECISIONS.md` §5.

---

## 5. Task D — the cache contract

### 5.1 Two tiers, chosen by what a mutation writes

`lib/cms/layoutCachePaths.ts` holds the `pageKey → paths` map; `app/admin/page-layout-actions.ts` holds the two helpers.

```ts
const revalidateDraft   = () => revalidatePath(ADMIN_LAYOUT_PATH);
const revalidatePublish = (pageKey) => { revalidatePath(ADMIN_LAYOUT_PATH);
  for (const t of publishedPathsFor(pageKey)) revalidatePath(t.path, t.type); };
```

| Tier | Actions |
|---|---|
| **draft** | `saveDraftAction`, `resetDraftAction`, `restoreDefaultsAction`, `restoreRevisionAction`, `schedulePublishAction`, `cancelScheduleAction` |
| **publish** | `publishLayoutAction` |

The tier follows what the action **writes**, not what it is called. All five of the non-save draft-tier actions write draft or schedule columns only.

### 5.2 Why a draft save needs no public invalidation at all

The staff preview renders through `isStaffDraftPreview()`, which calls `draftMode()`. Reading draft mode opts the route out of static rendering for that request, so the preview is already dynamic and always reflects the latest saved draft. **There is no cached public artefact for a draft write to invalidate** — which is why the correct scope for a draft save is the admin route alone. Stated as `draftWriteNeedsPublicRevalidation()` so the reasoning has one home and can be asserted.

### 5.3 The map, and dynamic segments

All 15 page keys are covered; `unmappedPageKeys()` must be empty, and a test asserts it, so a key added later cannot publish and invalidate nothing.

A `template:*` key governs every entity of its type, so its target is a route **pattern** — `/articles/[slug]` — which `revalidatePath(pattern, 'page')` applies to every generated instance. That is the fan-out a template change needs and still far narrower than the whole site. D-08 names tag-based invalidation as the long-term shape for these keys; this is the intermediate step it describes.

An unknown key returns an **empty** list, never `/`. A fallback to the root would quietly restore the defect this module removes.

### 5.4 The internal endpoint, unchanged

Stage 01 hardened `POST /api/internal/revalidate`: no secret → **503 and disabled**, no literal fallback, constant-time comparison, and an allow-list of exactly `['/']` so it is not a general cache-flush endpoint. Stage 08 changed none of it and asserts all four properties.

### 5.5 How it is proven

`tests/stage08-cache-scope.test.ts` (28 tests) intercepts `revalidatePath` and drives the **real Server Actions**, so it asserts the calls each action actually makes:

- every draft-tier action makes **exactly one** call, to the admin route;
- none of them calls `revalidatePath('/', 'layout')` — the exact call the old helper made on all of them;
- saving a draft for `directory:competitors` does **not** invalidate `/competitors`;
- each publish invalidates the admin route plus precisely its own paths;
- every page key publishes to at least one public path.

---

## 6. Task I — the Builder save/publish UX

| Step | Behaviour |
|---|---|
| Load draft | the server payload now carries `version`; the editor stores it as `loadedVersion` |
| Make changes | unchanged dirty tracking |
| Save draft | sends `loadedVersion`; on success advances it to the version the server returns, so consecutive saves from one editor never self-conflict |
| **Version conflict** | a **persistent `role="alert"` banner**, not a toast. Names both versions, who last edited and when. **The unsaved edits stay in the editor** |
| Reload after conflict | an explicit *"Reload current version"* button behind a confirmation, plus *"Keep editing without reloading"* |
| Publish | unchanged, explicit, behind a confirmation |
| Restore revision | draft-tier; does not publish |
| Preview latest saved draft | unchanged Stage 06 contract — the canvas shows the last **saved** draft and says so |
| Navigate away with unsaved changes | unchanged `beforeunload` guard and page-switch confirmation |

The conflict banner is persistent on purpose. A toast saying "your work was not saved" that then disappears is worse than no message, because the operator carries on editing a draft the server has already rejected. And the edits are **deliberately preserved** — discarding them would turn a recoverable conflict into data loss, which is the opposite of what Task B requirement 3 asks for. Losing them is always the operator's explicit choice.

No autosave, no second renderer, no undo/redo controls. All three are asserted in the browser spec.

---

## 7. Task H — the EditorialHero correction

Found during Stage 07's Task B investigation and reported there rather than fixed, because it changes the public markup of the homepage's most prominent element.

| Before | After |
|---|---|
| `<article onClick={() => onSelectArticle(story)}>` — a div with a click handler: not focusable, not keyboard-reachable, not announced as a link, **no `href`** | `<article>` containing **one** `next/link` anchor wrapping the whole card |
| lead CTA was a `<button>` doing client-side navigation | an anchor styled identically, with `aria-label="<CTA>: <title>"` |
| `useRouter` in `EditorialHeroBlock` | **gone** — one of the four `useRouter` dependencies Stage 07 measured when it declined the server-component conversion |
| `'use client'` on `EditorialHero` | **removed** — with the handler gone it has no client behaviour |

Deliberate choices: **one link per article** (the directive forbids unnecessary duplication, so the lead headline stays text and a card has a single anchor rather than three), **no nested interactive elements** (the "Read →" affordance is a plain `aria-hidden` span), and focus-visible rings, which paint only where a keyboard user is already focused. Layout classes moved onto the anchor and `group` moved to the `<article>`, so every existing `group-hover:` rule still fires.

Proven in `tests/stage08-hero-links.test.ts` (22 tests) on real rendered HTML, and in Chromium at **1280 / 768 / 390** with keyboard navigation, focus, Enter-to-navigate and no horizontal overflow.

---

## 8. Files changed

### 8.1 New

| File | Purpose |
|---|---|
| `lib/cms/layoutCachePaths.ts` | the `pageKey → paths` map and the two-tier contract (Task D) |
| `tests/stage08-concurrency.test.ts` | real concurrent operations (Task B) |
| `tests/stage08-revision-recovery.test.ts` | restore, ordering, immutability, malformed snapshots (Task C) |
| `tests/stage08-cache-scope.test.ts` | the invalidation boundary (Task D) |
| `tests/stage08-scheduler.test.ts` | scheduler safety and idempotence (Task G) |
| `tests/stage08-hero-links.test.ts` | semantic links (Task H) |
| `tests/stage08-global-controls.test.ts` | footer and Appearance audits (Tasks E, F) |
| `tests/stage08-quality-gate-enforcement.test.ts` | carried-forward mutation gap 2 (Task J) |
| `e2e/stage08-publishing.spec.ts` | Chromium: hero links at three widths, conflict UX, canvas contract |

### 8.2 Modified

| File | Change |
|---|---|
| `lib/cms/pageLayoutService.ts` | `ExpectedVersion` + `SaveConflictDetails`; version-guarded `saveDraft` with `create` for the no-row case; `publishWithRevision` (atomic, retry-safe); `version` incremented on six transitions; snapshot validation in `restoreRevision`; `need(actor)` on `listRevisions` / `getRevision`; conflict auditing |
| `app/admin/page-layout-actions.ts` | `revalidateDraft` / `revalidatePublish` replace `rev()`; `saveDraftAction` takes a required `expectedVersion`; every action returns the new `version`; `listRevisions` passed an actor |
| `app/admin/(dashboard)/website/page.tsx` | sends `version` in the layout payload |
| `views/admin/AdminPageLayoutEditor.tsx` | `LayoutRow.version`; `loadedVersion` + `conflict` state; conflict banner; `reloadAfterConflict` |
| `views/admin/AdminWebsitePage.tsx` | mirrors `LayoutRow.version` |
| `components/sections/EditorialHero.tsx` | semantic links; `onSelectArticle` removed; no longer a client component |
| `components/blocks/registry.tsx` | `EditorialHeroBlock` no longer uses `useRouter` |
| `components/public/IntroBanner.tsx` | the mobile focal point renders (Task F defect fix) |
| `scripts/cache-invalidation.mts` | wired: calls the authenticated internal revalidate endpoint, waits for the server to settle, and documents the two server modes |
| `e2e/global-teardown.ts` | *(Stage 07)* unchanged — still clears `PageLayout` / `PageLayoutRevision` |
| `tests/batch-c-revisions.test.ts` | 7 source-text assertions updated to the new implementation, each with its reason |
| `tests/batch-d-scheduling.test.ts` | 2 updated likewise |
| `tests/stage03-draft-publish-causation.test.ts`, `tests/stage04-property-validation.test.ts`, `tests/stage05-registry-retirement.test.ts` | `expectedVersion: 'unchecked'` at six call sites; prisma mocks updated to the service's actual call shape |
