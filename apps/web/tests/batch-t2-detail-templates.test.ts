import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { KNOWN_PAGE_KEYS, ADMIN_VISIBLE_PAGE_KEYS, PAGE_KEY_LABELS } from '../lib/cms/sectionRegistry';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// ── Template Registry Tests ──────────────────────────────────────────

describe('Task 2 — Template key activation', () => {
  it('template:rodeo-hub is no longer dead', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('template:rodeo-hub')).toBe(true);
  });

  it('template:rodeo-edition is no longer dead', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('template:rodeo-edition')).toBe(true);
  });

  it('template:discipline is no longer dead', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('template:discipline')).toBe(true);
  });

  it('template:category is no longer dead', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('template:category')).toBe(true);
  });

  it('all four keys are in KNOWN_PAGE_KEYS', () => {
    const keys = KNOWN_PAGE_KEYS as readonly string[];
    expect(keys).toContain('template:rodeo-hub');
    expect(keys).toContain('template:rodeo-edition');
    expect(keys).toContain('template:discipline');
    expect(keys).toContain('template:category');
  });

  it('all four keys have labels', () => {
    expect(PAGE_KEY_LABELS['template:rodeo-hub']).toBeTruthy();
    expect(PAGE_KEY_LABELS['template:rodeo-edition']).toBeTruthy();
    expect(PAGE_KEY_LABELS['template:discipline']).toBeTruthy();
    expect(PAGE_KEY_LABELS['template:category']).toBeTruthy();
  });

  it('ADMIN_VISIBLE_PAGE_KEYS includes all known keys', () => {
    expect(ADMIN_VISIBLE_PAGE_KEYS.length).toBe(KNOWN_PAGE_KEYS.length);
  });

  it('DEAD_PAGE_KEYS set is empty', () => {
    const src = read('lib/cms/sectionRegistry.ts');
    expect(src).toContain("const DEAD_PAGE_KEYS = new Set<string>([])");
  });

  it('existing template:article key is still active', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('template:article')).toBe(true);
  });

  it('existing homepage key is still active', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('homepage')).toBe(true);
  });

  it('existing directory keys are still active', () => {
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('directory:competitors')).toBe(true);
    expect((ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes('directory:venues')).toBe(true);
  });
});

// ── Resolver Tests ───────────────────────────────────────────────────

describe('Task 2 — Detail template resolvers', () => {
  const src = read('lib/cms/detailTemplateData.ts');

  it('exports resolveRodeoHubTemplateSlots', () => {
    expect(src).toContain('export async function resolveRodeoHubTemplateSlots');
  });

  it('exports resolveRodeoEditionTemplateSlots', () => {
    expect(src).toContain('export async function resolveRodeoEditionTemplateSlots');
  });

  it('exports resolveDisciplineTemplateSlots', () => {
    expect(src).toContain('export async function resolveDisciplineTemplateSlots');
  });

  it('exports resolveCategoryTemplateSlots', () => {
    expect(src).toContain('export async function resolveCategoryTemplateSlots');
  });

  it('rodeo hub resolver uses template:rodeo-hub page key', () => {
    expect(src).toContain("fetchVisibleSlots('template:rodeo-hub'");
  });

  it('rodeo edition resolver uses template:rodeo-edition page key', () => {
    expect(src).toContain("fetchVisibleSlots('template:rodeo-edition'");
  });

  it('discipline resolver uses template:discipline page key', () => {
    expect(src).toContain("fetchVisibleSlots('template:discipline'");
  });

  it('category resolver uses template:category page key', () => {
    expect(src).toContain("fetchVisibleSlots('template:category'");
  });

  it('all resolvers support draft option', () => {
    expect(src).toContain("options?.draft ? getDraftSections : getPublishedSections");
  });

  it('resolvers use shared resolveAppendageSlots helper', () => {
    expect(src).toContain('resolveAppendageSlots(visible');
  });

  it('resolveAppendageSlots handles detail-related blocks', () => {
    expect(src).toContain("t === 'detail-related'");
    expect(src).toContain('articleCount');
  });

  it('resolveAppendageSlots handles detail-cta blocks', () => {
    expect(src).toContain("t === 'detail-cta'");
    expect(src).toContain('ctaText');
    expect(src).toContain('ctaUrl');
  });

  it('rodeo hub resolver fetches rodeo-events section articles', () => {
    expect(src).toContain("getPublishedArticlesBySection('rodeo-events'");
  });

  it('discipline resolver fetches competition section articles', () => {
    expect(src).toContain("getPublishedArticlesBySection('competition'");
  });

  it('category resolver fetches articles by category slug', () => {
    expect(src).toContain('getPublishedArticlesByCategory(categorySlug)');
  });

  it('existing resolveArticleTemplateSlots is preserved', () => {
    expect(src).toContain('export async function resolveArticleTemplateSlots');
    expect(src).toContain("'template:article'");
  });

  it('detail-hero, detail-body, detail-faq are NOT processed by resolvers', () => {
    expect(src).not.toContain("t === 'detail-hero'");
    expect(src).not.toContain("t === 'detail-body'");
    expect(src).not.toContain("t === 'detail-faq'");
  });
});

// ── Route Integration Tests ──────────────────────────────────────────

describe('Task 2 — Rodeo hub/event route integration', () => {
  const src = read('app/(public)/rodeo-events/[slug]/page.tsx');

  it('imports isStaffDraftPreview', () => {
    expect(src).toContain('isStaffDraftPreview');
  });

  it('imports resolveRodeoHubTemplateSlots', () => {
    expect(src).toContain('resolveRodeoHubTemplateSlots');
  });

  it('imports ArticleAppendageSlots', () => {
    expect(src).toContain('ArticleAppendageSlots');
  });

  it('calls isStaffDraftPreview()', () => {
    expect(src).toContain('await isStaffDraftPreview()');
  });

  it('passes draft flag to resolver for events', () => {
    expect(src).toContain('resolveRodeoHubTemplateSlots(e.id, { draft })');
  });

  it('passes draft flag to resolver for hubs', () => {
    expect(src).toContain('resolveRodeoHubTemplateSlots(h.id, { draft })');
  });

  it('renders ArticleAppendageSlots after RodeoEventView', () => {
    const eventViewIdx = src.indexOf('RodeoEventView');
    const appendageIdx = src.indexOf('ArticleAppendageSlots', eventViewIdx);
    expect(appendageIdx).toBeGreaterThan(eventViewIdx);
  });

  it('renders ArticleAppendageSlots after RodeoHubView', () => {
    const hubViewIdx = src.lastIndexOf('RodeoHubView');
    const appendageIdx = src.indexOf('ArticleAppendageSlots', hubViewIdx);
    expect(appendageIdx).toBeGreaterThan(hubViewIdx);
  });

  it('preserves existing RodeoHubView and RodeoEventView', () => {
    expect(src).toContain('RodeoHubView');
    expect(src).toContain('RodeoEventView');
  });

  it('preserves existing FAQ and EntityIntro rendering (inside views)', () => {
    expect(src).toContain("extras={{ intro: seo?.intro, faqs }}");
  });

  it('preserves ViewBeacon', () => {
    expect(src).toContain('ViewBeacon');
  });

  it('both hub and event use the same template key (template:rodeo-hub)', () => {
    const matches = src.match(/resolveRodeoHubTemplateSlots/g);
    expect(matches?.length).toBe(3); // 1 import + 2 calls
  });
});

describe('Task 2 — Rodeo edition route integration', () => {
  const src = read('app/(public)/rodeo-events/[slug]/[edition]/page.tsx');

  it('imports isStaffDraftPreview', () => {
    expect(src).toContain('isStaffDraftPreview');
  });

  it('imports resolveRodeoEditionTemplateSlots', () => {
    expect(src).toContain('resolveRodeoEditionTemplateSlots');
  });

  it('calls isStaffDraftPreview()', () => {
    expect(src).toContain('await isStaffDraftPreview()');
  });

  it('passes draft flag to resolver', () => {
    expect(src).toContain('resolveRodeoEditionTemplateSlots(ed.id, { draft })');
  });

  it('renders appendage after RodeoEditionView', () => {
    const viewIdx = src.indexOf('RodeoEditionView');
    const appendageIdx = src.indexOf('ArticleAppendageSlots', viewIdx);
    expect(appendageIdx).toBeGreaterThan(viewIdx);
  });

  it('preserves CoverageNav rendering', () => {
    expect(src).toContain('CoverageNav');
    expect(src).toContain('coverage.hasAny');
  });

  it('preserves existing FAQ and EntityIntro rendering (inside view)', () => {
    expect(src).toContain("extras={{ intro: seo?.intro, faqs }}");
  });
});

describe('Task 2 — Discipline route integration', () => {
  const src = read('app/(public)/disciplines/[slug]/page.tsx');

  it('imports isStaffDraftPreview', () => {
    expect(src).toContain('isStaffDraftPreview');
  });

  it('imports resolveDisciplineTemplateSlots', () => {
    expect(src).toContain('resolveDisciplineTemplateSlots');
  });

  it('calls isStaffDraftPreview()', () => {
    expect(src).toContain('await isStaffDraftPreview()');
  });

  it('passes draft flag to resolver', () => {
    expect(src).toContain('resolveDisciplineTemplateSlots(d.id, { draft })');
  });

  it('renders appendage AFTER existing EntityIntro and FAQ', () => {
    const faqIdx = src.indexOf('FaqAccordion');
    const appendageIdx = src.indexOf('ArticleAppendageSlots');
    expect(appendageIdx).toBeGreaterThan(faqIdx);
  });

  it('preserves DisciplineGuideView', () => {
    expect(src).toContain('DisciplineGuideView');
  });

  it('preserves existing EntityIntro and FaqAccordion outside view', () => {
    expect(src).toContain('EntityIntro');
    expect(src).toContain('FaqAccordion');
    expect(src).toContain("seo?.intro");
  });
});

describe('Task 2 — Category route integration', () => {
  const src = read('app/(public)/categories/[slug]/page.tsx');

  it('imports isStaffDraftPreview', () => {
    expect(src).toContain('isStaffDraftPreview');
  });

  it('imports resolveCategoryTemplateSlots', () => {
    expect(src).toContain('resolveCategoryTemplateSlots');
  });

  it('calls isStaffDraftPreview()', () => {
    expect(src).toContain('await isStaffDraftPreview()');
  });

  it('passes draft flag and slug to resolver', () => {
    expect(src).toContain('resolveCategoryTemplateSlots(slug, { draft })');
  });

  it('renders appendage AFTER existing EntityIntro and FAQ', () => {
    const faqIdx = src.indexOf('FaqAccordion');
    const appendageIdx = src.indexOf('ArticleAppendageSlots');
    expect(appendageIdx).toBeGreaterThan(faqIdx);
  });

  it('preserves CategoryArchiveView', () => {
    expect(src).toContain('CategoryArchiveView');
  });

  it('preserves existing EntityIntro and FaqAccordion outside view', () => {
    expect(src).toContain('EntityIntro');
    expect(src).toContain('FaqAccordion');
    expect(src).toContain("seo?.intro");
  });
});

// ── Preview URL Mapping Tests ────────────────────────────────────────

describe('Task 2 — Preview URL mapping', () => {
  const src = read('app/admin/(dashboard)/website/preview/route.ts');

  it('handles template:rodeo-hub preview', () => {
    expect(src).toContain("pageKey === 'template:rodeo-hub'");
    expect(src).toContain('prisma.rodeoHub.findFirst');
  });

  it('handles template:rodeo-edition preview', () => {
    expect(src).toContain("pageKey === 'template:rodeo-edition'");
    expect(src).toContain('prisma.rodeoEventEdition.findFirst');
  });

  it('handles template:discipline preview', () => {
    expect(src).toContain("pageKey === 'template:discipline'");
    expect(src).toContain('prisma.discipline.findFirst');
  });

  it('handles template:category preview', () => {
    expect(src).toContain("pageKey === 'template:category'");
    expect(src).toContain('prisma.category.findFirst');
  });

  it('rodeo-hub preview falls back to event if no hub', () => {
    expect(src).toContain('prisma.rodeoEvent.findFirst');
  });

  it('preview URLs use correct route patterns', () => {
    expect(src).toContain("/rodeo-events/${hub.slug}/");
    expect(src).toContain("/rodeo-events/${ed.event.slug}/${ed.editionSlug}/");
    expect(src).toContain("/disciplines/${d.slug}/");
    expect(src).toContain("/categories/${cat.slug}/");
  });

  it('preserves existing homepage preview', () => {
    expect(src).toContain("pageKey === 'homepage'");
  });

  it('preserves existing article template preview', () => {
    expect(src).toContain("pageKey === 'template:article'");
  });

  it('preserves existing directory previews', () => {
    expect(src).toContain("pageKey === 'directory:competitors'");
    expect(src).toContain("pageKey === 'directory:venues'");
  });
});

// ── Regression Tests ─────────────────────────────────────────────────

describe('Task 2 — Regressions', () => {
  it('detail-hero, detail-body, detail-faq are NOT in blockRegistry', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).not.toContain("'detail-hero':");
    expect(src).not.toContain("'detail-body':");
    expect(src).not.toContain("'detail-faq':");
  });

  it('detail-related and detail-cta ARE in blockRegistry', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).toContain("'detail-related'");
    expect(src).toContain("'detail-cta'");
  });

  it('ArticleView still uses resolveArticleTemplateSlots', () => {
    const src = read('views/ArticleView.tsx');
    expect(src).toContain('resolveArticleTemplateSlots');
    expect(src).toContain('ArticleAppendageSlots');
  });

  it('homepage route is unchanged', () => {
    const src = read('app/(public)/page.tsx');
    expect(src).toContain('resolveHomepageSlots');
    expect(src).not.toContain('resolveRodeoHubTemplateSlots');
  });

  it('section landing routes are unchanged', () => {
    const src = read('app/(public)/[section]/page.tsx');
    expect(src).toContain('SectionLandingView');
    expect(src).not.toContain('resolveRodeoHubTemplateSlots');
  });

  it('RodeoHubView still renders EntityIntro and FaqAccordion internally', () => {
    const src = read('views/RodeoViews.tsx');
    const hubStart = src.indexOf('export function RodeoHubView');
    const hubEnd = src.indexOf('export function RodeoEventView');
    const hubSection = src.slice(hubStart, hubEnd);
    expect(hubSection).toContain('EntityIntro');
    expect(hubSection).toContain('FaqAccordion');
  });

  it('RodeoEventView still renders EntityIntro and FaqAccordion internally', () => {
    const src = read('views/RodeoViews.tsx');
    const evStart = src.indexOf('export function RodeoEventView');
    const evEnd = src.indexOf('export function RodeoEditionView');
    const evSection = src.slice(evStart, evEnd);
    expect(evSection).toContain('EntityIntro');
    expect(evSection).toContain('FaqAccordion');
  });

  it('RodeoEditionView still renders EntityIntro and FaqAccordion internally', () => {
    const src = read('views/RodeoViews.tsx');
    const edStart = src.indexOf('export function RodeoEditionView');
    const edSection = src.slice(edStart);
    expect(edSection).toContain('EntityIntro');
    expect(edSection).toContain('FaqAccordion');
  });

  it('existing section landing featured picker (Task 1) is preserved', () => {
    const src = read('lib/cms/sectionLandingData.ts');
    expect(src).toContain('pickedThenAuto');
    expect(src).toContain('idListProp');
  });

  it('existing shared slotUtils (Task 1) is preserved', () => {
    const src = read('lib/cms/slotUtils.ts');
    expect(src).toContain('export async function pickedThenAuto');
    expect(src).toContain('export function idListProp');
    expect(src).toContain('export function numProp');
  });
});
