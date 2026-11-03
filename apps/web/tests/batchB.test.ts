import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireLocalNonProductionDatabase } from './support/testDbGuard';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import type * as Content from '../lib/content';
import type * as Rodeo from '../lib/rodeoContent';
import type * as Search from '../lib/search/publicSearch';

/**
 * Batch B — accessibility regressions (static), fixture-exclusion policy, legacy script safety.
 * DB checks run only against the isolated test database.
 */
const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    return e.isDirectory() ? walk(p) : /\.(tsx?|mts|mjs)$/.test(e.name) ? [p] : [];
  });
}

// ---------------------------------------------------------------- accessibility (static)
describe('Batch B — accessibility regressions (static)', () => {
  const editor = read('views/admin/AdminArticleEditorShell.tsx');

  it('every fixed editor control has a label associated by htmlFor/id', () => {
    const ids = ['editor-workflow-state', 'editor-reviewer', 'editor-article-type', 'editor-primary-section', 'editor-subcategory',
      'editor-author-byline', 'editor-disclosure', 'editor-rights-status', 'editor-image-credit', 'editor-image-caption'];
    for (const id of ids) {
      expect(editor, `label for ${id}`).toContain(`htmlFor="${id}"`);
      expect(editor, `control ${id}`).toMatch(new RegExp(`<(select|input) id="${id}"`));
    }
  });

  it('required markers and the small reset control meet contrast / target size', () => {
    expect(editor).not.toContain('text-rose-500 font-mono">*Required');
    expect(editor).toMatch(/text-required font-mono">\*Required/);
    expect(editor).toMatch(/inline-flex items-center min-h-6 px-1[^"]*"\s*>\s*Reset to Headline/);
  });

  it('accessible text and focus tokens exist and the focus ring cannot be removed by utilities', () => {
    const css = read('app/globals.css');
    for (const t of ['--color-ink-muted', '--color-ink-inverse-muted', '--color-required']) expect(css).toContain(t);
    expect(css).toMatch(/:focus-visible \{[^}]*outline: 2px solid var\(--color-gold\) !important;[^}]*box-shadow: 0 0 0 2px var\(--color-charcoal\) !important;/);
  });

  it('the header search button takes its accessible name from its visible label', () => {
    const header = read('components/SiteHeader.tsx');
    expect(header).not.toContain('aria-label="Open search dialog"');
    expect(header).toMatch(/aria-haspopup="dialog"/);
    expect(header).toMatch(/<kbd aria-hidden="true"/);
  });

  it('footer column titles and article sections no longer skip heading levels', () => {
    expect(read('components/SiteFooter.tsx')).not.toMatch(/<h4/);
    expect(read('components/editorial/AuthorBio.tsx')).not.toMatch(/<h3/);
    expect(read('components/editorial/SourceList.tsx')).not.toMatch(/<h3/);
  });

  it('breadcrumbs and image credits are tone-aware (no light-only greys on dark surfaces)', () => {
    expect(read('components/editorial/Breadcrumbs.tsx')).toMatch(/tone\?: 'light' \| 'dark'/);
    expect(read('components/editorial/SectionLandingHero.tsx')).toMatch(/<Breadcrumbs[^>]*tone="dark"/);
    expect(read('components/ImageWithCredit.tsx')).toMatch(/tone\?: 'light' \| 'dark'/);
    expect(read('components/sections/HomeArticleFeed.tsx')).toMatch(/tone=\{dark \? 'dark' : 'light'\}/);
  });

  it('the known-issues baseline only lists issues that still exist (no stale suppressions)', () => {
    const known = JSON.parse(read('e2e/a11y-known-issues.json')) as { page: string; rule: string }[];
    // Every Batch A entry was fixed in Batch B; anything listed now must be newly re-confirmed.
    for (const k of known) expect(['label', 'select-name', 'label-content-name-mismatch', 'target-size'], `${k.page}/${k.rule}`).not.toContain(k.rule);
  });
});

// ---------------------------------------------------------------- demo / fixture safety
describe('Batch B — demo data and fixture safety', () => {
  it('mockEditorialData is imported only by the legacy repair script', () => {
    const importers = ['app', 'components', 'views', 'lib', 'config', 'prisma', 'scripts', 'utils', 'e2e']
      .flatMap((d) => (fs.existsSync(path.join(root, d)) ? walk(path.join(root, d)) : []))
      .filter((f) => /from ['"][^'"]*data\/mockEditorialData['"]/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f).replace(/\\/g, '/'));
    expect(importers).toEqual(['scripts/seed-rodeo-links.mts']);
  });

  it('no hard-coded venue/"standard" claim remains in the discipline header', () => {
    expect(read('components/editorial/DisciplineGuideHeader.tsx')).not.toMatch(/Thomas &amp; Mack|Thomas & Mack/);
    expect(read('components/ImageWithCredit.tsx')).not.toMatch(/Rodeo Visual Archive/);
  });

  it('every public read goes through the fixture policy', () => {
    const content = read('lib/content.ts');
    expect(content).not.toMatch(/workflowStatus: PUBLISHED/);
    expect(content).toMatch(/publicArticleWhere\(\)/);
    const rodeo = read('lib/rodeoContent.ts');
    expect(rodeo).not.toMatch(/article: \{ workflowStatus: PUBLISHED \}/);
    expect(rodeo.match(/isHiddenFixtureSlug\(slug\)|isHiddenFixtureSlug\(eventSlug\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(read('lib/search/publicSearch.ts')).toMatch(/fixtureCond/);
  });

  it('seed-rodeo-links is dry-run by default and guarded before any database client is created', () => {
    const s = read('scripts/seed-rodeo-links.mts');
    expect(s).toMatch(/const APPLY = process\.argv\.includes\('--apply'\)/);
    expect(s.indexOf('requireLocalNonProductionDatabase(process.env')).toBeGreaterThan(0);
    expect(s.indexOf('requireLocalNonProductionDatabase(process.env')).toBeLessThan(s.indexOf('new PrismaClient()'));
    expect(s).not.toMatch(/\.(create|update|delete|deleteMany|updateMany)\(/); // only create-missing junction upserts
  });

  it('the local-repair guard refuses remote, cloud and production targets', () => {
    const local = 'postgresql://u:p@localhost:5433/nfrguide_dev';
    expect(requireLocalNonProductionDatabase({ DATABASE_URL: local }, 's')).toBe('localhost:5433/nfrguide_dev');
    expect(() => requireLocalNonProductionDatabase({}, 's')).toThrow(/refuses/);
    expect(() => requireLocalNonProductionDatabase({ DATABASE_URL: 'postgres://a:b@pg-1.aivencloud.com:20376/defaultdb' }, 's')).toThrow(/local/);
    expect(() => requireLocalNonProductionDatabase({ DATABASE_URL: local, CLOUD_DATABASE_URL: local }, 's')).toThrow(/cloud/);
    expect(() => requireLocalNonProductionDatabase({ DATABASE_URL: local, APP_ENV: 'production' }, 's')).toThrow(/production/);
    expect(() => requireLocalNonProductionDatabase({ DATABASE_URL: local, NODE_ENV: 'production' }, 's')).toThrow(/production/);
  });

  it('seed-rodeo-links exits before touching a database for refused targets', () => {
    const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    for (const env of [{ DATABASE_URL: 'postgres://a:b@pg-1.aivencloud.com:20376/defaultdb' }, { APP_ENV: 'production' }]) {
      const r = spawnSync(process.execPath, [tsx, 'scripts/seed-rodeo-links.mts'], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60_000 });
      expect(r.status, JSON.stringify(env)).toBe(2);
      expect(r.stderr).toMatch(/refuses to run/);
    }
  });
});

// ---------------------------------------------------------------- DB: fixture exclusion
let content: typeof Content;
let rodeo: typeof Rodeo;
let search: typeof Search;
let available = false;
if (process.env.DATABASE_URL) {
  try {
    const { prisma } = await import('../lib/db');
    await prisma.$queryRaw`SELECT 1`;
    available = (await prisma.article.count({ where: { slug: FIXTURE_SLUGS.publishedArticle, workflowStatus: 'PUBLISHED' } })) === 1;
    content = await import('../lib/content');
    rodeo = await import('../lib/rodeoContent');
    search = await import('../lib/search/publicSearch');
  } catch {
    available = false;
  }
}
const dbSuite = available ? describe : describe.skip;

dbSuite('Batch B — fixtures never surface publicly in production (isolated test DB)', () => {
  const original = process.env.APP_ENV;
  const asProduction = () => { process.env.APP_ENV = 'production'; };
  afterEach(() => { process.env.APP_ENV = original; });

  it('test/CI: fixtures are visible so smoke and browser tests can use them', async () => {
    process.env.APP_ENV = 'test';
    expect((await content.getPublishedArticles()).some((a) => a.slug === FIXTURE_SLUGS.publishedArticle)).toBe(true);
    expect(await content.getPublishedArticleBySlug(FIXTURE_SLUGS.publishedArticle)).toBeTruthy();
    expect(await rodeo.getPublicHubBySlug(FIXTURE_SLUGS.hub)).toBeTruthy();
  });

  it('production: fixture articles are excluded from every article read', async () => {
    asProduction();
    const all = await content.getPublishedArticles();
    expect(all.length).toBeGreaterThan(0); // legitimate content still appears
    expect(all.some((a) => a.slug.startsWith('fixture-'))).toBe(false);
    expect(await content.getPublishedArticleBySlug(FIXTURE_SLUGS.publishedArticle)).toBeNull();
    expect((await content.getPublishedArticleSlugs()).some((s) => s.startsWith('fixture-'))).toBe(false);
    expect((await content.getLatestArticles(50)).some((a) => a.slug.startsWith('fixture-'))).toBe(false);
    expect((await content.getEvergreenArticles(50)).some((a) => a.slug.startsWith('fixture-'))).toBe(false);
    expect((await content.getPublishedArticlesBySection('NFR Competition')).some((a) => a.slug.startsWith('fixture-'))).toBe(false);
    const hero = await content.getHeroArticle();
    expect(hero?.slug.startsWith('fixture-') ?? false).toBe(false);
  });

  it('production: fixture hubs, events and editions are hidden from lists and lookups', async () => {
    asProduction();
    expect((await rodeo.listPublicHubs()).some((h) => h.slug.startsWith('fixture-'))).toBe(false);
    expect((await rodeo.listPublicEvents()).some((e) => e.slug.startsWith('fixture-'))).toBe(false);
    expect(await rodeo.getPublicHubBySlug(FIXTURE_SLUGS.hub)).toBeNull();
    expect(await rodeo.getPublicEventBySlug(FIXTURE_SLUGS.events[0])).toBeNull();
    expect(await rodeo.getPublicEditionBySlug(FIXTURE_SLUGS.events[0], FIXTURE_SLUGS.editionSlug)).toBeNull();
    expect(await rodeo.resolveRodeoEntity(FIXTURE_SLUGS.events[0])).toBeNull();
    const slugs = await rodeo.getAllRodeoSlugs();
    expect([...slugs.hubs, ...slugs.events, ...slugs.editions.map((e) => e.eventSlug)].some((s) => s.startsWith('fixture-'))).toBe(false);
  });

  it('production: search returns no fixtures (articles or rodeo entities)', async () => {
    process.env.APP_ENV = 'test';
    const visible = await search.runPublicSearch({ q: 'fixture' });
    expect(visible.articles.rows.some((a) => a.url.startsWith('/articles/fixture-'))).toBe(true);
    asProduction();
    const hidden = await search.runPublicSearch({ q: 'fixture' });
    expect(hidden.articles.rows.some((a) => a.url.startsWith('/articles/fixture-'))).toBe(false);
    expect(hidden.rodeo.some((r) => r.url.includes('/fixture-'))).toBe(false);
  });

  it('production: a redirect pointing at a fixture article does not resolve', async () => {
    const { prisma } = await import('../lib/db');
    const src = `/articles/batchb-to-fixture-${Date.now().toString(36)}/`;
    await prisma.articleRedirect.create({ data: { sourcePath: src, targetPath: `/articles/${FIXTURE_SLUGS.publishedArticle}/` } });
    try {
      process.env.APP_ENV = 'test';
      expect(await content.resolveArticleRedirect(src.split('/')[2])).toBeTruthy();
      asProduction();
      expect(await content.resolveArticleRedirect(src.split('/')[2])).toBeNull();
    } finally {
      await prisma.articleRedirect.deleteMany({ where: { sourcePath: src } });
    }
  });
});
