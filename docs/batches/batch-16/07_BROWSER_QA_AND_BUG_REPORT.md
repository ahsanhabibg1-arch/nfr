# Batch 16 — Browser QA & Bug Report

**Browser QA was actually performed** (patchright/Chromium headless via the browser-automation skill)
against a production build (`next start`) on local ports, DATABASE_URL = local dev, media storage forced
local. No production data touched.

## Public QA (desktop viewport)
| Route | Status | H1 / title | Errors |
|---|---|---|---|
| `/` | 200 | home renders | none |
| `/competitors/` | 200 | "Rodeo Competitors"; search + discipline filter; "0 competitor" empty state | none |
| `/venues/` | 200 | "Rodeo Venues"; search; "0 venue" empty state (country filter hidden when no data) | none |
| `/rodeo-events/` | 200 | "More Rodeo" | none |
| `/disciplines/bull-riding/` | 200 | "Bull Riding" | none |
| `/search/?q=rodeo` | 200 | "Search" (noindex) | none |
| `/admin/login/` | 200 | sign-in | none |

## Admin QA (authenticated via an injected test session)
- Dashboard `/admin/` renders with navigation.
- **`/admin/articles/new/` — the launch-critical check:** `headlineEmpty=true`, `excerptEmpty=true`,
  `hasDemoBlock=false`, `hasDemoStage=false`; author dropdown = 7 options (Select… + 6 **real DB authors**),
  default "Select author…". Confirms blank-new-article + database-backed authors in a real browser.

## Bugs found & fixed during QA
1. **Footer directory links invisible** — the footer uses DB-backed navigation, so the Batch-15 fallback
   edit never showed. Fixed: directory links are now appended unconditionally (de-duplicated). Re-verified
   in browser — footer shows "Competitors Directory" + "Venues Directory"; 0 console errors.

## Finding documented, not fixed (out of scope)
- **Global minor horizontal overflow** (`scrollWidth > innerWidth` by a few px on every page incl.
  pre-existing) — likely the far-right topbar control. No visible break; pre-existing; recommend a targeted
  responsive fix later.

## Coverage limits (honest)
- Viewports: desktop was driven. Tablet/mobile breakpoints were **not** separately screenshotted this
  session (the layouts use responsive Tailwind classes; the overflow note applies across widths). 
- Admin create→publish full click-through and competition edit/correct forms were validated via automated
  integration tests + the new-article render check, not a full manual multi-step browser click-through.
- The `?_rsc=` ERR_ABORTED entries are normal Next.js prefetch cancellations, not errors; one 404 resource
  (empty hero image in the data-less dev DB) is not a page break.
