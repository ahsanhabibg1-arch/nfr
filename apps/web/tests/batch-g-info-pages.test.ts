import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/* ── 1. Dynamic info route ─────────────────────────────────────────── */

describe('Phase G — info/[slug] route file', () => {
  const src = read('app/(public)/info/[slug]/page.tsx');

  it('exists and is non-empty', () => {
    expect(src.length).toBeGreaterThan(0);
  });

  it('imports getLegalPage and LEGAL_PAGES from config', () => {
    expect(src).toContain('getLegalPage');
    expect(src).toContain('LEGAL_PAGES');
  });

  it('imports LegalPageView and legalPageMetadata', () => {
    expect(src).toContain('LegalPageView');
    expect(src).toContain('legalPageMetadata');
  });

  it('imports listInfoPages for generateStaticParams', () => {
    expect(src).toContain('listInfoPages');
  });

  it('exports generateStaticParams that includes legacy and DB pages', () => {
    expect(src).toContain('generateStaticParams');
    expect(src).toContain('LEGAL_PAGES.map');
    expect(src).toContain('listInfoPages');
    // Live now means "has a snapshot and is not archived", which is what a
    // reader can reach — the draft's status no longer decides it.
    expect(src).toContain('publishedSnapshot');
    expect(src).toContain('archivedAt');
  });

  it('exports generateMetadata that delegates to legalPageMetadata', () => {
    expect(src).toContain('generateMetadata');
    expect(src).toContain('legalPageMetadata(slug)');
  });

  it('renders LegalPageView with the slug (no getLegalPage gate)', () => {
    expect(src).toContain('<LegalPageView slug={slug}');
    expect(src).not.toContain('if (!getLegalPage(slug)) notFound()');
  });

  it('awaits params (Next.js 16 async params)', () => {
    expect(src).toContain('await params');
    expect(src).toContain('Promise<{ slug: string }>');
  });

  it('does not import from another route', () => {
    expect(src).not.toMatch(/from '@\/app\//);
  });
});

/* ── 2. All 7 hardcoded routes preserved ───────────────────────────── */

describe('Phase G — Hardcoded info page routes preserved', () => {
  const slugs = ['about', 'terms', 'privacy', 'editorial-policy', 'affiliate-disclosure', 'corrections', 'contact'];

  for (const slug of slugs) {
    describe(`/${slug}/`, () => {
      const routePath = `app/(public)/${slug}/page.tsx`;
      const src = read(routePath);

      it('route file exists', () => {
        expect(src.length).toBeGreaterThan(0);
      });

      it('imports LegalPageView and legalPageMetadata', () => {
        expect(src).toContain('LegalPageView');
        expect(src).toContain('legalPageMetadata');
      });

      it(`passes slug="${slug}" to legalPageMetadata`, () => {
        expect(src).toContain(`legalPageMetadata('${slug}')`);
      });

      it(`passes slug="${slug}" to LegalPageView`, () => {
        expect(src).toContain(`slug="${slug}"`);
      });

      it('exports generateMetadata', () => {
        expect(src).toContain('generateMetadata');
      });

      it('exports a default function', () => {
        expect(src).toMatch(/export default function/);
      });
    });
  }
});

/* ── 3. LegalPageView extensible rendering ─────────────────────────── */

describe('Phase G — LegalPageView extensible rendering', () => {
  const src = read('views/LegalPageView.tsx');

  it('resolves CMS content through resolvePublicInfoPage', () => {
    // Renamed to `resolvePublicInfoPage`, which returns three outcomes instead
    // of two so a withdrawn page is distinguishable from an unmanaged one.
    expect(src).toContain('resolvePublicInfoPage');
  });

  it('calls getLegalPage for config-based content', () => {
    expect(src).toContain('getLegalPage(slug)');
  });

  it('returns notFound when neither config nor DB content exists', () => {
    expect(src).toContain('if (!page && !db) notFound()');
  });

  it('does NOT notFound when only config is missing (CMS-only pages work)', () => {
    expect(src).not.toContain('if (!page) notFound()');
  });

  it('renders CMS body through sanitizeLegalHtml', () => {
    expect(src).toContain('sanitizeLegalHtml(db.body)');
  });

  it('renders hardcoded sections when config exists but no DB', () => {
    expect(src).toContain('page.sections.map');
  });

  it('handles null page safely for sections rendering', () => {
    expect(src).toContain(') : page ?');
    expect(src).toContain(') : null}');
  });

  it('includes breadcrumb JSON-LD with dynamic path', () => {
    expect(src).toContain('breadcrumbJsonLd');
    expect(src).toContain('pagePath');
  });

  it('computes pagePath with /info/ fallback for CMS-only pages', () => {
    expect(src).toContain("page?.path || `/info/${slug}/`");
  });

  it('includes cross-links using slug (not page.slug)', () => {
    expect(src).toContain('p.slug !== slug');
  });

  it('shows draft notice only for legacy pages with config', () => {
    expect(src).toContain('page != null && page.review');
  });

  it('safely accesses ownerInputs only when page is not null', () => {
    expect(src).toContain('page != null && page.ownerInputs');
  });
});

/* ── 4. legalPageMetadata extensible SEO ───────────────────────────── */

describe('Phase G — legalPageMetadata extensible SEO', () => {
  const src = read('views/LegalPageView.tsx');

  it('does not early-return when config is missing', () => {
    expect(src).not.toContain('if (!page) return {}');
    expect(src).toContain('if (!config && !live) return {}');
  });

  it('uses optional chaining for config fields', () => {
    expect(src).toContain("page?.title");
    expect(src).toContain("page?.description");
    expect(src).toContain("page?.path");
  });

  it('falls back to /info/ path for CMS-only pages', () => {
    expect(src).toContain("page?.path || `/info/${slug}/`");
  });

  it('sets noindex correctly for CMS-only pages without DB', () => {
    expect(src).toContain('!live && (!config || config.review');
  });

  it('uses buildMetadata for generation', () => {
    expect(src).toContain('buildMetadata(');
  });
});

/* ── 5. Dynamic slug validation ────────────────────────────────────── */

describe('Phase G — Dynamic slug validation (infoPageService)', () => {
  const src = read('lib/cms/infoPageService.ts');

  it('is server-only', () => {
    expect(src).toMatch(/^import 'server-only'/);
  });

  it('exports LEGACY_SLUGS with all 7 original slugs', () => {
    expect(src).toContain('export const LEGACY_SLUGS');
    expect(src).toContain("'about'");
    expect(src).toContain("'privacy'");
    expect(src).toContain("'terms'");
    expect(src).toContain("'editorial-policy'");
    expect(src).toContain("'affiliate-disclosure'");
    expect(src).toContain("'corrections'");
    expect(src).toContain("'contact'");
  });

  it('no longer uses z.enum(VALID_SLUGS)', () => {
    expect(src).not.toContain('z.enum(VALID_SLUGS)');
    expect(src).not.toContain('z.enum(LEGACY_SLUGS)');
  });

  it('uses a regex-based slug schema', () => {
    expect(src).toContain('SLUG_RE');
    expect(src).toContain('/^[a-z0-9]+(?:-[a-z0-9]+)*$/');
  });

  it('defines RESERVED_SLUGS set', () => {
    expect(src).toContain('RESERVED_SLUGS');
    expect(src).toContain("'admin'");
    expect(src).toContain("'api'");
    expect(src).toContain("'_next'");
    expect(src).toContain("'articles'");
    expect(src).toContain("'info'");
  });

  it('rejects reserved slugs via zod refine', () => {
    expect(src).toContain('RESERVED_SLUGS.has(s)');
    expect(src).toContain('reserved and cannot be used');
  });

  it('enforces max length', () => {
    expect(src).toContain('.max(100');
  });

  it('enforces min length', () => {
    expect(src).toContain('.min(1');
    expect(src).toContain('Slug is required');
  });

  it('exports RESERVED_SLUGS and SLUG_RE for testing', () => {
    expect(src).toContain('export { RESERVED_SLUGS, SLUG_RE }');
  });
});

/* ── 6. Slug validation unit tests ─────────────────────────────────── */

describe('Phase G — Slug validation rules', () => {
  // Import the regex and reserved set directly
  const src = read('lib/cms/infoPageService.ts');
  const reMatch = src.match(/SLUG_RE = (\/[^/]+\/)/);
  const SLUG_RE = reMatch ? new RegExp(reMatch[1].slice(1, -1)) : /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const reservedMatch = src.match(/RESERVED_SLUGS = new Set\(\[([\s\S]*?)\]\)/);
  const reservedList = reservedMatch ? [...reservedMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  const RESERVED_SLUGS = new Set(reservedList);

  it('accepts valid slugs', () => {
    expect(SLUG_RE.test('faq')).toBe(true);
    expect(SLUG_RE.test('help-center')).toBe(true);
    expect(SLUG_RE.test('about-us-2024')).toBe(true);
    expect(SLUG_RE.test('a')).toBe(true);
    expect(SLUG_RE.test('page1')).toBe(true);
  });

  it('rejects invalid slug formats', () => {
    expect(SLUG_RE.test('')).toBe(false);
    expect(SLUG_RE.test('-leading')).toBe(false);
    expect(SLUG_RE.test('trailing-')).toBe(false);
    expect(SLUG_RE.test('double--hyphen')).toBe(false);
    expect(SLUG_RE.test('UPPERCASE')).toBe(false);
    expect(SLUG_RE.test('has space')).toBe(false);
    expect(SLUG_RE.test('has_underscore')).toBe(false);
    expect(SLUG_RE.test('has.dot')).toBe(false);
    expect(SLUG_RE.test('has/slash')).toBe(false);
  });

  it('legacy 7 slugs are NOT reserved (they remain valid)', () => {
    const legacySlugs = ['about', 'privacy', 'terms', 'editorial-policy', 'affiliate-disclosure', 'corrections', 'contact'];
    for (const s of legacySlugs) {
      expect(RESERVED_SLUGS.has(s), `${s} should not be reserved`).toBe(false);
      expect(SLUG_RE.test(s), `${s} should pass regex`).toBe(true);
    }
  });

  it('system routes are reserved', () => {
    const systemRoutes = ['admin', 'api', 'auth', '_next', 'internal', 'info'];
    for (const s of systemRoutes) {
      expect(RESERVED_SLUGS.has(s), `${s} should be reserved`).toBe(true);
    }
  });

  it('public routes are reserved', () => {
    const publicRoutes = ['articles', 'competitors', 'venues', 'rodeo-events', 'search', 'account'];
    for (const s of publicRoutes) {
      expect(RESERVED_SLUGS.has(s), `${s} should be reserved`).toBe(true);
    }
  });
});

/* ── 7. Service preserves existing workflow ─────────────────────────── */

describe('Phase G — Service workflow preserved', () => {
  const src = read('lib/cms/infoPageService.ts');

  it('the public read resolves through the published snapshot', () => {
    // The live read goes through the snapshot, not a status filter.
    expect(src).toContain('publishedSnapshot');
    expect(src).toContain('readSnapshot');
  });

  it('saveInfoPageDraft requires system.config permission', () => {
    expect(src).toContain("need(actor, 'system.config')");
  });

  it('saveInfoPageDraft sanitizes body before saving', () => {
    expect(src).toContain('sanitizeLegalHtml(raw.body)');
  });

  it('has full workflow: draft → review → approve → publish', () => {
    expect(src).toContain('submitForReview');
    expect(src).toContain('approveInfoPage');
    expect(src).toContain('publishInfoPage');
  });

  it('has unpublish and revertToDraft flows', () => {
    expect(src).toContain('unpublishInfoPage');
    expect(src).toContain('revertToDraft');
  });

  it('saveInfoPageDraft creates or updates, with a version guard on update', () => {
    // `upsert` was replaced by an explicit create/update split so the update
    // branch can carry the optimistic-lock guard on `version`.
    expect(src).toContain('prisma.infoPage.create');
    expect(src).toContain('version: existing.version');
  });

  it('refuses a STALE edit rather than a published one', () => {
    // Inverted by S-1: a published page is now editable, and what the save
    // refuses instead is a STALE one.
    expect(src).toContain('expectedVersion !== existing.version');
    expect(src).toContain('changed by someone else');
  });

  it('audit logs all operations', () => {
    expect(src).toContain("'info_page.save_draft'");
    expect(src).toContain("'info_page.submit_review'");
    expect(src).toContain("'info_page.approve'");
    expect(src).toContain("'info_page.publish'");
    expect(src).toContain("'info_page.unpublish'");
  });
});

/* ── 8. legalPages config preserved ────────────────────────────────── */

describe('Phase G — legalPages config', () => {
  const src = read('config/legalPages.ts');

  it('exports LEGAL_PAGES array with 7 pages', () => {
    expect(src).toContain('export const LEGAL_PAGES');
    const slugMatches = src.match(/slug: '/g);
    expect(slugMatches?.length).toBe(7);
  });

  it('exports getLegalPage lookup function', () => {
    expect(src).toContain('export function getLegalPage');
  });

  it('exports getIndexableLegalPages for sitemap filtering', () => {
    expect(src).toContain('export function getIndexableLegalPages');
  });
});

/* ── 9. LEGACY_SLUGS match config ──────────────────────────────────── */

describe('Phase G — LEGACY_SLUGS match legalPages config', () => {
  it('LEGACY_SLUGS in service match LEGAL_PAGES slugs in config', () => {
    const configSrc = read('config/legalPages.ts');
    const serviceSrc = read('lib/cms/infoPageService.ts');

    const configSlugs = [...configSrc.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]).sort();
    const legacyMatch = serviceSrc.match(/LEGACY_SLUGS = \[([^\]]+)\]/);
    expect(legacyMatch).toBeTruthy();
    const legacySlugs = [...legacyMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

    expect(configSlugs).toEqual(legacySlugs);
  });
});

/* ── 10. Cache revalidation for /info/ path ────────────────────────── */

describe('Phase G — Cache revalidation for /info/ route', () => {
  const src = read('app/admin/info-page-actions.ts');

  it('publishInfoPageAction revalidates /info/{slug}/', () => {
    const fn = src.slice(src.indexOf('publishInfoPageAction'), src.indexOf('revertToDraftAction'));
    expect(fn).toContain("revalidatePath(`/info/${slug}/`)");
  });

  it('unpublishInfoPageAction revalidates /info/{slug}/', () => {
    const fn = src.slice(src.indexOf('unpublishInfoPageAction'));
    expect(fn).toContain("revalidatePath(`/info/${slug}/`)");
  });

  it('saveInfoPageDraftAction revalidates /info/{slug}/', () => {
    const fn = src.slice(src.indexOf('saveInfoPageDraftAction'), src.indexOf('submitForReviewAction'));
    expect(fn).toContain("revalidatePath(`/info/${input.slug}/`)");
  });

  it('approveInfoPageAction revalidates /info/{slug}/', () => {
    const fn = src.slice(src.indexOf('approveInfoPageAction'), src.indexOf('publishInfoPageAction'));
    expect(fn).toContain("revalidatePath(`/info/${slug}/`)");
  });

  it('revertToDraftAction revalidates /info/{slug}/', () => {
    const fn = src.slice(src.indexOf('revertToDraftAction'), src.indexOf('unpublishInfoPageAction'));
    expect(fn).toContain("revalidatePath(`/info/${slug}/`)");
  });
});

/* ── 11. Admin UI extensibility ────────────────────────────────────── */

describe('Phase G — Admin UI extensibility', () => {
  const src = read('views/admin/AdminInfoPagesPage.tsx');

  it('has isLegacy field in InfoPageRow', () => {
    expect(src).toContain('isLegacy: boolean');
  });

  it('has Create New Page button', () => {
    expect(src).toContain('Create New Page');
  });

  it('has create form with slug input', () => {
    expect(src).toContain('form.slug');
    expect(src).toContain("placeholder=\"e.g. faq\"");
  });

  it('normalizes slug input to lowercase with valid chars only', () => {
    expect(src).toContain(".toLowerCase().replace(/[^a-z0-9-]/g, '')");
  });

  it('shows Legacy badge for hardcoded pages', () => {
    expect(src).toContain('Legacy');
    expect(src).toContain('row.isLegacy');
  });

  it('shows CMS badge for dynamic pages', () => {
    expect(src).toContain('>CMS<');
  });

  it('has separate create and edit forms', () => {
    expect(src).toContain('{creating &&');
    expect(src).toContain('{editing &&');
  });

  it('disables create button when form is incomplete', () => {
    expect(src).toContain('!form.slug || !form.title || !form.body');
  });
});

/* ── 12. Admin page loads all DB pages ─────────────────────────────── */

describe('Phase G — Admin page loads all pages', () => {
  const src = read('app/admin/(dashboard)/info-pages/page.tsx');

  it('loads all DB pages via listInfoPages', () => {
    expect(src).toContain('listInfoPages()');
  });

  it('builds legacy rows from LEGAL_PAGES', () => {
    expect(src).toContain('LEGAL_PAGES.map');
    expect(src).toContain('isLegacy: true');
  });

  it('builds CMS rows for non-legacy DB pages', () => {
    expect(src).toContain('isLegacy: false');
    expect(src).toContain('!legacySlugs.has(p.slug)');
  });

  it('merges both row sets', () => {
    expect(src).toContain('[...legacyRows, ...cmsRows]');
  });
});

/* ── 13. Route isolation ───────────────────────────────────────────── */

describe('Phase G — Route isolation', () => {
  it('info route is under /info/ path', () => {
    expect(fs.existsSync(path.join(root, 'app/(public)/info/[slug]/page.tsx'))).toBe(true);
  });

  it('does not shadow the [section] catch-all route', () => {
    expect(fs.existsSync(path.join(root, 'app/(public)/[section]/page.tsx'))).toBe(true);
  });
});

/* ── 14. Regression: hardcoded routes match config ─────────────────── */

describe('Phase G — Regression: hardcoded routes match legalPages config', () => {
  const configSrc = read('config/legalPages.ts');

  it('every config slug has a corresponding hardcoded route', () => {
    const slugs = [...configSrc.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);
    for (const slug of slugs) {
      expect(fs.existsSync(path.join(root, `app/(public)/${slug}/page.tsx`)), `Missing route for /${slug}/`).toBe(true);
    }
  });
});

/* ── 15. Security contracts ────────────────────────────────────────── */

describe('Phase G — Security contracts', () => {
  it('infoPageService is server-only (no client import)', () => {
    const src = read('lib/cms/infoPageService.ts');
    expect(src).toMatch(/^import 'server-only'/);
  });

  it('all mutating actions require authentication', () => {
    const src = read('app/admin/info-page-actions.ts');
    expect(src).toContain("'use server'");
    const actionCount = (src.match(/await actor\(\)/g) || []).length;
    expect(actionCount).toBeGreaterThanOrEqual(6);
  });

  it('slug validation is server-side via zod', () => {
    const src = read('lib/cms/infoPageService.ts');
    expect(src).toContain('SaveSchema.parse(input)');
  });

  it('body is sanitized before storage', () => {
    const src = read('lib/cms/infoPageService.ts');
    expect(src).toContain('sanitizeLegalHtml(raw.body)');
  });

  it('published content is sanitized on render', () => {
    const src = read('views/LegalPageView.tsx');
    expect(src).toContain('sanitizeLegalHtml(db.body)');
  });

  it('Prisma enforces unique slug constraint', () => {
    const schema = read('prisma/schema.prisma');
    const infoSection = schema.slice(schema.indexOf('model InfoPage'), schema.indexOf('enum InfoPageStatus'));
    expect(infoSection).toContain('slug            String         @unique');
  });
});
