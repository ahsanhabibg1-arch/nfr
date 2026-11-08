import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDefaultSlots, getSectionsForFamily, getPageFamily,
  HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS,
  KNOWN_PAGE_KEYS, PAGE_KEY_LABELS,
} from '../lib/cms/sectionRegistry';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf-8');

describe('Batch 31 — Page Layout System', () => {
  // ---- Section Registry ----
  it('section registry returns homepage sections with correct core types', () => {
    const defs = getSectionsForFamily('homepage');
    expect(defs.length).toBeGreaterThanOrEqual(9);
    const coreTypes = defs.slice(0, 9).map((d) => d.type);
    expect(coreTypes).toEqual([
      'editorial-hero', 'latest-coverage', 'quick-access', 'competition',
      'plan-and-watch', 'entertainment', 'events-shopping', 'more-rodeo', 'learning',
    ]);
  });

  it('section registry returns section-landing sections', () => {
    const defs = getSectionsForFamily('section-landing');
    expect(defs.length).toBeGreaterThanOrEqual(4);
    expect(defs[0].type).toBe('landing-hero');
  });

  it('detail-template and directory families are registered', () => {
    expect(getSectionsForFamily('detail-template').length).toBeGreaterThan(0);
    expect(getSectionsForFamily('directory').length).toBeGreaterThan(0);
    expect(DETAIL_TEMPLATE_SECTIONS[0].type).toBe('detail-hero');
    expect(DIRECTORY_SECTIONS[0].type).toBe('directory-hero');
  });

  it('getPageFamily resolves all page key prefixes correctly', () => {
    expect(getPageFamily('homepage')).toBe('homepage');
    expect(getPageFamily('section:competition')).toBe('section-landing');
    expect(getPageFamily('section:rodeo-events')).toBe('section-landing');
    expect(getPageFamily('template:article')).toBe('detail-template');
    expect(getPageFamily('directory:venues')).toBe('directory');
    expect(getPageFamily('unknown-page')).toBe('unknown');
  });

  it('buildDefaultSlots produces correct default slots for homepage', () => {
    const slots = buildDefaultSlots('homepage');
    expect(slots.length).toBeGreaterThanOrEqual(9);
    expect(slots[0].sectionType).toBe('editorial-hero');
    expect(slots[0].visible).toBe(true);
    expect(slots[0].order).toBe(0);
    expect(slots[0].id).toBeTruthy();
    expect(slots[8].sectionType).toBe('learning');
    expect(slots[8].order).toBe(8);
  });

  it('every section has a label, defaultProps, and editableProps array', () => {
    for (const defs of [HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS]) {
      for (const def of defs) {
        expect(def.label).toBeTruthy();
        expect(typeof def.defaultProps).toBe('object');
        expect(Array.isArray(def.editableProps)).toBe(true);
      }
    }
  });

  it('required sections are marked in homepage and landing families', () => {
    const homepageRequired = HOMEPAGE_SECTIONS.filter((s) => s.required);
    expect(homepageRequired.length).toBeGreaterThan(0);
    expect(homepageRequired[0].type).toBe('editorial-hero');

    const landingRequired = SECTION_LANDING_SECTIONS.filter((s) => s.required);
    expect(landingRequired.length).toBeGreaterThan(0);
    expect(landingRequired[0].type).toBe('landing-hero');
  });

  // ---- Known page keys ----
  it('KNOWN_PAGE_KEYS covers all five section landings', () => {
    const sectionKeys = KNOWN_PAGE_KEYS.filter((k) => k.startsWith('section:'));
    expect(sectionKeys).toContain('section:competition');
    expect(sectionKeys).toContain('section:entertainment');
    expect(sectionKeys).toContain('section:events-shopping');
    expect(sectionKeys).toContain('section:plan-watch');
    expect(sectionKeys).toContain('section:rodeo-events');
  });

  it('every known page key has a label', () => {
    for (const key of KNOWN_PAGE_KEYS) {
      expect(PAGE_KEY_LABELS[key], `Missing label for ${key}`).toBeTruthy();
    }
  });

  // ---- Prisma schema & migration ----
  it('PageLayout Prisma model exists in schema', () => {
    const schema = read('prisma/schema.prisma');
    expect(schema).toContain('model PageLayout');
    expect(schema).toContain('pageKey');
    expect(schema).toContain('draftSections');
    expect(schema).toContain('publishedSections');
  });

  it('migration SQL creates PageLayout table', () => {
    const sql = read('prisma/migrations/20261107140000_batch31_page_layout/migration.sql');
    expect(sql).toContain('CREATE TABLE "PageLayout"');
    expect(sql).toContain('"pageKey"');
    expect(sql).toContain('PageLayout_pageKey_key');
  });

  // ---- Service ----
  it('pageLayoutService exports all required functions including restoreDefaults', () => {
    const src = read('lib/cms/pageLayoutService.ts');
    expect(src).toContain('export async function getPageLayout');
    expect(src).toContain('export async function getPublishedSections');
    expect(src).toContain('export async function saveDraft');
    expect(src).toContain('export async function publishLayout');
    expect(src).toContain('export async function resetDraftToPublished');
    expect(src).toContain('export async function restoreDefaults');
  });

  it('service validates page keys against KNOWN_PAGE_KEYS', () => {
    const src = read('lib/cms/pageLayoutService.ts');
    expect(src).toContain('KNOWN_PAGE_KEYS');
    expect(src).toContain('validatePageKey');
  });

  it('service validates URL props and rejects script injection', () => {
    const src = read('lib/cms/pageLayoutService.ts');
    expect(src).toContain('<script');
    expect(src).toContain('javascript:');
    expect(src).toContain('relative path or https URL');
  });

  // ---- Homepage integration ----
  it('HomeView renders each slot with its own props via PageRenderer (no fixed section map)', () => {
    const home = read('views/HomeView.tsx');
    expect(home).toContain('PageRenderer');
    expect(home).not.toContain('sectionMap');
    const registry = read('components/blocks/registry.tsx');
    expect(registry).toContain('copyFromProps(slot.props)');
    expect(registry).toContain("slotStr(slot, 'heroImageUrl')");
  });

  it('homepage route resolves per-slot data and honours draft preview', () => {
    const page = read('app/(public)/page.tsx');
    expect(page).toContain('resolveHomepageSlots');
    expect(page).toContain('draftMode');
    expect(page).toContain("getDraftSections('homepage')");
    const data = read('lib/cms/homepageData.ts');
    expect(data).toContain("numProp(slot.props, 'articleCount'");
    expect(data).toContain("idListProp(props, 'featuredIds')");
  });

  // ---- Section landing integration ----
  it('SectionLandingView uses registry-driven slot rendering via PageRenderer', () => {
    const view = read('views/SectionLandingView.tsx');
    expect(view).toContain('resolveSectionLandingSlots');
    const resolver = read('lib/cms/sectionLandingData.ts');
    expect(resolver).toContain('getPublishedSections');
    expect(resolver).toContain('section:${sectionKey}');
    const slotsView = read('views/SectionLandingSlots.tsx');
    expect(slotsView).toContain('PageRenderer');
  });

  // ---- Admin actions ----
  it('admin page-layout-actions includes restoreDefaultsAction', () => {
    const src = read('app/admin/page-layout-actions.ts');
    expect(src).toContain('saveDraftAction');
    expect(src).toContain('publishLayoutAction');
    expect(src).toContain('resetDraftAction');
    expect(src).toContain('restoreDefaultsAction');
  });

  // ---- Admin page ----
  it('website admin page provides enriched registries and knownPageKeys', () => {
    const src = read('app/admin/(dashboard)/website/page.tsx');
    expect(src).toContain('ADMIN_VISIBLE_PAGE_KEYS');
    expect(src).toContain('PAGE_KEY_LABELS');
    expect(src).toContain('DETAIL_TEMPLATE_SECTIONS');
    expect(src).toContain('DIRECTORY_SECTIONS');
    expect(src).toContain('editableProps');
    expect(src).toContain('knownPageKeys');
  });

  // ---- Admin editor UX ----
  it('admin editor has unsaved indicator and confirm dialogs', () => {
    const src = read('views/admin/AdminPageLayoutEditor.tsx');
    expect(src).toContain('Unsaved changes');
    expect(src).toContain('window.confirm');
    expect(src).toContain('beforeunload');
    expect(src).toContain('Restore defaults');
    expect(src).toContain('renderPropField');
    expect(src).toContain('selectedBlockId');
  });

  it('admin editor supports section settings panel with prop types', () => {
    const src = read('views/admin/AdminPageLayoutEditor.tsx');
    expect(src).toContain('textarea');
    expect(src).toContain("=== 'url'");
    expect(src).toContain("type=\"number\"");
    expect(src).toContain('REQ');
  });

  // ---- Empty editor fix: defaults loaded from registry ----
  it('editor builds default slots from registry when no layout exists', () => {
    const src = read('views/admin/AdminPageLayoutEditor.tsx');
    expect(src).toContain('buildDefaultSlotsFromRegistry');
    expect(src).toContain('effectiveSlots');
    expect(src).toContain('Showing defaults');
  });

  // ---- Media Library integration ----
  it('editor integrates MediaPickerModal for image props', () => {
    const src = read('views/admin/AdminPageLayoutEditor.tsx');
    expect(src).toContain('MediaPickerModal');
    expect(src).toContain('mediaPicker');
    expect(src).toContain("prop.type === 'image'");
    expect(src).toContain('Select Image');
  });

  it('section registry includes image prop type for hero sections', () => {
    const heroEditableTypes = HOMEPAGE_SECTIONS[0].editableProps.map((p) => p.type);
    expect(heroEditableTypes).toContain('image');
    const landingHeroTypes = SECTION_LANDING_SECTIONS[0].editableProps.map((p) => p.type);
    expect(landingHeroTypes).toContain('image');
  });

  // ---- Featured content selection ----
  it('editor supports featured content picker', () => {
    const src = read('views/admin/AdminPageLayoutEditor.tsx');
    expect(src).toContain('listFeaturedCandidatesAction');
    expect(src).toContain("prop.type === 'featured'");
    expect(src).toContain('searchFeatured');
  });

  it('latest-coverage section has featuredIds prop', () => {
    const latestCoverage = HOMEPAGE_SECTIONS.find((s) => s.type === 'latest-coverage');
    expect(latestCoverage?.editableProps.some((p) => p.type === 'featured')).toBe(true);
  });

  it('actions include listFeaturedCandidatesAction and getDraftPreviewSections', () => {
    const src = read('app/admin/page-layout-actions.ts');
    expect(src).toContain('listFeaturedCandidatesAction');
    expect(src).toContain('getDraftPreviewSections');
  });

  // ---- Dynamic template integration ----
  it('ArticleView uses resolver and PageRenderer for template:article appendage slots', () => {
    const view = read('views/ArticleView.tsx');
    expect(view).toContain('resolveArticleTemplateSlots');
    expect(view).toContain('ArticleAppendageSlots');
    expect(view).not.toContain('getSlot(');
    const resolver = read('lib/cms/detailTemplateData.ts');
    expect(resolver).toContain('getPublishedSections');
    expect(resolver).toContain("'template:article'");
    const bridge = read('views/ArticleAppendageSlots.tsx');
    expect(bridge).toContain('PageRenderer');
  });

  it('competitors directory reads layout from directory:competitors', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain('getPublishedSections');
    expect(src).toContain("'directory:competitors'");
    expect(src).toContain('heroTitle');
  });

  it('venues directory reads layout from directory:venues', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain('getPublishedSections');
    expect(src).toContain("'directory:venues'");
    expect(src).toContain('heroTitle');
  });

  // ---- Secure draft preview ----
  it('preview route exists and validates authorization', () => {
    const src = read('app/admin/(dashboard)/website/preview/route.ts');
    expect(src).toContain('requireUser');
    expect(src).toContain('system.config');
    expect(src).toContain('KNOWN_PAGE_KEYS');
    expect(src).toContain('noindex');
    expect(src).toContain('no-store');
    expect(src).toContain('DRAFT PREVIEW');
  });

  it('pageLayoutService exports getDraftSections for preview', () => {
    const src = read('lib/cms/pageLayoutService.ts');
    expect(src).toContain('export async function getDraftSections');
  });

  // ---- Service validates image props ----
  it('service validates image URL props', () => {
    const src = read('lib/cms/pageLayoutService.ts');
    // Only *Url props are URL-validated, so alt text / position props are not rejected.
    expect(src).toContain('const isUrlProp = /url$/i.test(key);');
  });
});
