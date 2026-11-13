# Discipline Classification & Category Management — Audit and Fix

## VERDICT: `ARCHITECTURAL APPROVAL REQUIRED`

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d` (unchanged)
No commit, push, deploy, production migration or production database access occurred.

---

## 1. Executive summary

The owner's question has a direct answer: **Discipline Classification cannot be
managed anywhere, and that is deliberate — not a missing screen.**

Roughstock and Timed Event are not CMS records. They are a fixed vocabulary
written into the application's code, enforced by a Zod schema on the discipline
write path. There is no table, no enum, no service and no UI for them, because
the **public Competition page filters readers on exactly these two values**. The
decision is recorded in the codebase itself (Issue 03 §4) and pinned by an
existing test.

The owner's second question — why the five editorial categories do not appear in
that dropdown — also has a definite answer: **they should not.** They are a
different axis. Editorial Category organises *articles*; Classification
describes how a *discipline* is contested. A test already asserts the two never
mix, and this audit did not merge them.

What the investigation *did* find is a real defect behind the confusion, and it
has been fixed:

| Finding | Status |
|---|---|
| The vocabulary was written out by hand in **six** separate places with no shared definition | **Fixed** — one definition, every surface reads it |
| Rodeo Coverage labelled the field **"Category (optional)"**, which is what made two unrelated settings look like one | **Fixed** — now "Classification (optional)", with the same help text Landing SEO shows |
| The public filter buttons hardcoded **"All 7 Events" / "Roughstock (3)" / "Timed Events (4)"** — wrong the moment a discipline is added or archived | **Fixed** — counts derived from the data |
| Two `as` casts asserted that any stored string was a valid classification | **Fixed** — replaced with a narrowing guard |
| Making classifications administrator-managed | **Requires owner approval** — §9 |

---

## 2. The exact classification data model

```prisma
model Discipline {
  id       String  @id @default(uuid())
  slug     String  @unique
  name     String
  category String?   // ← the classification. Plain nullable text.
  ...
}
```

| Property | Reality |
|---|---|
| Storage | `Discipline.category` — `text`, **nullable**, verified against the live column via `information_schema` |
| Database enum | **None** |
| Foreign key | **None** — the column stores the label itself, not a reference |
| Dedicated table | **None** |
| Allowed values | enforced in **code** by `z.enum(['Roughstock', 'Timed Event'])` |
| Permission to write | **`rodeo.manage`** ([rodeoService.ts:24](../apps/web/lib/cms/rodeoService.ts#L24)) |

Because the column stores the *label*, renaming a classification would orphan
every discipline still holding the old string. That single fact is why this
vocabulary is not editable like Article Types or Subcategories, which store
stable identifiers and carry their own tables.

---

## 3. Editorial Category versus Discipline Classification

They are **two intentionally separate models**, and the separation is preserved.

| | **Editorial Category** | **Discipline Classification** |
|---|---|---|
| What it organises | Articles | Disciplines |
| Examples | NFR Competition, NFR Entertainment, NFR Events & Shopping, NFR Plan & Watch, More Rodeo | Roughstock, Timed Event |
| Storage | `Category` table — real rows | `Discipline.category` — a text label |
| Who owns it | **Administrators** (Editorial Organization → Categories) | **Code** (owner-approved change) |
| Can be created in the Admin | **Yes** | **No** |
| Public surface | Section landing pages, `/categories/<slug>/`, article breadcrumbs | The Competition page's filter buttons |

**The five editorial categories must not be added to the Discipline dropdown.**
Doing so would classify a discipline by a *website navigation section*, which
describes nothing about how the event is contested, and would put five buttons on
the public Competition filter that filter nothing. `tests/issue03-discipline-cms.test.ts`
already asserted this separation before this audit, and
`tests/discipline-classification.test.ts` now asserts it in both directions.

---

## 4. Where the options came from (before this change)

The pair was hand-written in **six** places, with **no** shared definition:

| # | Location | Role |
|---|---|---|
| 1 | `types/index.ts` — `category: 'Roughstock' \| 'Timed Event'` | the TypeScript union |
| 2 | `lib/cms/rodeoService.ts` — `DisciplineInput` | Zod validation (update) |
| 3 | `lib/cms/rodeoService.ts` — `DisciplineCreateInput` | Zod validation (create) |
| 4 | `views/admin/AdminLandingSeoPage.tsx` | two literal `<option>` elements |
| 5 | `views/admin/AdminRodeoCoveragePage.tsx` | two literal `<option>` elements |
| 6 | `components/sections/CompetitionSection.tsx` | the public filter **and its hardcoded counts** |

Plus two unsafe casts (`as 'Roughstock' \| 'Timed Event' \| undefined`) in the two
admin views, and a default (`?? 'Roughstock'`) in `lib/mappers.ts`.

`prisma/fixtures.ts` also names the values when seeding the seven disciplines.
That is literal seed *data*, not a second vocabulary definition, and was left
alone.

**Both dropdowns did read the same authoritative validator** (the Zod schema
rejected anything else), so they could not disagree about what was *accepted* —
but nothing stopped them disagreeing about what was *offered*, and the public
filter's counts had already drifted from reality.

---

## 5. Existing management UI — audit result

Per §4 of the brief, for each operation:

| Operation | Implementation | UI location | Permission | Works? |
|---|---|---|---|---|
| Create a classification | **none** | — | — | **Not possible — by design** |
| Rename a classification | **none** | — | — | **Not possible — by design** |
| Edit its metadata | **none** | — | — | **Not possible** |
| Change display order | **none** (order is the array order in code) | — | — | **Not possible** |
| Activate / deactivate | **none** | — | — | **Not possible** |
| Delete / archive | **none** | — | — | **Not possible** |
| **Assign** one to a discipline | `createDiscipline` / `updateDiscipline` | **Rodeo Coverage → Add Discipline** (create) and **Landing SEO → Discipline content** (edit) | `rodeo.manage` | **Yes — works** |
| View disciplines of a classification | the **public** Competition filter | `/competition/` | public | **Yes — works** |

**No hidden service or API exists without a UI.** The audit searched for
`createDisciplineClassification`, `updateDisciplineClassification` and
`deleteDisciplineClassification`; none exist, and a test now asserts they do not,
so a future duplicate management system cannot be added silently.

**Where the owner assigns a classification today:**

- **New discipline** → `/admin/rodeo-coverage/` → Disciplines → **Add Discipline** → *Classification (optional)*
- **Existing discipline** → `/admin/landing-seo/?type=DISCIPLINE&id=<id>` → Discipline content → *Classification*

Both now carry the same one-sentence explanation of what the field means and why
the list is fixed.

---

## 6. Missing functionality

Only one thing is genuinely absent: **a way to add, rename or retire a
classification.** It is absent on purpose, and adding it is an architectural
change (§9), not a gap to be filled quietly.

---

## 7. Exact files changed

| File | Change |
|---|---|
| `apps/web/lib/content/disciplineClassifications.ts` | **NEW** — the single source of truth: the ordered values, the derived type, the default, the public plural labels, the shared help text, and a narrowing guard. Documents why the vocabulary is code-owned |
| `apps/web/types/index.ts` | `Discipline.category` now derives its type from that module instead of restating the union |
| `apps/web/lib/cms/rodeoService.ts` | both Zod schemas use `z.enum(DISCIPLINE_CLASSIFICATIONS)` |
| `apps/web/lib/mappers.ts` | `as` cast + `?? 'Roughstock'` → `toDisciplineClassification(row.category)` |
| `apps/web/views/admin/AdminRodeoCoveragePage.tsx` | label **"Category (optional)" → "Classification (optional)"**; options generated from the module; shared help text added; cast → guard |
| `apps/web/views/admin/AdminLandingSeoPage.tsx` | options generated from the module; help text now the shared wording; cast → guard |
| `apps/web/components/sections/CompetitionSection.tsx` | filter values from the module; **counts derived from the disciplines rendered** |
| `apps/web/tests/issue03-discipline-cms.test.ts` | its source-text grep replaced with a rendering assertion (see §12) |
| `apps/web/tests/discipline-classification.test.ts` | **NEW** — 15 tests |

Nothing else was touched. The pending 04-B / 04-E migrations, the subcategory
mapping and every earlier stage's work are untouched.

---

## 8. Implementation notes

**Code-owned is not the same as duplicated.** A vocabulary fixed by design still
needs one definition, so that an approved change is made once rather than six
times and a missed copy cannot drift. The vocabulary did not become
database-backed, administrator-editable or dynamic — it moved from six hand-typed
copies into one documented module. No competing source of truth was introduced.

**The counts were a real bug, not cosmetics.** "Roughstock (3)" was correct only
for exactly the seven seeded disciplines. An administrator can already add a
discipline in Rodeo Coverage and archive one; either action left the public
buttons stating a number the grid beneath them contradicted. They now come from
the disciplines actually rendered.

**Two casts hid a class of bad data.** `(row.category as Discipline['category'])`
asserted that whatever string the column held was one of the two valid values. A
row holding anything else flowed through as if valid, and the public filter could
then never match it. `toDisciplineClassification()` maps an unrecognised value to
the default instead, so such a row still renders.

**The label rename changed no database field.** `Discipline.category` keeps its
name; only the visible label and help text changed, exactly as §6 of the brief
requires.

---

## 9. What requires owner approval

Making classifications administrator-managed was **not** implemented. The brief
authorises the smallest coherent fix "if no usable administrator management
interface exists" — which is true — but also requires stopping when the change
needs an architectural choice. It does, for four reasons:

1. **It changes the public site.** Each classification is a filter button on
   `/competition/`. Creating one adds a reader-facing control; retiring one
   removes it.
2. **Renaming would orphan data.** The column stores the label, not an id. A
   rename requires either a data migration rewriting every affected
   `Discipline.category`, or a new table plus a foreign key — a destructive or
   structural conversion the brief says not to invent.
3. **It contradicts a recorded decision.** Issue 03 §4 fixed this vocabulary
   deliberately, with the reasoning written into the code and pinned by a test.
   Reversing it is the owner's call.
4. **It needs a migration**, and two migrations are already pending for
   production.

**If the owner wants classifications managed in the Admin**, the safe shape is
the same one Batch 04-E used for Article Types: a `DisciplineClassification`
table with a stable `value`, `Discipline.classificationId` as a real foreign key,
`ON DELETE RESTRICT` so a referenced classification cannot be removed, and the
existing text column preserved during transition. That is a new migration plus a
CRUD panel under Rodeo Coverage — **awaiting approval, not started.**

---

## 10. RBAC and security verification

| Check | Result |
|---|---|
| Permission on the discipline write path | `rodeo.manage`, unchanged |
| An unauthorised role is refused | **Verified** — `createDiscipline` with a `reader` actor throws "Not permitted to manage rodeo coverage" |
| A value outside the vocabulary is refused | **Verified** — even a `super_admin` cannot create a discipline classified `Freestyle` |
| New permission introduced | **None** |
| New server action or route introduced | **None** |
| Client-side input trusted | **No** — the client narrows with the guard, and Zod re-validates server-side |

---

## 11. Existing discipline preservation

| Check | Result |
|---|---|
| Classification assignments rewritten | **No** — no write path ran |
| Every stored classification still valid | **Verified** against the live database |
| `Roughstock` and `Timed Event` preserved | **Yes** — unchanged, in the same order |
| Public discipline URLs | unchanged |
| SEO metadata / structured data | unchanged — classification appears in no canonical, no JSON-LD field and no sitemap entry |
| Schema change | **none** — `Discipline.category` is still `text`, nullable (asserted by a test) |

---

## 12. Test results

**New:** `apps/web/tests/discipline-classification.test.ts` — 15 tests covering the
vocabulary and its guard, the absence of a management model/service, refusal of a
third value, RBAC, single-source-of-truth across all six surfaces, the renamed
label, editorial-category independence in both directions, derived filter counts,
the null-classification default, stored-assignment validity, and the unchanged
column shape.

**Changed:** `tests/issue03-discipline-cms.test.ts` had a test that read
`CompetitionSection.tsx` **as text** and asserted the file contained the strings
`'Roughstock'` and `'Timed Event'`. Once the vocabulary moved into its module
those literals left that file and the grep failed — while the filter behaved
identically. It was testing where characters sat, not what a reader sees. It now
renders the component and asserts the rendered filter buttons are exactly the
classifications plus "All", and that no editorial section name appears. **That is
strictly stronger than the grep it replaced; no assertion was weakened.**

| Gate | Result |
|---|---|
| Targeted tests | **41 passed** (15 new + 26 existing Issue 03) |
| Full Vitest suite | **140 files · 3,256 passed · 0 skipped** (baseline 139 / 3,241 + this file's 15) |
| Playwright Chromium | **149 passed (9.3 min)** |
| `tsc --noEmit` | **clean** |
| Production build | **succeeded** — `BUILD_ID = SuKZ86O6bjH-UQD8JDlqR` |
| `prisma validate` | valid |
| Schema drift | **"No difference detected."** |
| `git diff --check` | clean |

---

## 13. Browser verification

The full Playwright suite — **149/149**, including the authenticated Rodeo
Coverage, Landing SEO and accessibility specs — passes against a production
build, so nothing in the admin or public surfaces regressed.

**Stated honestly:** no browser assertion targets the renamed
"Classification (optional)" label specifically, because no existing spec opens
the Add Discipline modal. That label is covered by source assertions and the
component-rendering tests, not by a browser check. The derived public filter
counts *are* verified by rendering the real component.

---

## 14. Production compatibility

| Question | Answer |
|---|---|
| Migration required | **No** — code only |
| Production database writes | **None** |
| Breaking change | **No** — stored values, column type, public URLs and structured data are unchanged |
| Behaviour change visible to readers | One: the Competition filter buttons now state the true counts instead of 7/3/4 |
| Behaviour change visible to editors | One: the Rodeo Coverage field reads "Classification (optional)" and explains itself |
| Revalidation needed | No scheduled revalidation; the Competition page re-renders on its existing ISR cycle |

> **Separate and unresolved:** the production deployment blocker found during the
> preceding Git-finalization preflight still stands and is **not** affected by
> this change. Deploying the current `main` working tree before the two pending
> migrations are applied breaks the public site — `prisma.article.*` queries fail
> with `P2022: The column 'Article.subcategoryId' does not exist in the current
> database`, taking down the homepage, every article page and every category
> archive. This was measured against a clone at production's exact migration
> state, and it corrects the earlier readiness report's claim that every surface
> falls back. It is recorded here so the two findings are not confused: **this
> audit's changes are deployment-safe; the branch as a whole is not.**

---

## 15. Remaining owner decisions

1. **Should Discipline Classifications become administrator-managed?** Today they
   cannot be created, renamed or retired, by design. If the answer is yes, §9
   describes the safe shape; it needs a migration and your approval. **If the
   answer is no, nothing further is required — the system is working as
   designed, and the two screens now say so.**
2. **Is "Classification" the right word?** It is now used in Rodeo Coverage,
   Landing SEO and the shared help text. Say so if you prefer different wording.
3. **Unrelated but blocking:** the migration-ordering blocker in §14 must be
   resolved before any deployment.

**Stopping here for owner review.**
