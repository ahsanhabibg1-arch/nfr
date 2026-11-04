# Batch 20 §2 — Unsaved-Change Protection Implementation

## Hook: `lib/hooks/useUnsavedChangesWarning.ts`
- `useUnsavedChangesWarning(enabled)` attaches a `beforeunload` guard while `enabled` is true → native "leave site?" prompt on refresh / tab close / navigation out of the app. Cleans up when disabled or on unmount.
- Logic factored into `beforeUnloadGuard(enabled, win?)` so it is unit-testable without a DOM (accepts an injectable window; no-ops when `window` is undefined, i.e. SSR/node).

## Article editor (`views/admin/AdminArticleEditorShell.tsx`)
- Reused the existing `isDirty` state: `useUnsavedChangesWarning(isDirty)`.
- `isDirty` is set by `markDirty()` on content/metadata/source/tag edits and **cleared** by `setIsDirty(false)` on a successful save. Workflow transitions are already blocked while dirty.
- **Preserves input on conflict/validation:** save failures (`!res.ok`, incl. `validation`/`conflict`) return early without clearing `isDirty`, so the guard stays armed and the editor keeps the user's input.
- Visible "Unsaved Changes" badge already present (accessible text) — complements the browser prompt.

## Competition editors (`views/admin/AdminCompetitionPage.tsx`)
- Parent tracks `{ schedule, results, standings }` dirty flags; `useUnsavedChangesWarning(any)`.
- Each sub-editor (Schedule / Results / Standings) captures a JSON **snapshot** of the form at `open()` and reports dirty via `useEffect` when an editor is open **and** the live form differs from the snapshot (`onDirty(editorOpen && JSON.stringify(f) !== snap)`). Closing (cancel/save success via the `after` callback sets edit/mode to null) reports clean.
- **Preserves input on conflict:** the existing `act()` handler keeps the edit box open on a `conflict` (only reloads the list), so dirty stays true and input is retained.

## Coverage & limitations (honest)
| Trigger | Covered? |
|---------|:--------:|
| Browser refresh | ✅ `beforeunload` |
| Tab / window close | ✅ `beforeunload` |
| Navigation to an external URL / typing a new address | ✅ `beforeunload` |
| In-app `<Link>` / `router.push` navigation | ⚠️ **Not guarded** — the Next.js App Router exposes no stable API to intercept client navigation. Documented limitation; the visible dirty badge + blocked workflow transitions mitigate it in-app. |

Per the batch instruction ("if complete navigation interception is not reliably supported, implement the safe subset and document the limitation"), only the reliable `beforeunload` subset is implemented.

## Accessibility
- The `beforeunload` prompt is browser-native (fully accessible).
- The article editor's "Unsaved Changes" badge is visible text (not color-only). No new interactive element was added that could trap focus.

## Tests (`tests/batch20-unsaved.test.ts`, 4 — all pass)
1. Registers the listener when enabled; cleanup removes it.
2. Does **not** register when disabled (no unnecessary interception).
3. Handler calls `preventDefault()` + sets `returnValue=''` (native prompt).
4. No-ops safely when `window` is absent (SSR/node).
