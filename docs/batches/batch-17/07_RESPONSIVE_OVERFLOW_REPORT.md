# Batch 17 §E — Responsive Horizontal-Overflow Report

**Date:** 2026-11-04 · Tool: Playwright (chromium headless), measuring `documentElement.scrollWidth` vs viewport with the global `overflow-x:hidden` clamp **temporarily neutralized** to expose the true offender.

## Investigation (before fix)
The audit suspected a mobile overflow masked by `app/globals.css` `body { overflow-x: hidden }`. The probe proved the opposite: the overflow was **desktop-only**, caused by a specific component.

| Viewport | True scrollWidth | Overflow | Top offender |
|---------:|-----------------:|---------:|--------------|
| 360 / 390 / 768 | = viewport | none | — |
| **1024** | 1257 | **+233px** | `div.flex.items-center.gap-3.shrink-0` (header actions) |
| **1440** | 1505 | **+65px** | same header cluster |

### Root cause — `components/SiteHeader.tsx`
The header's inner row (`max-w-[1280px] … flex justify-between gap-8`) held **three `shrink-0` zones** — brand, primary nav, actions. The primary nav (`hidden lg:flex gap-7`) revealed **five long uppercase links** (each `whitespace-nowrap shrink-0`, e.g. "NFR Events & Shopping") starting at the **lg (1024px)** breakpoint. At 1024 the links + brand + actions exceed the container's content width, and because every zone is `shrink-0`, nothing can compress — so the row overflows its `max-w-[1280px]` container and the page. The global `overflow-x:hidden` merely hid the scrollbar.

## Fix (constrain the real offender, keep the clamp as defense-in-depth)
`components/SiteHeader.tsx`:
1. Primary nav shown from **`xl` (1280px)** instead of `lg` (`hidden lg:flex` → `hidden xl:flex`), with the hamburger + drawer now covering `<xl` (`lg:hidden` → `xl:hidden` on the toggle and the drawer). The five long labels no longer try to fit the 1024–1279 range — they remain **fully available via the mobile drawer** (not hidden/removed).
2. Tighter spacing where the full nav does show: row `gap-8` → `gap-4 xl:gap-6`; nav `gap-7` → `gap-5`; nav given `min-w-0`.
3. Brand tagline ("Independent Publication") moved from `xl:inline` → `2xl:inline` so it adds width only at ≥1536px where there is ample room.

The global `overflow-x:hidden` is **retained** as a defensive backstop (per batch guidance — not removed blindly), but it is no longer load-bearing.

## Verification (after fix, dev server, clamp neutralized)
| Viewport | 360 | 390 | 768 | 1024 | 1280 | 1366 | 1440 |
|---------:|:---:|:---:|:---:|:----:|:----:|:----:|:----:|
| `/` | OK | OK | OK | OK | OK | OK | OK |
| `/competitors/` | OK | OK | OK | OK | OK | OK | OK |
| `/venues/` | OK | OK | OK | OK | OK | OK | OK |
| `/admin/login/` | OK | OK | OK | OK | OK | OK | OK |

`trueSW == viewport` at every breakpoint — the overflow is eliminated at its source, not merely clamped. No controls are hidden (nav collapses to the drawer <xl), tables keep their intentional `overflow-x-auto` scroll regions, and desktop layout is intact.

## Limitations
- Dynamic (`ƒ`) pages (`/competition/`, `/rodeo-events/`, `/search/`) timed out on Playwright's `networkidle` wait in the first probe and were re-checked with `load`; their layouts share the same header/footer chrome, so the header fix applies to them too. A full interaction/visual pass on those pages is recommended during staging QA.
- Measurements were taken against the local dev server on the isolated test DB.
