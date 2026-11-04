# Batch 18 §2 — Implementation Report & Files Changed

## Scope
Implement **only** the confirmed gap: route-level **loading** and **error** states for the public site (area 12). No other area was missing. No schema change, no redesign, no new routes/URLs, no change to existing pages/components.

## Files added (4 — all additive, no existing file modified)
| File | Purpose |
|------|---------|
| `apps/web/app/(public)/loading.tsx` | Public route-transition **loading skeleton**. Server component, no data fetch → renders instantly. Rendered inside `(public)/layout.tsx`, so the header/footer/search **persist** and only `<main>` shows the skeleton. `role="status"` + `aria-busy` + `sr-only "Loading…"`; neutral layout (breadcrumb/headline/hero/card grid) that fits any template without layout shift. |
| `apps/web/app/(public)/error.tsx` | Public segment **error boundary** (`'use client'`). Branded, recoverable card with a `reset()` **Try again** button + homepage link. Never exposes internal error text to readers (only the opaque `digest`); logs the full error for operators. `role="alert"`. Chrome persists (it's inside the layout). |
| `apps/web/app/global-error.tsx` | Root-level **last-resort** boundary (`'use client'`) for errors in the root layout itself; renders its own `<html>/<body>` with inline styles (stylesheet may be unavailable). Retry button. |
| `apps/web/tests/batch18-ui.test.ts` | Locks the loading skeleton's a11y contract (`role=status`, `aria-busy`, "Loading", skeleton bars) via `renderToStaticMarkup`; asserts the error boundaries compile + export a component. |

## Why this composition
- `(public)/layout.tsx` already wraps every public page in `PublicChrome`. Placing `loading.tsx`/`error.tsx` **inside that route group** means the site chrome stays mounted during a loading transition or a page error — the reader never sees a chrome-less flash or an unstyled crash.
- `global-error.tsx` covers the only case the segment boundary cannot: a failure in the root layout.

## Constraints honored
- ✅ Existing architecture preserved; Server/Client component split correct (loading = server, error/global-error = client per Next.js requirements).
- ✅ Database-backed content untouched; no hardcoded production placeholders; the skeleton is purely presentational.
- ✅ Editorial entity relationships, RBAC, publication visibility — untouched.
- ✅ No duplicate pages / competing URLs; no route added.
- ✅ Existing SEO metadata & structured data — untouched (loading/error states are not indexable transitions).
- ✅ Mobile/tablet/desktop — skeleton uses the same responsive container as content; verified no overflow 360→1440.
- ✅ Test added for the behavioral change.
- ✅ **No schema change.**

## Not done (correctly out of scope)
- Admin `loading.tsx`/`error.tsx` — the prompt is public-facing; `global-error.tsx` still covers catastrophic admin root failures. Admin loading/error recommended for Batch 19.
- No new editorial content (blocked / must be source-verified).
