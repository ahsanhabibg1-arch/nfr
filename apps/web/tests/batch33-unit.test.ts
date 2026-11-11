import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf-8');

describe('Batch 33 — Unified Site Experience', () => {

  /* ── Content Source contract ──────────────────────────────────────
   * Stage 05 (owner decision D-04) retired `lib/cms/contentSourceEngine.ts`:
   * 402 lines with zero importers, unreachable by construction, and missing the
   * fixture-exclusion filter the live path applies. These six tests asserted
   * that symbols existed inside that dead file — they proved nothing about the
   * running site.
   *
   * They are replaced by assertions on the live contract in `slotUtils`, which
   * is what actually serves pages. Its behaviour (auto / manual / mixed
   * selection, ordering, bounded counts, cross-slot deduplication, fixture and
   * unpublished exclusion) is proven in tests/stage05-content-source.test.ts.
   */
  describe('Content Source contract', () => {
    it('the retired engine is gone from the codebase', () => {
      expect(fs.existsSync(path.join(root, 'lib/cms/contentSourceEngine.ts'))).toBe(false);
    });

    it('no module imports the retired engine', () => {
      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
          if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue;
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) walk(rel);
          else if (/\.(ts|tsx)$/.test(e.name)) {
            const src = fs.readFileSync(path.join(root, rel), 'utf-8');
            // An IMPORT, not a mention. slotUtils documents why the engine was
            // retired, and that comment is deliberate.
            if (/(?:from\s+['"][^'"]*contentSourceEngine|require\(\s*['"][^'"]*contentSourceEngine|import\(\s*['"][^'"]*contentSourceEngine)/.test(src)) {
              offenders.push(rel);
            }
          }
        }
      };
      for (const d of ['app', 'lib', 'views', 'components']) walk(d);
      expect(offenders).toEqual([]);
    });

    it('the authoritative content-source helpers are exported from slotUtils', async () => {
      const mod = await import('../lib/cms/slotUtils');
      for (const fn of ['pickedThenAuto', 'createSelectionContext', 'numProp', 'idListProp', 'limitList']) {
        expect(typeof (mod as Record<string, unknown>)[fn], fn).toBe('function');
      }
    });

    it('the selection context deduplicates and is first-claim-wins', async () => {
      const { createSelectionContext } = await import('../lib/cms/slotUtils');
      const ctx = createSelectionContext(['a']);
      ctx.claim(['b', 'b', null, undefined, '']);
      expect(ctx.has('a')).toBe(true);
      expect(ctx.excluded().sort()).toEqual(['a', 'b']);
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
    it('announcements are site-wide (public layout); homepage fetches its global blocks', () => {
      const layout = read('app/(public)/layout.tsx');
      expect(layout).toContain('getActiveAnnouncements');
      expect(layout).toContain("getActiveBlocksForPlacement('footer-top')");
      expect(layout).toContain("getPublished<FooterConfig>('footer')");
      const src = read('app/(public)/page.tsx');
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
