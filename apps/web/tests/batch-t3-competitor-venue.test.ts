import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { KNOWN_PAGE_KEYS, ADMIN_VISIBLE_PAGE_KEYS, PAGE_KEY_LABELS, getPageFamily } from '../lib/cms/sectionRegistry';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── Template Key Registration ────────────────────────────────────────

describe('Task 3 — Competitor & Venue key registration', () => {
  it('template:competitor is in KNOWN_PAGE_KEYS', () => {
    expect((KNOWN_PAGE_KEYS as readonly string[])).toContain('template:competitor');
  });

  it('template:venue is in KNOWN_PAGE_KEYS', () => {
    expect((KNOWN_PAGE_KEYS as readonly string[])).toContain('template:venue');
  });

  it('template:competitor is in ADMIN_VISIBLE_PAGE_KEYS', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[])).toContain('template:competitor');
  });

  it('template:venue is in ADMIN_VISIBLE_PAGE_KEYS', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[])).toContain('template:venue');
  });

  it('template:competitor has a label', () => {
    expect(PAGE_KEY_LABELS['template:competitor']).toBeTruthy();
  });

  it('template:venue has a label', () => {
    expect(PAGE_KEY_LABELS['template:venue']).toBeTruthy();
  });

  it('both keys map to detail-template family', () => {
    expect(getPageFamily('template:competitor')).toBe('detail-template');
    expect(getPageFamily('template:venue')).toBe('detail-template');
  });

  it('KNOWN_PAGE_KEYS now has 15 entries', () => {
    expect(KNOWN_PAGE_KEYS.length).toBe(15);
  });

  it('existing template keys are preserved', () => {
    const keys = KNOWN_PAGE_KEYS as readonly string[];
    expect(keys).toContain('template:article');
    expect(keys).toContain('template:rodeo-hub');
    expect(keys).toContain('template:rodeo-edition');
    expect(keys).toContain('template:discipline');
    expect(keys).toContain('template:category');
  });
});

// ── Resolver Tests ───────────────────────────────────────────────────

describe('Task 3 — Competitor & Venue resolvers', () => {
  const src = read('lib/cms/detailTemplateData.ts');

  it('exports resolveCompetitorTemplateSlots', () => {
    expect(src).toContain('export async function resolveCompetitorTemplateSlots');
  });

  it('exports resolveVenueTemplateSlots', () => {
    expect(src).toContain('export async function resolveVenueTemplateSlots');
  });

  it('competitor resolver uses template:competitor page key', () => {
    expect(src).toContain("fetchVisibleSlots('template:competitor'");
  });

  it('venue resolver uses template:venue page key', () => {
    expect(src).toContain("fetchVisibleSlots('template:venue'");
  });

  it('both resolvers support draft option', () => {
    const competitorSection = src.slice(src.indexOf('resolveCompetitorTemplateSlots'));
    expect(competitorSection).toContain('options?: { draft?: boolean }');
    const venueSection = src.slice(src.indexOf('resolveVenueTemplateSlots'));
    expect(venueSection).toContain('options?: { draft?: boolean }');
  });

  it('both resolvers use shared resolveAppendageSlots helper', () => {
    const afterCompetitor = src.slice(src.indexOf('resolveCompetitorTemplateSlots'));
    expect(afterCompetitor).toContain('resolveAppendageSlots(visible');
    const afterVenue = src.slice(src.indexOf('resolveVenueTemplateSlots'));
    expect(afterVenue).toContain('resolveAppendageSlots(visible');
  });

  it('existing resolvers are preserved', () => {
    expect(src).toContain('export async function resolveArticleTemplateSlots');
    expect(src).toContain('export async function resolveRodeoHubTemplateSlots');
    expect(src).toContain('export async function resolveRodeoEditionTemplateSlots');
    expect(src).toContain('export async function resolveDisciplineTemplateSlots');
    expect(src).toContain('export async function resolveCategoryTemplateSlots');
  });
});

// ── Competitor Route Integration ─────────────────────────────────────

describe('Task 3 — Competitor route integration', () => {
  const src = read('app/(public)/competitors/[slug]/page.tsx');

  it('imports isStaffDraftPreview', () => {
    expect(src).toContain('isStaffDraftPreview');
  });

  it('imports resolveCompetitorTemplateSlots', () => {
    expect(src).toContain('resolveCompetitorTemplateSlots');
  });

  it('imports ArticleAppendageSlots', () => {
    expect(src).toContain('ArticleAppendageSlots');
  });

  it('calls isStaffDraftPreview()', () => {
    expect(src).toContain('await isStaffDraftPreview()');
  });

  it('passes draft flag and entity ID to resolver', () => {
    expect(src).toContain('resolveCompetitorTemplateSlots(c.id, { draft })');
  });

  it('renders appendage after article element (after FAQ)', () => {
    const articleCloseIdx = src.indexOf('</article>');
    const appendageIdx = src.indexOf('<ArticleAppendageSlots');
    expect(appendageIdx).toBeGreaterThan(articleCloseIdx);
  });

  it('preserves existing EntityIntro and FaqAccordion', () => {
    expect(src).toContain('EntityIntro');
    expect(src).toContain('FaqAccordion');
    expect(src).toContain("seo?.intro");
  });

  it('preserves existing inline related coverage', () => {
    expect(src).toContain('c.articles.length > 0');
    expect(src).toContain('Related coverage');
  });

  it('preserves existing disciplines section', () => {
    expect(src).toContain('c.disciplines.length > 0');
    expect(src).toContain('Disciplines');
  });

  it('preserves existing participations section', () => {
    expect(src).toContain('c.participations.length > 0');
    expect(src).toContain('Event participation');
  });
});

// ── Venue Route Integration ──────────────────────────────────────────

describe('Task 3 — Venue route integration', () => {
  const src = read('app/(public)/venues/[slug]/page.tsx');

  it('imports isStaffDraftPreview', () => {
    expect(src).toContain('isStaffDraftPreview');
  });

  it('imports resolveVenueTemplateSlots', () => {
    expect(src).toContain('resolveVenueTemplateSlots');
  });

  it('imports ArticleAppendageSlots', () => {
    expect(src).toContain('ArticleAppendageSlots');
  });

  it('calls isStaffDraftPreview()', () => {
    expect(src).toContain('await isStaffDraftPreview()');
  });

  it('passes draft flag and entity ID to resolver', () => {
    expect(src).toContain('resolveVenueTemplateSlots(v.id, { draft })');
  });

  it('renders appendage after article element (after FAQ)', () => {
    const articleCloseIdx = src.indexOf('</article>');
    const appendageIdx = src.indexOf('<ArticleAppendageSlots');
    expect(appendageIdx).toBeGreaterThan(articleCloseIdx);
  });

  it('preserves existing EntityIntro and FaqAccordion', () => {
    expect(src).toContain('EntityIntro');
    expect(src).toContain('FaqAccordion');
    expect(src).toContain("seo?.intro");
  });

  it('preserves existing inline related coverage', () => {
    expect(src).toContain('v.articles.length > 0');
    expect(src).toContain('Related coverage');
  });

  it('preserves existing editions/events section', () => {
    expect(src).toContain('v.editions.length > 0');
    expect(src).toContain('Events held here');
  });
});

// ── Preview URL Mapping ──────────────────────────────────────────────

describe('Task 3 — Preview URL mapping', () => {
  const src = read('app/admin/(dashboard)/website/preview/route.ts');

  it('handles template:competitor preview', () => {
    expect(src).toContain("pageKey === 'template:competitor'");
    expect(src).toContain('prisma.competitor.findFirst');
  });

  it('handles template:venue preview', () => {
    expect(src).toContain("pageKey === 'template:venue'");
    expect(src).toContain('prisma.venue.findFirst');
  });

  it('preview URLs use correct route patterns', () => {
    expect(src).toContain("/competitors/${comp.slug}/");
    expect(src).toContain("/venues/${venue.slug}/");
  });

  it('preserves all existing preview mappings', () => {
    expect(src).toContain("pageKey === 'homepage'");
    expect(src).toContain("pageKey === 'template:article'");
    expect(src).toContain("pageKey === 'template:rodeo-hub'");
    expect(src).toContain("pageKey === 'template:rodeo-edition'");
    expect(src).toContain("pageKey === 'template:discipline'");
    expect(src).toContain("pageKey === 'template:category'");
    expect(src).toContain("pageKey === 'directory:competitors'");
    expect(src).toContain("pageKey === 'directory:venues'");
  });
});

// ── Regression Tests ─────────────────────────────────────────────────

describe('Task 3 — Regressions', () => {
  it('detail-hero, detail-body, detail-faq are NOT in blockRegistry', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).not.toContain("'detail-hero':");
    expect(src).not.toContain("'detail-body':");
    expect(src).not.toContain("'detail-faq':");
  });

  it('ArticleView still uses resolveArticleTemplateSlots', () => {
    const src = read('views/ArticleView.tsx');
    expect(src).toContain('resolveArticleTemplateSlots');
  });

  it('homepage route is unchanged', () => {
    const src = read('app/(public)/page.tsx');
    expect(src).toContain('resolveHomepageSlots');
    expect(src).not.toContain('resolveCompetitorTemplateSlots');
  });

  it('Task 1 shared utilities preserved', () => {
    const src = read('lib/cms/slotUtils.ts');
    expect(src).toContain('export async function pickedThenAuto');
  });

  it('Task 2 rodeo resolvers preserved', () => {
    const src = read('lib/cms/detailTemplateData.ts');
    expect(src).toContain('resolveRodeoHubTemplateSlots');
    expect(src).toContain('resolveRodeoEditionTemplateSlots');
  });

  it('competitor directory page is unchanged', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain('resolveDirectorySlots');
    expect(src).not.toContain('resolveCompetitorTemplateSlots');
  });

  it('venue directory page is unchanged', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain('resolveDirectorySlots');
    expect(src).not.toContain('resolveVenueTemplateSlots');
  });
});
