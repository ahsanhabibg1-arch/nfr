# Batch 18 §UX/Accessibility Report

## Loading state UX
- Appears **instantly** on navigation to any server-rendered/dynamic public route (no data fetch in `loading.tsx`).
- Site **header, footer and ⌘K search stay mounted** (loading.tsx is a child of `(public)/layout.tsx`), so navigation feels continuous rather than a full-page blank.
- Skeleton mirrors the common editorial shape (breadcrumb → headline → hero → card grid) to minimize perceived layout shift when real content swaps in.
- A11y: `role="status"`, `aria-busy="true"`, and an `sr-only` "Loading…" announcement; decorative bars are `aria-hidden`.

## Error state UX
- Public segment errors render a **branded, recoverable** card with the chrome intact — not an unstyled Next.js crash page.
- Two clear actions: **Try again** (`reset()` re-renders the failed segment) and **Go to homepage**.
- `role="alert"` + `aria-live="assertive"` so assistive tech announces it.
- Reader privacy: no stack/internal message shown — only an opaque `digest` reference for support; the full error goes to logs (`console.error`), consistent with the project's redacting-logger posture.
- `global-error.tsx` is a self-contained, inline-styled fallback (works even if CSS failed to load) for the rare root-layout failure.

## Responsive & overflow
- The loading skeleton uses the same `max-w-[1280px] … px-4 sm:px-6 lg:px-8` container as content.
- Overflow probe (Playwright, clamp neutralized) across **360 / 390 / 768 / 1024 / 1280 / 1440** on home, section, competitors, venues, rodeo-events, article detail, search → **no horizontal overflow anywhere**.

## Accessibility regression
- Full Playwright + axe suite (`e2e/a11y.spec.ts`, admin + public) **45/45 pass**, `a11y-known-issues.json = []` (zero accepted violations) — unchanged by Batch 18.
- Keyboard mobile-drawer open/close and header-search accessible-name tests still pass (they exercise the Batch 17 header changes the loading skeleton sits beneath).

## Themability
Loading/error use the established tokens (charcoal `#0F1115`, gold `#D4A757`, sand `#F7F3EA`, stone neutrals) and fonts, matching `not-found.tsx` and the editorial system.
