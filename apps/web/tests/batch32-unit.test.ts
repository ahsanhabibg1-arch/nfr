import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDefaultSlots, getSectionsForFamily, getPageFamily,
  HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS,
  KNOWN_PAGE_KEYS, PAGE_KEY_LABELS,
  generateBlockId, ensureSlotIds, getAvailableBlockTypes, getBlockCategories,
  canAddBlock, countBlockInstances,
  type SectionSlot, type SectionDef, type BlockCategory,
} from '../lib/cms/sectionRegistry';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf-8');

describe('Batch 32 — Premium Visual Page Builder', () => {

  // ── Block instance IDs ─────────────────────────────────────────
  describe('Block instance IDs', () => {
    it('generateBlockId returns unique strings', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateBlockId()));
      expect(ids.size).toBe(100);
    });

    it('buildDefaultSlots assigns unique IDs to every slot', () => {
      const slots = buildDefaultSlots('homepage');
      const ids = new Set(slots.map((s) => s.id));
      expect(ids.size).toBe(slots.length);
      for (const s of slots) expect(s.id).toBeTruthy();
    });

    it('ensureSlotIds adds IDs to legacy slots without them', () => {
      const legacy: SectionSlot[] = [
        { id: '', sectionType: 'editorial-hero', visible: true, order: 0, props: {} },
        { id: '', sectionType: 'latest-coverage', visible: true, order: 1, props: {} },
      ];
      const result = ensureSlotIds(legacy);
      expect(result[0].id).toBeTruthy();
      expect(result[1].id).toBeTruthy();
      expect(result[0].id).not.toBe(result[1].id);
    });

    it('ensureSlotIds preserves existing IDs', () => {
      const slots: SectionSlot[] = [
        { id: 'keep-me', sectionType: 'editorial-hero', visible: true, order: 0, props: {} },
      ];
      const result = ensureSlotIds(slots);
      expect(result[0].id).toBe('keep-me');
    });
  });

  // ── Block categories ───────────────────────────────────────────
  describe('Block categories and metadata', () => {
    it('every section definition has a category', () => {
      for (const defs of [HOMEPAGE_SECTIONS, SECTION_LANDING_SECTIONS, DETAIL_TEMPLATE_SECTIONS, DIRECTORY_SECTIONS]) {
        for (const def of defs) {
          expect(def.category, `${def.type} missing category`).toBeTruthy();
        }
      }
    });

    it('getBlockCategories returns categories for homepage', () => {
      const cats = getBlockCategories('homepage');
      expect(cats).toContain('hero');
      expect(cats).toContain('editorial');
      expect(cats).toContain('content');
      expect(cats).toContain('cta');
    });

    it('getAvailableBlockTypes deduplicates blocks within a family', () => {
      const blocks = getAvailableBlockTypes('homepage');
      const types = blocks.map((b) => b.type);
      expect(new Set(types).size).toBe(types.length);
    });
  });

  // ── Premium block types ────────────────────────────────────────
  describe('Premium block types', () => {
    it('homepage has premium blocks: rich-text, image-text, stats, cta-banner, faq, newsletter', () => {
      const types = HOMEPAGE_SECTIONS.map((s) => s.type);
      expect(types).toContain('rich-text-block');
      expect(types).toContain('image-text-block');
      expect(types).toContain('stats-banner');
      expect(types).toContain('cta-banner');
      expect(types).toContain('faq-block');
      expect(types).toContain('newsletter-signup');
    });

    it('section-landing has shared premium blocks: rich-text, cta-banner', () => {
      const types = SECTION_LANDING_SECTIONS.map((s) => s.type);
      expect(types).toContain('rich-text-block');
      expect(types).toContain('cta-banner');
    });

    it('premium blocks are marked as duplicatable', () => {
      const premium = HOMEPAGE_SECTIONS.filter((s) => s.duplicatable);
      expect(premium.length).toBeGreaterThanOrEqual(5);
      const dupTypes = premium.map((s) => s.type);
      expect(dupTypes).toContain('rich-text-block');
      expect(dupTypes).toContain('image-text-block');
      expect(dupTypes).toContain('cta-banner');
    });

    it('premium blocks have maxInstances limits', () => {
      const richText = HOMEPAGE_SECTIONS.find((s) => s.type === 'rich-text-block');
      expect(richText?.maxInstances).toBeGreaterThan(0);
      const ctaBanner = HOMEPAGE_SECTIONS.find((s) => s.type === 'cta-banner');
      expect(ctaBanner?.maxInstances).toBeGreaterThan(0);
    });

    it('premium blocks have descriptions', () => {
      const premium = HOMEPAGE_SECTIONS.filter((s) => s.duplicatable);
      for (const p of premium) {
        expect(p.description, `${p.type} missing description`).toBeTruthy();
      }
    });
  });

  // ── Block instance management ──────────────────────────────────
  describe('Block instance management', () => {
    it('countBlockInstances counts correctly', () => {
      const slots: SectionSlot[] = [
        { id: '1', sectionType: 'cta-banner', visible: true, order: 0, props: {} },
        { id: '2', sectionType: 'rich-text-block', visible: true, order: 1, props: {} },
        { id: '3', sectionType: 'cta-banner', visible: true, order: 2, props: {} },
      ];
      expect(countBlockInstances(slots, 'cta-banner')).toBe(2);
      expect(countBlockInstances(slots, 'rich-text-block')).toBe(1);
      expect(countBlockInstances(slots, 'faq-block')).toBe(0);
    });

    it('canAddBlock respects maxInstances', () => {
      const def: SectionDef = {
        type: 'cta-banner', label: 'CTA', category: 'cta',
        maxInstances: 2, duplicatable: true,
        defaultProps: {}, editableProps: [],
      };
      const slotsUnder: SectionSlot[] = [
        { id: '1', sectionType: 'cta-banner', visible: true, order: 0, props: {} },
      ];
      const slotsAtLimit: SectionSlot[] = [
        { id: '1', sectionType: 'cta-banner', visible: true, order: 0, props: {} },
        { id: '2', sectionType: 'cta-banner', visible: true, order: 1, props: {} },
      ];
      expect(canAddBlock(slotsUnder, def)).toBe(true);
      expect(canAddBlock(slotsAtLimit, def)).toBe(false);
    });

    it('canAddBlock allows unlimited when maxInstances is undefined', () => {
      const def: SectionDef = {
        type: 'plan-and-watch', label: 'P&W', category: 'editorial',
        defaultProps: {}, editableProps: [],
      };
      const slots: SectionSlot[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i), sectionType: 'plan-and-watch', visible: true, order: i, props: {},
      }));
      expect(canAddBlock(slots, def)).toBe(true);
    });
  });

  // ── PropDef tabs ───────────────────────────────────────────────
  describe('Property tabs', () => {
    it('premium blocks have tab assignments on editableProps', () => {
      const imageText = HOMEPAGE_SECTIONS.find((s) => s.type === 'image-text-block')!;
      expect(imageText.editableProps.some((p) => p.tab === 'content')).toBe(true);
      expect(imageText.editableProps.some((p) => p.tab === 'seo')).toBe(true);
      expect(imageText.editableProps.some((p) => p.tab === 'layout')).toBe(true);
    });

    it('select-type props have options', () => {
      const selectProps = HOMEPAGE_SECTIONS
        .flatMap((s) => s.editableProps)
        .filter((p) => p.type === 'select');
      expect(selectProps.length).toBeGreaterThan(0);
      for (const p of selectProps) {
        expect(p.options).toBeDefined();
        expect(p.options!.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Service: block limits validation ───────────────────────────
  describe('Service security for block instances', () => {
    it('service validates block instance limits', () => {
      const src = read('lib/cms/pageLayoutService.ts');
      expect(src).toContain('validateBlockLimits');
      expect(src).toContain('maxInstances');
    });

    it('service validates unique block IDs', () => {
      const src = read('lib/cms/pageLayoutService.ts');
      expect(src).toContain('validateUniqueIds');
      expect(src).toContain('Duplicate block ID');
    });

    it('service Zod schema includes id field', () => {
      const src = read('lib/cms/pageLayoutService.ts');
      expect(src).toContain('id: z.string().min(1)');
    });
  });

  // ── Three-panel builder UI ─────────────────────────────────────
  describe('Visual builder UI', () => {
    it('editor has three-panel layout: Canvas and Properties', () => {
      const src = read('views/admin/AdminPageLayoutEditor.tsx');
      expect(src).toContain('Page Canvas');
      expect(src).toContain('Properties');
    });

    it('editor has Add Section panel with category filters', () => {
      const src = read('views/admin/AdminPageLayoutEditor.tsx');
      expect(src).toContain('Add Section');
      expect(src).toContain('Add a Block');
      expect(src).toContain('addCategoryFilter');
      expect(src).toContain('CATEGORY_LABELS');
    });

    it('editor supports block instance actions: duplicate and remove', () => {
      const src = read('views/admin/AdminPageLayoutEditor.tsx');
      expect(src).toContain('duplicateBlock');
      expect(src).toContain('removeBlock');
      expect(src).toContain('Duplicate');
      expect(src).toContain('Remove');
    });

    it('editor has drag-and-drop support', () => {
      const src = read('views/admin/AdminPageLayoutEditor.tsx');
      expect(src).toContain('handleDragStart');
      expect(src).toContain('handleDragOver');
      expect(src).toContain('handleDrop');
      expect(src).toContain('handleDragEnd');
      expect(src).toContain('draggable');
    });

    it('editor has tabbed property panel', () => {
      const src = read('views/admin/AdminPageLayoutEditor.tsx');
      expect(src).toContain('PROP_TABS');
      expect(src).toContain('propTab');
      expect(src).toContain('tabsWithContent');
      expect(src).toContain('propsForTab');
    });

    it('editor supports new prop types: select, boolean, color', () => {
      const src = read('views/admin/AdminPageLayoutEditor.tsx');
      expect(src).toContain("prop.type === 'select'");
      expect(src).toContain("prop.type === 'boolean'");
      expect(src).toContain("prop.type === 'color'");
    });

    it('editor shows block metadata: category, description, instance count', () => {
      const src = read('views/admin/AdminPageLayoutEditor.tsx');
      expect(src).toContain('description');
      expect(src).toContain('category');
      expect(src).toContain('countInstances');
      expect(src).toContain('maxInstances');
    });
  });

  // ── Public rendering of premium blocks ─────────────────────────
  describe('Public rendering', () => {
    it('HomeView renders premium blocks', () => {
      const src = read('views/HomeView.tsx');
      expect(src).toContain('renderPremiumBlock');
      expect(src).toContain("'rich-text-block'");
      expect(src).toContain("'image-text-block'");
      expect(src).toContain("'stats-banner'");
      expect(src).toContain("'cta-banner'");
      expect(src).toContain("'faq-block'");
      expect(src).toContain("'newsletter-signup'");
    });

    it('premium block rendering uses slot IDs as keys', () => {
      const src = read('views/HomeView.tsx');
      expect(src).toContain('slot.id');
    });
  });

  // ── Server page passes enriched registries ─────────────────────
  describe('Server data flow', () => {
    it('website page passes category and description to registries', () => {
      const src = read('app/admin/(dashboard)/website/page.tsx');
      expect(src).toContain('category: s.category');
      expect(src).toContain('description: s.description');
      expect(src).toContain('maxInstances: s.maxInstances');
      expect(src).toContain('duplicatable: s.duplicatable');
    });

    it('website page calls ensureSlotIds on layout rows', () => {
      const src = read('app/admin/(dashboard)/website/page.tsx');
      expect(src).toContain('ensureSlotIds');
    });
  });

  // ── Backward compatibility ─────────────────────────────────────
  describe('Backward compatibility', () => {
    it('core page families still resolve correctly', () => {
      expect(getPageFamily('homepage')).toBe('homepage');
      expect(getPageFamily('section:competition')).toBe('section-landing');
      expect(getPageFamily('template:article')).toBe('detail-template');
      expect(getPageFamily('directory:venues')).toBe('directory');
    });

    it('KNOWN_PAGE_KEYS still has all 13 keys', () => {
      expect(KNOWN_PAGE_KEYS.length).toBe(13);
    });

    it('all known page keys still have labels', () => {
      for (const key of KNOWN_PAGE_KEYS) {
        expect(PAGE_KEY_LABELS[key], `Missing label for ${key}`).toBeTruthy();
      }
    });

    it('buildDefaultSlots deduplicates shared block types', () => {
      const slots = buildDefaultSlots('section-landing');
      const types = slots.map((s) => s.sectionType);
      expect(new Set(types).size).toBe(types.length);
    });
  });
});
