# 06 — Search & Navbar UX

## Goals (workstream A + H)

- Gold magnifier + a **visible "Search" label**, no keyboard-shortcut (`⌘K`) badge.
- An animated, expandable search input in the desktop header.
- A clean account menu (logged-out and logged-in) in both desktop and mobile navs.
- No horizontal overflow at any supported width.

## Desktop header — `components/SiteHeader.tsx`

- Removed the "Independent Publication" tagline and the "Quick Access" button.
- Centered primary nav (`hidden xl:flex flex-1 justify-center`).
- Search trigger: visible `Search` text (its accessible name — no `aria-label`
  needed), `aria-expanded` reflects state, gold magnifier icon.
- Expanded input: `role="search"` form, `aria-label="Search NFRGuide"`,
  `aria-hidden`/`tabIndex` toggled with state, `motion-reduce:transition-none`,
  260 ms animation, width `w-44 2xl:w-64`.

### The reload bug that was fixed

The trigger previously used a dynamic `type={searchOpen ? 'submit' : 'button'}`.
The opening click set `searchOpen=true`; React re-rendered the button to
`type="submit"` **mid-click**; the browser then submitted the form → full page
reload → state reset. The input appeared to "not open" under keyboard/Playwright
even though a raw DOM click worked.

**Fix:** the trigger is **always** `type="button"` with an explicit handler —
`if (searchOpen) doSearch(); else setSearchOpen(true)`. `doSearch()` pushes
`/search/?q=<encoded>` when the query is non-empty. The outside-click listener is
also attached via `setTimeout(…, 0)` so the opening click doesn't immediately close it.

## Mobile drawer

- The in-drawer search launcher had a stray `⌘K` badge (meaningless on touch and
  against the "no kbd badge" rule); it was removed, leaving a clean
  "Search editorial archive…" launcher.
- The account menu renders in the drawer: **Sign in / Create account** when
  logged out; **Profile / Comments / Logout** (+ **Admin Dashboard** for staff)
  when logged in.

## Account menu — `components/account/AccountMenu.tsx`

Client component, `variant: 'desktop' | 'mobile'`, hydrates from `/api/account/me`.
Logged-out → Sign in / Create account. Reader → My Profile / My Comments / Logout.
Staff (`isStaff`) → the above **plus** Admin Dashboard. Logout is a
`<form action={logoutAction}>` (real POST, not a link).

## Verified in a real browser (dev-DB `next start`, headless Chromium)

- Trigger named "Search", `aria-expanded="false"` initially.
- Click → input visible **and focused**, `aria-expanded="true"`.
- `Escape` → collapses and **returns focus to the trigger**.
- Type "bull riding" + `Enter` → navigates to `/search/?q=bull%20riding` (no reload).
- Mobile drawer opens with the account menu; search launcher shows no `⌘K`.
- No horizontal overflow at 320 / 360 / 390 / 414 / 768 / 1024 / 1280 / 1440 / 1920.
- axe (WCAG 2a/2aa/21a/21aa/22aa): **0 serious/critical** on the article page.

Screenshots (desktop article, mobile drawer) were captured and inspected.
