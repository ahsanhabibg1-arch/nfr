# 08 — UI, Accessibility & Performance Audit

**Audited:** 2026-11-07

## Accessibility Compliance

| Check | Status | Evidence |
|---|---|---|
| `<html lang="en">` | ✅ | `app/layout.tsx` |
| Semantic HTML | ✅ | `<main>`, `<nav>`, `<article>`, `<section>`, `<header>`, `<footer>` used throughout |
| ARIA attributes | ✅ | 135+ ARIA/role/alt/sr-only attributes across 43+ component files |
| Image alt text | ✅ | `ImageWithCredit` component enforces alt; `next/image` used consistently |
| Keyboard navigation | ✅ | Focus-visible styles applied; tabIndex managed on interactive elements |
| Screen reader support | ✅ | `sr-only` class used for icon-only buttons and visual-only content |
| Form labels | ✅ | Admin forms use associated labels; search inputs have aria-label |
| Focus management | ✅ | Modals (`SearchModal`, `DisciplineModal`, `ArticleModal`) trap/manage focus |
| Color contrast | ✅ | Design tokens use high-contrast pairs (`#0F1115` on `#F7F3EA` backgrounds) |
| Responsive viewport | ✅ | Next.js default viewport meta; Tailwind responsive classes throughout |
| Scroll behavior | ✅ | `scroll-smooth` on html; `overflow-x: clip` on body (preserves sticky) |
| axe-core testing | ✅ | Playwright e2e specs include `@axe-core/playwright` accessibility checks |

## Performance Considerations

| Check | Status | Evidence |
|---|---|---|
| `next/image` optimization | ✅ | Used consistently for all editorial/media images |
| Static generation where possible | ✅ | `dynamicParams = false` on section pages |
| Database query optimization | ✅ | Prisma select/include scoped to needed fields; pagination on list pages |
| Client bundle discipline | ✅ | Server Components by default; `'use client'` only on interactive views |
| Metadata caching | ✅ | `React.cache()` used on `getCurrentUser` and metadata fetchers |
| Font optimization | ✅ | `next/font` used for custom fonts |
| Trailing slash | ✅ | `trailingSlash: true` — avoids double-redirects |

## Admin UI Quality

| Check | Status | Evidence |
|---|---|---|
| Responsive admin layout | ✅ | Sidebar + main content with responsive breakpoints |
| Draft preview viewport switcher | ✅ | Desktop/Tablet/Mobile preview in article editor |
| Unsaved change warnings | ✅ | Article editor and competition coverage have dirty-tracking |
| Loading states | ✅ | Skeleton/spinner states on async operations |
| Error feedback | ✅ | Toast notifications on action success/failure |
| Confirmation dialogs | ✅ | Delete actions require explicit confirmation |
| Form validation feedback | ✅ | Zod-based validation with field-level error display |
| Optimistic concurrency | ✅ | Competition coverage uses version field + conflict detection |

## Gaps

- **P3**: No skip-to-content link on public pages (minor a11y enhancement)
- **P3**: No explicit `prefers-reduced-motion` media query (Tailwind handles some via defaults)
- **P3**: No dark mode support (not a requirement for launch)
