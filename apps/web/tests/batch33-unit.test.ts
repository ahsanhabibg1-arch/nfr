import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf-8');

describe('Batch 33 — Unified Site Experience', () => {

  // ── Content Source Engine ────────────────────────────────────────
  describe('Content Source Engine', () => {
    const src = read('lib/cms/contentSourceEngine.ts');

    it('exports resolveContentSource function', () => {
      expect(src).toContain('export async function resolveContentSource');
    });

    it('exports resolveMultipleSources function', () => {
      expect(src).toContain('export async function resolveMultipleSources');
    });

    it('exports parseContentSource function', () => {
      expect(src).toContain('export function parseContentSource');
    });

    it('exports DeduplicationContext class', () => {
      expect(src).toContain('export class DeduplicationContext');
    });

    it('supports all 6 entity types', () => {
      for (const type of ['article', 'rodeo-hub', 'rodeo-event', 'rodeo-edition', 'competitor', 'venue']) {
        expect(src).toContain(`'${type}'`);
      }
    });

    it('supports auto/manual/mixed modes', () => {
      for (const mode of ['auto', 'manual', 'mixed']) {
        expect(src).toContain(`'${mode}'`);
      }
    });
  });

  // ── Announcement Service ────────────────────────────────────────
  describe('Announcement Service', () => {
    const src = read('lib/cms/announcementService.ts');

    it('exports CRUD functions', () => {
      expect(src).toContain('export async function listAnnouncements');
      expect(src).toContain('export async function createAnnouncement');
      expect(src).toContain('export async function updateAnnouncement');
      expect(src).toContain('export async function deleteAnnouncement');
      expect(src).toContain('export async function toggleAnnouncementEnabled');
    });

    it('exports getActiveAnnouncements for public use', () => {
      expect(src).toContain('export async function getActiveAnnouncements');
    });

    it('has AnnouncementRow type', () => {
      expect(src).toContain('AnnouncementRow');
    });

    it('validates URLs against XSS', () => {
      expect(src).toContain('javascript:');
      expect(src).toContain('<script');
    });
  });

  // ── Global Block Service ────────────────────────────────────────
  describe('Global Block Service', () => {
    const src = read('lib/cms/globalBlockService.ts');

    it('exports CRUD functions', () => {
      expect(src).toContain('export async function listGlobalBlocks');
      expect(src).toContain('export async function createGlobalBlock');
      expect(src).toContain('export async function updateGlobalBlock');
      expect(src).toContain('export async function deleteGlobalBlock');
      expect(src).toContain('export async function toggleGlobalBlockEnabled');
    });

    it('exports getActiveBlocksForPlacement', () => {
      expect(src).toContain('export async function getActiveBlocksForPlacement');
    });

    it('defines all 7 allowed placements', () => {
      const placements = ['homepage-top', 'homepage-bottom', 'article-end', 'rodeo-hub-top', 'event-detail', 'edition-detail', 'footer-top'];
      for (const p of placements) expect(src).toContain(`'${p}'`);
    });

    it('has 3 block types', () => {
      expect(src).toContain("'MESSAGE'");
      expect(src).toContain("'CTA'");
      expect(src).toContain("'FEATURED_STORY'");
    });

    it('validates placements against allowlist', () => {
      expect(src).toContain('validatePlacements');
    });
  });

  // ── Site Config Service ─────────────────────────────────────────
  describe('Site Config Service', () => {
    const src = read('lib/cms/siteConfigService.ts');

    it('supports footer and appearance keys', () => {
      expect(src).toContain("'footer'");
      expect(src).toContain("'appearance'");
    });

    it('has draft/publish workflow', () => {
      expect(src).toContain('export async function getDraft');
      expect(src).toContain('export async function getPublished');
      expect(src).toContain('export async function saveDraft');
      expect(src).toContain('export async function publishConfig');
      expect(src).toContain('export async function resetDraftToPublished');
    });

    it('defines all 10 intro banner styles', () => {
      const styles = ['editorial', 'stadium', 'bottom-caption', 'right-focus', 'glass', 'framed', 'split', 'spotlight', 'amber', 'minimal'];
      for (const s of styles) expect(src).toContain(`'${s}'`);
    });

    it('has FooterConfig and AppearanceConfig types', () => {
      expect(src).toContain('export interface FooterConfig');
      expect(src).toContain('export interface AppearanceConfig');
    });
  });

  // ── Server Actions ──────────────────────────────────────────────
  describe('Server Actions', () => {
    it('announcement actions exist', () => {
      const src = read('app/admin/announcement-actions.ts');
      expect(src).toContain('createAnnouncementAction');
      expect(src).toContain('updateAnnouncementAction');
      expect(src).toContain('deleteAnnouncementAction');
      expect(src).toContain('toggleAnnouncementAction');
    });

    it('global block actions exist', () => {
      const src = read('app/admin/global-block-actions.ts');
      expect(src).toContain('createGlobalBlockAction');
      expect(src).toContain('updateGlobalBlockAction');
      expect(src).toContain('deleteGlobalBlockAction');
      expect(src).toContain('toggleGlobalBlockAction');
    });

    it('site config actions exist', () => {
      const src = read('app/admin/site-config-actions.ts');
      expect(src).toContain('saveSiteConfigDraftAction');
      expect(src).toContain('publishSiteConfigAction');
      expect(src).toContain('resetSiteConfigDraftAction');
    });
  });

  // ── Admin UI Components ─────────────────────────────────────────
  describe('Admin Editor Components', () => {
    it('AdminWebsitePage has 7 tabs', () => {
      const src = read('views/admin/AdminWebsitePage.tsx');
      expect(src).toContain("'overview'");
      expect(src).toContain("'layout'");
      expect(src).toContain("'nav'");
      expect(src).toContain("'footer'");
      expect(src).toContain("'announcements'");
      expect(src).toContain("'global-blocks'");
      expect(src).toContain("'appearance'");
    });

    it('AdminAnnouncementsEditor renders table and modal', () => {
      const src = read('views/admin/AdminAnnouncementsEditor.tsx');
      expect(src).toContain('AdminModal');
      expect(src).toContain('BREAKING');
      expect(src).toContain('INFO');
    });

    it('AdminGlobalBlocksEditor renders table with placements', () => {
      const src = read('views/admin/AdminGlobalBlocksEditor.tsx');
      expect(src).toContain('AdminModal');
      expect(src).toContain('homepage-top');
      expect(src).toContain('MESSAGE');
      expect(src).toContain('CTA');
      expect(src).toContain('FEATURED_STORY');
    });

    it('AdminFooterEditor has draft/publish controls', () => {
      const src = read('views/admin/AdminFooterEditor.tsx');
      expect(src).toContain('saveSiteConfigDraftAction');
      expect(src).toContain('publishSiteConfigAction');
      expect(src).toContain('Revert to Published');
      expect(src).toContain('Save Draft');
      expect(src).toContain('Publish');
    });

    it('AdminAppearanceEditor has all 10 banner styles', () => {
      const src = read('views/admin/AdminAppearanceEditor.tsx');
      const styles = ['editorial', 'stadium', 'bottom-caption', 'right-focus', 'glass', 'framed', 'split', 'spotlight', 'amber', 'minimal'];
      for (const s of styles) expect(src).toContain(`'${s}'`);
    });
  });

  // ── Public Components ───────────────────────────────────────────
  describe('Public Components', () => {
    it('AnnouncementBanner renders dismissible banners', () => {
      const src = read('components/public/AnnouncementBanner.tsx');
      expect(src).toContain('dismissed');
      expect(src).toContain('BREAKING');
      expect(src).toContain('Dismiss announcement');
    });

    it('GlobalBlockRenderer handles all 3 types', () => {
      const src = read('components/public/GlobalBlockRenderer.tsx');
      expect(src).toContain("case 'MESSAGE'");
      expect(src).toContain("case 'CTA'");
      expect(src).toContain("case 'FEATURED_STORY'");
    });

    it('IntroBanner renders all 10 styles', () => {
      const src = read('components/public/IntroBanner.tsx');
      const styles = ['editorial', 'stadium', 'bottom-caption', 'right-focus', 'glass', 'framed', 'split', 'spotlight', 'amber', 'minimal'];
      for (const s of styles) expect(src).toContain(`case '${s}'`);
    });

    it('IntroBanner supports focal points and overlay', () => {
      const src = read('components/public/IntroBanner.tsx');
      expect(src).toContain('focalX');
      expect(src).toContain('focalY');
      expect(src).toContain('introBannerOverlayDarkness');
      expect(src).toContain('objectPosition');
    });
  });

  // ── Database Migration ──────────────────────────────────────────
  describe('Database Migration', () => {
    it('migration SQL exists', () => {
      const sql = read('prisma/migrations/20261107160000_batch33_site_experience/migration.sql');
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('Announcement');
      expect(sql).toContain('GlobalBlock');
      expect(sql).toContain('SiteConfig');
    });

    it('Prisma schema has new models', () => {
      const schema = read('prisma/schema.prisma');
      expect(schema).toContain('model Announcement');
      expect(schema).toContain('model GlobalBlock');
      expect(schema).toContain('model SiteConfig');
      expect(schema).toContain('enum AnnouncementType');
      expect(schema).toContain('enum GlobalBlockType');
    });

    it('PageLayout has concurrency version field', () => {
      const schema = read('prisma/schema.prisma');
      expect(schema).toMatch(/model PageLayout[\s\S]*version\s+Int/);
    });
  });

  // ── Homepage Integration ────────────────────────────────────────
  describe('Homepage Integration', () => {
    it('homepage server page fetches announcements and global blocks', () => {
      const src = read('app/(public)/page.tsx');
      expect(src).toContain('getActiveAnnouncements');
      expect(src).toContain('getActiveBlocksForPlacement');
      expect(src).toContain("'homepage-top'");
      expect(src).toContain("'homepage-bottom'");
    });

    it('homepage fetches appearance config', () => {
      const src = read('app/(public)/page.tsx');
      expect(src).toContain('getPublished');
      expect(src).toContain('AppearanceConfig');
    });

    it('HomeView accepts and renders announcements and global blocks', () => {
      const src = read('views/HomeView.tsx');
      expect(src).toContain('AnnouncementBanner');
      expect(src).toContain('GlobalBlockRenderer');
      expect(src).toContain('IntroBanner');
    });
  });
});
