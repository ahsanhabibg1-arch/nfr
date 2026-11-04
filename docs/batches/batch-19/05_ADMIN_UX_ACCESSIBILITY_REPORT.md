# Batch 19 §B.F — Admin UX & Accessibility Report

## Loading UX (new)
- Instant skeleton on navigation between CMS modules; **sidebar + topbar stay mounted** (loading.tsx inside `(dashboard)/layout.tsx`), so module switches feel continuous.
- Skeleton mirrors admin layout (header row + metric tiles + table rows) to minimize perceived shift.
- A11y: `role="status"`, `aria-busy`, `sr-only "Loading…"`, decorative bars `aria-hidden`.

## Error UX (new)
- Admin segment errors render a branded, recoverable card with chrome intact — **Try again** (`reset()`) and **Back to dashboard**.
- Explicit reassurance that data was not changed; only an opaque `digest` shown; full error logged for operators.
- `role="alert"` + `aria-live="assertive"`.

## Revision modal copy (fixed)
- No longer labeled "Demo Prototype"; the info box now honestly describes DB-backed revision history and the audit-trail restore event. Removes misleading operational information from a production admin surface.

## Existing admin UX/a11y (re-verified, unchanged)
- Save feedback via toasts; forms use labelled inputs (axe e2e: *"every /admin/… filter/field has an accessible name"*, *"every editor input and select is reachable by its visible label"* — pass).
- Keyboard: invite dialog is named, takes focus, returns it on Escape; mobile drawer opens/closes without a mouse (Playwright pass).
- Responsive: admin tables wrap in `overflow-x-auto`; topbar/sidebar collapse on small screens (mobile sidebar toggle).
- Focus rings enforced globally (`globals.css :focus-visible`, `!important`).

## Accessibility regression
Full Playwright + axe **45/45**, `a11y-known-issues.json = []` (zero accepted violations) — unchanged by Batch 19.

## Deferred (enhancement, not a defect)
- Unsaved-change navigation guard (beforeunload / route-change prompt) on long editor forms — recommended for Batch 20.
