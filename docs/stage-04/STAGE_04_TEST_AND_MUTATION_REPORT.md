# Stage 04 — Test & Mutation Report

**Stage:** 04 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

---

## 1. Executed results

| Command | Status | Result |
|---|---|---|
| `npx vitest run` | **EXECUTED** | **87 files · 1822 tests · 1821 passed · 1 failed (known KD-01) · 0 skipped · 275.79s** |
| `npx tsc --noEmit` | **EXECUTED** | **0 errors** |
| `npx next build` | **EXECUTED** | **SUCCESS (exit 0)** — full route manifest generated, SSG + dynamic routes resolved |
| Mutations S4-M1 / M2 / M3 | **EXECUTED** | each turned the suite red, then restored green |
| `npm run test:routes` | **ATTEMPTED → BLOCKED** | precise cause in §5 |
| `npm run test:cache` | **BLOCKED** | §5 |
| `npm run test:e2e` | **BLOCKED** | §5 |
| `npm run test:migration` | **BLOCKED** | §5 — creates a throwaway database; not authorized |

**Baseline movement**

| | Files | Tests | Passing | Known failures | Skipped |
|---|---|---|---|---|---|
| Stage 03 (reported) | 84 | 1732 | 1731 | 1 (KD-01) | 0 |
| Stage 03 (re-measured at preflight) | 84 | 1732 | 1731 | 1 | 0 |
| **Stage 04** | **87** | **1822** | **1821** | **1 (KD-01)** | **0** |
| Change | +3 | **+90** | +90 | unchanged | unchanged |

**The single failure is KD-01**, unmodified:

```
× Stage 03 Task D — homepage deduplication invariant (KNOWN FAILING, Stage 05)
  > no article appears more than once across resolved homepage slots
  → KNOWN DEFECT (KD-01, scheduled for Stage 05): 7 article(s) resolved into more than
    one homepage slot — hero-sec-02 x2, art-02 x2, art-03 x2, art-04 x2, art-05 x2,
    fixture-article-entertainment-article x2, fixture-article-events-shopping-article x2.
```

Its assertion was not skipped, weakened or altered. Stage 05 owns it.

---

## 2. New tests — 90 across 3 files

| File | Tests | Covers |
|---|---|---|
| `tests/stage04-property-fixes.test.ts` | **34** | Task D (3 fixed properties), Task B (consolidation + family caps), Task E (`landing-stat-pills`), Task F (dependency metadata) |
| `tests/stage04-property-validation.test.ts` | **34** | Task C — drives the real `saveDraft` with a mocked Prisma client and asserts what it accepts and rejects |
| `tests/stage04-editor-dom.test.ts` | **22** | Task A (helpText in the DOM, ARIA association) + Task F (dependency guidance rendering) |

Every assertion is on observable output or a real function's behaviour. **None reads source text.** The Stage 03 quality gate confirms Stage 04 introduced zero new structural-assertion violations.

### 2.1 What each group proves

**Task A — helpText reaches the DOM (10 tests).** The fix is proven for all **8** types the shared field handles, with sentinels per type. Also: rendered exactly once (no duplication), `aria-describedby` points at a present element, `htmlFor` binds label to input, a property with no helpText emits no description element and no `aria-describedby`, the boolean variant still places its label after the control, and the stored value is rendered so editing starts from what is saved.

**Task B — consolidation (6 tests).** Object-identity assertion (one definition per type), both shared blocks still available on both families, per-family caps resolve correctly, **the stricter landing cap is now enforced** (3 blocks → `canAddBlock` false on landing, true on homepage), fallback for blocks without `familyLimits`, and default layouts still build for all four families with no duplicate defaults.

**Task C — validation (34 tests).** Numeric bounds including non-numeric and fractional rejection; select options; booleans; URL and image schemes with `javascript:` and `data:` both rejected; text markup including the three cases the old `/<script/i` check missed (`onerror=`, `<svg onload>`, `<iframe>`); length limits; featured id lists with a 50-id cap; undeclared keys accepted-warned-and-preserved; and family-aware instance caps enforced server-side with the landing message naming the family.

Three of these assert the *negative* that matters: `expect(upsertMock).not.toHaveBeenCalled()` — nothing may be written when validation fails.

**Task D — the three fixed properties (15 tests).** Detailed in the registry matrix. Each fix has a paired assertion that the **unset** path renders as before, which is what makes the fixes safe given that production could not be inspected.

**Task E — `landing-stat-pills` (6 tests).** Still offered to the admin; correctly has no renderer; the inert `pills[]` default is gone; label and description now say it is a show/hide control; and the hero renders pills when the toggle is visible and omits them when hidden.

**Task F — dependencies (14 tests).** Metadata correctness for all 20 declarations, including a sweep asserting every `requires` entry names a real sibling property. Behaviourally: guidance appears when unmet, clears when satisfied, treats whitespace as unmet, names the prerequisite by **label not key**, combines with declared helpText without losing either, **preserves the stored value** while unsatisfied, and leaves the field enabled.

---

## 3. Mutation verification

Each mutation reintroduced a specific defect, confirmed the suite goes red, then restored the file from a scratchpad backup taken beforehand. **A test suite that cannot fail proves nothing.**

### S4-M1 — a corrected property stops being passed through

**Target:** `components/blocks/LandingBlocks.tsx`, `LandingHeroBlock`
**Mutation:** removed `backgroundImageUrl={p('heroImageUrl')}` — i.e. reintroduced the exact Task D defect.

```
× Stage 04 Task D — landing-hero.heroImageUrl
  > a set hero image appears as a background image in the rendered hero
× Stage 04 Task D — landing-hero.heroImageUrl
  > the background image is decorative unless alt text is supplied

Tests  2 failed | 32 passed (34)
```

**Restored:** 34/34. *Satisfies the required "at least one corrected property".*

### S4-M2 — a validation rule is removed

**Target:** `lib/cms/pageLayoutService.ts`, `validateOneProp` select branch
**Mutation:** deleted the declared-options check.

```
× Stage 04 Task C — select properties
  > REJECTS a value that is not one of the declared options

Tests  1 failed | 33 passed (34)
```

**Restored:** 34/34. *Satisfies the required "at least one validation rule".*

Note the precision: exactly one test failed. The rule has exactly one guard, and the suite isolates it.

### S4-M3 — help text removed from the shared chrome

**Target:** `views/admin/PropField.tsx`, `PropFieldShell`
**Mutation:** forced the description element to never render — reintroducing the Task A defect at its new single point of control.

```
8 failed | 14 passed (22)
```

Failures spanned both Task A (help text, exactly-once, `aria-describedby`, all-types, boolean label order) and Task F (guidance rendering, combined help + guidance, real registry block). That spread is the point: because chrome is produced in **one** place, breaking it fails broadly instead of silently affecting one branch — which is precisely how the original defect hid.

**Restored:** 22/22, and 90/90 across all three Stage 04 files.

### Residue check

```
$ grep -rn "S4-M1 mutation|S4-M2 mutation|S4-M3 mutation" components/ lib/ views/ tests/
none - clean
```

| File | Mutation | Restored |
|---|---|---|
| `components/blocks/LandingBlocks.tsx` | S4-M1 | ✅ 34/34 |
| `lib/cms/pageLayoutService.ts` | S4-M2 | ✅ 34/34 |
| `views/admin/PropField.tsx` | S4-M3 | ✅ 22/22 |

`tsc --noEmit`: 0 errors after all restorations.

---

## 4. Regressions found and resolved

Stage 04's changes broke **10 pre-existing tests**. All ten were source-text assertions on the *old* implementation's literals, while the guarantees they protected became stronger. Each was retargeted at the new implementation, with a comment naming the behavioural test that now proves it.

| File | Tests | Asserted on | Retargeted to |
|---|---|---|---|
| `batch-i-hardening` | 5 | `val.length > 2000`, `<script`, `/url$/i`, `javascript:`, `maxInstances` | `MAX_PROP_CHARS`, `UNSAFE_MARKUP`, `SAFE_URL`, `UNSAFE_SCHEME`, `resolveMaxInstances` |
| `batch31-unit` | 3 | old validation literals; editor branch strings; the `isUrlProp` heuristic | new validation markers; `PropField.tsx` + `SimplePropField`; type-driven `case 'url'` / `case 'image'` |
| `batch32-unit` | 2 | `maxInstances`; editor prop-type branches | `resolveMaxInstances`; `PropField.tsx` branches |

**This is itself a finding.** Ten tests broke because the code improved, while behaviour was preserved and strictly better. That fragility is exactly what the Stage 03 quality gate exists to stop accumulating — and it is why the retargeted assertions now point at the behavioural tests rather than pretending to prove behaviour themselves.

### A separate, pre-existing fragility: `seo-intel` timeouts

The first full run after Stage 04's changes showed 8 additional failures in `tests/seo-intel.test.ts`, all `Test timed out in 30000ms`.

Diagnosis: **not a functional regression.**

- The file passes **12/12 in isolation** (107.94s total).
- Individual cases take 21–25s even alone, against the former 30s limit.
- Stage 04 added ~90 tests of concurrent load, pushing them over.
- Stage 04 changed nothing under `lib/seo-intel/`.

Resolution: `testTimeout` / `hookTimeout` raised from 30s to 90s in `vitest.config.ts`, with a comment recording exactly this reasoning. **No assertion was changed** — only the allowance for a genuinely slow database suite. After the change the full suite returns to exactly one failure (KD-01).

---

## 5. Harness status — honest

### Production build — EXECUTED ✅

`npx next build` succeeded (exit 0). Safe to run because no dev server was active. It generated the full route manifest, including SSG prerendering of article, discipline, category, rodeo-event, edition, competitor and venue pages, confirming the registry and resolver changes compile and prerender.

### `test:routes` — ATTEMPTED, BLOCKED with a precise cause

Prerequisites were closer than expected: the test database **is** seeded (17 articles, 6 `fixture-` records). A production build was available. A server was started on port 3100 with `DATABASE_URL` pointed at the test database.

**Every route returned 500.** The cause, from the server log:

```
environment INVALID: NEXT_PUBLIC_SITE_URL must be https in production;
DATABASE_URL points at localhost in production (expected the managed cloud database);
APP_ENV=production but DATABASE_URL targets a local database
→ Failed to prepare server: error loading instrumentation hook
```

**This is the project's own environment isolation guard working correctly.** `next start` sets `NODE_ENV=production`, which activates `lib/env.ts` / `lib/env-guard.ts`; that guard refuses to boot a production build against a local database. It is a safety feature, not a defect, and it should not be worked around by relaxing the guard.

A dev-mode retry was attempted but collided with an already-running dev server on the same port; the attempt was abandoned rather than pursued further, and all stray servers were terminated (ports 3000 and 3100 confirmed free).

**Practical plan for Stage 05–10:**

1. Run the harness against **`next dev`**, not `next start` — dev mode does not trip the production guard. Start with `DATABASE_URL=$TEST_DATABASE_URL APP_ENV=development npx next dev -p 3100`, then `SMOKE_BASE_URL=http://localhost:3100 npm run test:routes`.
2. Ensure no other dev server is running first — Next refuses a second instance, and the symptom is a confusing 500 rather than a clear port error.
3. Add this as a CI job so Stage 10 is not its first execution.

### `test:cache` — BLOCKED

Needs a running server **and writes to the database** — it mints an ephemeral admin, creates a throwaway article and promotes it through the editorial workflow. Must point at an isolated seeded database. Blocked by the same guard issue as `test:routes`, plus the write authorization. **This is the harness Stage 08 needs** to verify the draft-save cache scope (KD-08), so it should be wired up before then.

### `test:e2e` — BLOCKED

`playwright.config.ts:39-40` requires `webServer: npx next start` — the same production guard applies — plus admin-login fixtures and a seeded database. The specs authenticate into `/admin/login/` and mutate admin session state. **Playwright is not installed as a browser runtime** either; `@playwright/test` would need its browsers downloaded.

### `test:migration` — BLOCKED

Creates a throwaway database for a from-zero replay. Not authorized for this stage; the Stage 03 migration authorization covered applying existing migrations to the existing test database only.

**No blocked harness is reported as passing.**

---

## 6. Test-quality gate compliance

The Stage 03 gate (`tests/stage03-test-quality-gate.test.ts`) passes. Specifically:

- `Stage 04's own suites introduce no new violations` ✅ — none of the 90 new tests claims a rendering outcome on source-text evidence.
- The 49-entry legacy baseline is unchanged. Stage 04 did not add to it.
- The baseline has no stale entries.

**A note on the baseline.** Stage 04 retargeted 10 legacy source-text tests but did not convert them to behavioural assertions, because they live in other batches' files and converting them would mean adding DB mocks to suites this stage had no reason to touch. They remain structural, now pointing at the correct implementation markers and annotated with the behavioural test that proves each guarantee. Opportunistic conversion as later stages touch those areas remains the recommendation.
