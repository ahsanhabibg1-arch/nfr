# Batch 19 §C — Implementation Report

## Files added (3) + edited (1). No schema change, no new routes/URLs, no public-facing change.

### 1. `app/admin/(dashboard)/loading.tsx` (new)
Admin route-transition loading skeleton. Server component, no data fetch → instant. Rendered inside `(dashboard)/layout.tsx`, so the **sidebar + topbar persist** and only the content area shows the skeleton (page-header row, metric tiles, table rows). `role="status"` + `aria-busy` + `sr-only "Loading…"`. Matches admin surfaces (white cards, stone borders).

### 2. `app/admin/(dashboard)/error.tsx` (new, `'use client'`)
Admin segment error boundary. Branded, recoverable card with chrome intact: **Try again** (`reset()`) + **Back to dashboard** (`/admin/`). Reassures "Your data was not changed." No internal error text surfaced (only opaque `digest`); full error logged via `console.error` for operators. `role="alert"`.

### 3. `tests/batch19-admin-ui.test.ts` (new)
- Admin loading skeleton renders accessible busy status (`renderToStaticMarkup`).
- Admin error boundary exports a component function.
- Guard: `RevisionHistoryModal` source no longer contains "Demo Prototype" / "Demo Session Revisions" and now contains honest "Revision history" wording.

### 4. `components/admin/editor/RevisionHistoryModal.tsx` (edited — labels only)
The revision feature is fully DB-backed: the editor passes real `initialRevisions` (`ArticleRevision[]`) and `onRestore` → `restoreRevisionAction` → `svc.restoreRevision` (DB write + version bump + audit). Only the Phase-0 labels were misleading. Changed:
- Modal title: `"Article Revision History & Audit Log (Demo Prototype)"` → `"Article Revision History & Audit Log"`.
- The amber "Demo Session Revisions" prototype-boundary box → a neutral (stone) info box titled **"Revision history"** with accurate copy: *"Each saved edit and workflow transition is stored as a revision in the database. Restoring one overwrites the current draft with that snapshot and records a restore event in the audit trail."*
No logic/props/behavior changed — the data, empty state, restore flow, and confirmation dialog are untouched.

## Constraints honored
- ✅ Existing architecture/design conventions preserved; existing services/components reused.
- ✅ Server/Client split correct (loading = server, error = client).
- ✅ DB integrity, permissions, editorial workflows untouched.
- ✅ No public URL / SEO / schema change.
- ✅ Tests added for the changes.
- ✅ No invented modules.

## Explicitly deferred (not defects)
- Unsaved-change navigation guard on long admin forms → Batch 20 (enhancement).
- Admin surfaced metrics beyond editorial (analytics depth) → existing module adequate.
