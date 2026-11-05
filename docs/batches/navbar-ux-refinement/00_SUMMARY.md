# Navbar & Animated Search UX Refinement

**Scope:** public site header only (`components/SiteHeader.tsx`). No homepage hero, editorial content, CMS, schema, routes, or unrelated components changed. 2026-11-05 · `main @ c0319c9` (uncommitted; preserves Batch 17–23 work).

## Before → After
| | Before | After |
|-|--------|-------|
| Tagline | "INDEPENDENT PUBLICATION" beside the wordmark | **removed** (brand still in the footer) |
| Quick Access | gold "QUICK ACCESS" button on the right | **removed** |
| Layout | brand / nav / (search button + Quick Access + hamburger) with crowding | **single row**: wordmark (left) · 5 sections **centered** · animated search (right) |
| Search | a button opening a full `⌘K` modal (+ visible "Search" label + kbd hint) | **animated expandable inline search** — compact gold icon that slides open a focused input; submits to the existing `/search/` route |
| More Rodeo | 5th link (part of the earlier overflow issue) | integrated, centered, **no overlap** |
| ⌘K modal | visible button + shortcut | shortcut **still works** (PublicChrome); no redundant visible desktop button |

## Files changed
- `components/SiteHeader.tsx` — rewrote the desktop header zones + added the animated search (state, focus management, Escape/outside-click close, submit). Mobile drawer unchanged (still lists the 5 sections + a search entry).
- `e2e/navbar.spec.ts` (new) — removed-controls, 5 sections, search submit, mobile drawer, no overflow.
- `e2e/a11y.spec.ts` — updated the header-search a11y test for the new trigger/input (accessible names + Escape focus return).

## Animated search — behavior
- **Default:** compact gold magnifier icon; no field occupying navbar space (collapsed `w-0 opacity-0`, `tabIndex=-1`, `aria-hidden`).
- **Open (click):** input slides in (CSS `transition-[width,opacity] 260ms ease-out`, `transform/opacity/width`), receives focus, placeholder `Search NFR events, rodeo, competitors...`. Expanded width `w-44` (xl) / `w-64` (2xl) — sized so it never overlaps the nav or overflows.
- **Submit (Enter):** `router.push('/search/?q=' + encodeURIComponent(q))` — the existing search page + query-param contract; no duplicate backend.
- **Close:** Escape (returns focus to the trigger), outside click, or toggling the icon; layout returns to normal.
- **Reduced motion:** `motion-reduce:transition-none`.
- **No big animation library** — pure CSS transition.
- **Hydration-safe:** `searchOpen` starts `false` on server and client; no `window` access during render (verified: 0 console errors).

## Navigation preservation checklist
- [x] All 5 primary sections present + linked (desktop nav + mobile drawer).
- [x] **More Rodeo** route/section preserved (`ROUTES.MORE_RODEO` → `/rodeo-events/`).
- [x] Search page + filtering untouched (`/search/?q=`).
- [x] Internal nav links, SEO, CMS nav config (`navItems` prop / DB nav) intact.
- [x] Admin panel, auth, RBAC untouched (public header only).
- [x] Mobile drawer: 5 sections + search + quick spectator hubs.

## Responsive QA (Playwright, clamp neutralized)
| Width | 320 | 375 | 390 | 768 | 1024 | 1280 | 1440 | 1920 |
|-------|:---:|:---:|:---:|:---:|:----:|:----:|:----:|:----:|
| Horizontal overflow (closed) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Search open — overflow | — | — | — | — | — | **0** | **0** | **0** |
| Nav visible / collapsed | drawer | drawer | drawer | drawer | drawer | inline | inline | inline |
- `<xl` (≤1279): the 5 long labels don't fit a single row → **graceful collapse to the mobile drawer** (not squeezed). ≥1280: full centered inline nav.
- **0 console/hydration errors** across all widths.

## Search interaction tests (verified)
- Opens on click; input **focused** (Playwright `toBeFocused`), `aria-expanded` toggles false→true.
- **Escape** collapses + returns focus to the trigger.
- **Enter** submits to `/search/?q=bull%20riding`.
- Mobile drawer exposes all 5 sections.
- No overlap / no horizontal overflow at target widths.
- axe accessibility: clean (49 Playwright/axe tests pass).

## Screenshots (actually inspected)
See `screenshots/`:
- `navbar-1440.png` — clean single-row desktop navbar (wordmark · 5 centered sections · compact gold search icon; no tagline/Quick Access).
- `navbar-search-open.png` — search expanded (input slid in left of the icon, gold focus border + clear button, no overlap with "MORE RODEO").
- `navbar-390.png` — mobile header (wordmark + hamburger, clean).

## Known limitations
- The `⌘K` global search modal (PublicChrome) remains for power users; the visible desktop control is the new inline search (no redundant button).
- On `<xl`, the full 5-section inline row intentionally collapses to the drawer (long uppercase labels won't fit without squeezing) — the task's "collapse gracefully" path.
- Screenshots are from the local dev server; live-domain visuals should be re-checked after deploy.
