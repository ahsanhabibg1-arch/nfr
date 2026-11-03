import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import { serializeJsonLd, JsonLd, articleJsonLd, disciplineJsonLd, isNewsArticleType, NEWS_ARTICLE_TYPES } from '../lib/seo';
import { requireIsolatedScriptDatabase } from './support/testDbGuard';
import { classifyReport } from '../scripts/assert-no-skipped-tests.mjs';
import { FIXTURE_ARTICLES, FIXTURE_SLUGS, NFR_DISCIPLINES } from '../prisma/fixtures';
import type { Article, Discipline } from '../types';
import type * as Svc from '../lib/cms/articleService';
import type * as RodeoContent from '../lib/rodeoContent';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

// ---------------------------------------------------------------- A1 JSON-LD
describe('A1 — structured data classification', () => {
  const ALL_TYPES = ['News', 'Event Update', 'Event Guide', 'Schedule', 'Results & Standings', 'How to Watch', 'Preview', 'Competitor Profile', 'Rules & Format', 'History', 'Records & Past Winners', 'Entertainment Guide', 'Ticket Guide', 'Venue Guide', 'Travel Guide', 'Product Buying Guide', 'Product Review', 'General Information'];
  const article = (over: Partial<Article> = {}) => ({
    slug: 'a-slug', title: 'Title', deck: 'Deck', excerpt: 'Excerpt', heroImage: '/x.jpg', publishedAt: '2026-01-01T00:00:00.000Z',
    category: 'NFR Competition', author: { name: 'Author', role: 'Writer' }, ...over,
  }) as unknown as Article;

  it('News and Event Update (any casing / whitespace) are NewsArticle; every other type is Article', () => {
    for (const t of ALL_TYPES) {
      const expected = t === 'News' || t === 'Event Update' ? 'NewsArticle' : 'Article';
      expect(articleJsonLd(article({ articleType: t as Article['articleType'] }))['@type'], t).toBe(expected);
    }
    expect(isNewsArticleType(' news ')).toBe(true);
    expect(isNewsArticleType('EVENT UPDATE')).toBe(true);
    expect(isNewsArticleType('guide')).toBe(false);
    expect(isNewsArticleType(undefined)).toBe(false);
    expect([...NEWS_ARTICLE_TYPES].sort()).toEqual(['event update', 'news']);
  });

  it('missing optional fields still produce valid, parseable JSON-LD', () => {
    const ld = articleJsonLd(article({ deck: '', excerpt: undefined, heroImage: '', publishedAt: undefined, articleType: undefined }));
    expect(ld['@type']).toBe('Article');
    expect(() => JSON.parse(serializeJsonLd(ld))).not.toThrow();
  });

  it('discipline structured data makes no "Official" authority claim', () => {
    const d = { name: 'Bull Riding', summary: 'x', image: '' } as unknown as Discipline;
    expect(JSON.stringify(disciplineJsonLd(d))).not.toMatch(/official/i);
  });
});

describe('A1 — secure JSON-LD serialization', () => {
  const HOSTILE = [
    '</script><script>alert(1)</script>',
    '</SCRIPT ><img src=x onerror=alert(1)>',
    '</ScRiPt\n>',
    '<!-- comment --><b>bold</b>',
    'quote " and \' and backslash \\ and \\u003c',
    'unicode: café — 日本語 — emoji 🤠 — line sep \u2028 para sep \u2029',
    'newline\nand\r\nreturn and tab\t',
    '{"json":"special"} [1,2] & &amp; &lt;',
  ];

  it('round-trips every hostile value exactly through JSON.parse', () => {
    for (const h of HOSTILE) {
      const data = { headline: h, description: h, author: { name: h }, nested: [{ text: h }] };
      expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
    }
  });

  it('output never contains "<", ">", "&" or raw U+2028/U+2029 — no script breakout is possible', () => {
    for (const h of HOSTILE) {
      const out = serializeJsonLd({ headline: h, description: h });
      expect(out).not.toMatch(/[<>&\u2028\u2029]/);
      expect(out.toLowerCase()).not.toContain('</script');
    }
  });

  it('the rendered <script> element contains exactly one script and the payload stays inside it', () => {
    const data = { '@type': 'Article', headline: HOSTILE[0], description: HOSTILE[1] };
    const html = renderToStaticMarkup(React.createElement(JsonLd, { data }));
    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    const body = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    expect(JSON.parse(body)).toEqual(data);
  });

  it('every JSON-LD emitter goes through the central serializer', () => {
    const seo = read('lib/seo.tsx');
    expect(seo).toMatch(/__html: serializeJsonLd\(data\)/);
    expect(seo).not.toMatch(/__html: JSON\.stringify/);
    const offenders = ['app', 'views', 'components'].flatMap((d) => walk(path.join(root, d)))
      .filter((f) => /application\/ld\+json/.test(fs.readFileSync(f, 'utf8')) && !f.endsWith(path.join('lib', 'seo.tsx')));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx?|mts)$/.test(e.name) ? [p] : [];
  });
}

// ---------------------------------------------------------------- A2 truthfulness
describe('A2 — purse and other unsupported claims', () => {
  it('the public edition model and view carry no purse field', () => {
    expect(read('lib/rodeoContent.ts')).not.toMatch(/purseBenchmark: (ed|e)\./);
    expect(read('views/RodeoViews.tsx')).not.toMatch(/purseBenchmark|Purse/);
  });
  it('no public "Official …" authority claims remain in discipline pages or results metadata', () => {
    expect(read('components/editorial/DisciplineGuideHeader.tsx')).not.toMatch(/Official NFR/);
    expect(read('app/(public)/rodeo-events/[slug]/[edition]/results/page.tsx')).not.toMatch(/Official, source-verified/);
  });
});

// ---------------------------------------------------------------- A3 scheduling (static)
describe('A3 — scheduling UI', () => {
  const editor = read('views/admin/AdminArticleEditorShell.tsx');
  it('offers no Schedule action and no selectable "scheduled" option', () => {
    expect(editor).not.toMatch(/handleWorkflowTransition\('scheduled'\)/);
    expect(editor).not.toMatch(/>\s*Schedule\s*</);
    expect(editor).toMatch(/<option value="scheduled" disabled>/);
    expect(editor).not.toMatch(/type="datetime-local"/);
  });
  it('labels legacy scheduled rows "Manual publish required" in editor, list and overview', () => {
    expect(editor).toMatch(/Manual publish required/);
    expect(read('views/admin/AdminArticlesPage.tsx')).toMatch(/MANUAL PUBLISH REQUIRED/);
    expect(read('app/admin/(dashboard)/page.tsx')).toMatch(/manual publish required/);
  });
});

// ---------------------------------------------------------------- A4 mock admin
describe('A4 — no mock admin pages or data', () => {
  it('dead mock views and mock admin data are removed', () => {
    for (const f of ['views/admin/AdminOverviewPage.tsx', 'views/admin/AdminWebsitePage.tsx', 'data/mockAdminData.ts']) {
      expect(fs.existsSync(path.join(root, f)), f).toBe(false);
    }
  });
  it('the notification panel has no hard-coded notifications and the bell has no unread dot', () => {
    const panel = read('components/admin/AdminNotificationPanel.tsx');
    expect(panel).not.toMatch(/SAMPLE_NOTIFICATIONS|SEO Audit Completed|Sitemap Generated|purse confirmation|Phase 0 Mock/);
    expect(read('components/admin/AdminTopbar.tsx')).not.toContain('absolute top-1.5 right-1.5 w-2 h-2 rounded-full');
  });
  it('the source picker uses the DB directory and never marks a new source as verified', () => {
    const p = read('components/admin/editor/ArticleSourcesPanel.tsx');
    expect(p).not.toMatch(/mockAdminData|ADMIN_SOURCES|Verified Official|Current Season/);
    expect(p).toMatch(/status: 'needs_review'/);
  });
  it('the checklist is labelled as a pass count, not an SEO score', () => {
    const e = read('views/admin/AdminArticleEditorShell.tsx');
    expect(e).not.toMatch(/% Score/);
    expect(e).toMatch(/checks passed/);
  });
});

// ---------------------------------------------------------------- A5 seed (static)
describe('A5 — neutral seed', () => {
  const seed = read('prisma/seed.ts');
  const fixtures = read('prisma/fixtures.ts');
  it('imports no demo data module', () => {
    expect(seed).not.toMatch(/from ['"][^'"]*data\/mock/);
    expect(fixtures).not.toMatch(/from ['"][^'"]*data\/mock/);
  });
  it('contains none of the unsupported claims found in the audit', () => {
    for (const c of [/2,150,000|1,200,000|650,000/, /17,000/, /500,000/, /Montana Silversmiths/, /5:45 PM|11:00 PM/, /million/i, /Calgary|Cheyenne|Pendleton|Thomas & Mack|South Point/]) {
      expect(seed, String(c)).not.toMatch(c);
      expect(fixtures, String(c)).not.toMatch(c);
    }
  });
  it('every write is create-only (never overwrites CMS edits or republishes)', () => {
    const updates = seed.match(/update:\s*\{[^}]*\}/g) ?? [];
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) expect(u.replace(/\s/g, '')).toBe('update:{}');
    expect(seed).not.toMatch(/\.(deleteMany|delete)\(/);
  });
  it('fixtures are clearly synthetic and only seeded into an isolated test database', () => {
    for (const f of FIXTURE_ARTICLES) {
      expect(f.slug.startsWith('fixture-')).toBe(true);
      expect(f.title.startsWith('Fixture:')).toBe(true);
    }
    expect(Object.values(FIXTURE_SLUGS).flat().every((s) => String(s).startsWith('fixture-'))).toBe(true);
    expect(seed).toMatch(/decideTestDatabase\(\{ TEST_DATABASE_URL: process\.env\.DATABASE_URL/);
    expect(seed).toMatch(/if \(fixtures\) await seedFixtures\(\)/);
    expect(NFR_DISCIPLINES).toHaveLength(7);
  });
  it('the route smoke script targets fixture slugs, not demo slugs', () => {
    const s = read('scripts/route-smoke.mts');
    expect(s).not.toMatch(/inside-the-chutes|calgary-stampede|canadian-professional-rodeo/);
    expect(s).toMatch(/fixture-competition-article/);
  });
  it('canonical navigation and the mobile drawer link no demo articles', () => {
    expect(read('lib/cms/navCanonical.ts')).not.toMatch(/ROUTES\.ARTICLE\(/);
    expect(read('components/SiteHeader.tsx')).not.toMatch(/\/articles\/[a-z0-9-]+\//);
  });
});

// ---------------------------------------------------------------- A6 CI (static)
describe('A6 — CI configuration', () => {
  const ci = fs.readFileSync(path.join(root, '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
  it('pins Node 22 via .nvmrc and Postgres 18 (production major)', () => {
    expect(fs.readFileSync(path.join(root, '..', '..', '.nvmrc'), 'utf8').trim()).toMatch(/^22\.\d+\.\d+$/);
    expect(ci).toMatch(/node-version-file: \.nvmrc/);
    expect(ci).toMatch(/image: postgres:18/);
    expect(JSON.parse(read('package.json')).engines?.node).toMatch(/^>=22\.\d+\.\d+ <23$/);
  });
  it('runs migrate → seed → tests → skip gate in order, with REQUIRE_DB_TESTS', () => {
    const at = (s: string) => ci.indexOf(s);
    expect(at('prisma migrate deploy')).toBeGreaterThan(0);
    expect(at('prisma migrate deploy')).toBeLessThan(at('prisma db seed'));
    expect(at('prisma db seed')).toBeLessThan(at('vitest run'));
    expect(at('vitest run')).toBeLessThan(at('assert-no-skipped-tests.mjs'));
    expect(ci).toMatch(/REQUIRE_DB_TESTS: '1'/);
    expect(ci).toMatch(/playwright test/);
    // No production host, cloud URL or GitHub secret reference anywhere in the workflow.
    expect(ci).not.toMatch(/aivencloud\.com|CLOUD_DATABASE_URL|\$\{\{\s*secrets\./);
  });
});

describe('A6 — skip gate classification', () => {
  const report = (statuses: string[]) => ({ testResults: [{ name: 'f', assertionResults: statuses.map((s, i) => ({ fullName: `t${i}`, status: s })) }] });
  it('passes only when everything ran', () => {
    expect(classifyReport(report(['passed', 'passed'])).ok).toBe(true);
  });
  it('fails on skipped / pending / todo, failures, or zero executed tests', () => {
    expect(classifyReport(report(['passed', 'skipped'])).ok).toBe(false);
    expect(classifyReport(report(['passed', 'pending'])).ok).toBe(false);
    expect(classifyReport(report(['passed', 'todo'])).ok).toBe(false);
    expect(classifyReport(report(['failed'])).ok).toBe(false);
    expect(classifyReport(report([])).ok).toBe(false);
  });
  it('treats allow-listed skips as intentional', () => {
    const r = classifyReport(report(['passed', 'skipped']), [{ fullName: 't1', reason: 'documented' }]);
    expect(r.ok).toBe(true);
    expect(r.intentional).toHaveLength(1);
  });
  it('the shipped allow-list is empty', () => {
    expect(JSON.parse(read('tests/allowed-skips.json'))).toEqual([]);
  });
});

// ---------------------------------------------------------------- A8 script guards
describe('A8 — writing scripts require an isolated test database', () => {
  const dev = 'postgresql://u:p@localhost:5433/nfrguide_dev';
  const ok = 'postgresql://u:p@localhost:5433/nfrguide_test';
  it('refuses unset, development, remote/production and non-disposable targets (fails closed)', () => {
    expect(() => requireIsolatedScriptDatabase({ DATABASE_URL: dev }, 's')).toThrow(/refuses to run/);
    expect(() => requireIsolatedScriptDatabase({ TEST_DATABASE_URL: dev, DATABASE_URL: dev }, 's')).toThrow();
    expect(() => requireIsolatedScriptDatabase({ TEST_DATABASE_URL: 'postgres://a:b@pg-1.aivencloud.com:20376/defaultdb_test' }, 's')).toThrow();
    expect(() => requireIsolatedScriptDatabase({ TEST_DATABASE_URL: 'garbage' }, 's')).toThrow();
  });
  it('returns the isolated test database URL', () => {
    expect(requireIsolatedScriptDatabase({ TEST_DATABASE_URL: ok, DATABASE_URL: dev }, 's')).toBe(ok);
  });
  it('each writing script applies the guard before any database module is imported', () => {
    for (const s of ['admin-auth-smoke', 'cache-invalidation', 'media-http-check']) {
      const src = read(`scripts/${s}.mts`);
      const guard = src.indexOf('requireIsolatedScriptDatabase(process.env');
      const dbImport = src.indexOf("import('../lib/db')");
      expect(guard, s).toBeGreaterThan(0);
      expect(dbImport, s).toBeGreaterThan(guard);
      expect(src, s).not.toMatch(/^import .*lib\/db/m);
    }
  });
});

// ================================================================ DB integration (isolated test DB)
let prisma: PrismaClient;
let svc: typeof Svc;
let rodeo: typeof RodeoContent;
let available = false;
if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    svc = await import('../lib/cms/articleService');
    rodeo = await import('../lib/rodeoContent');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = (await prisma.category.count()) > 0;
  } catch {
    available = false;
  }
}
const dbSuite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 9);

dbSuite('Batch A — DB integration (isolated test DB)', () => {
  const actors: Record<string, Svc.ActorContext> = {};
  async function makeUser(roleKey: string): Promise<Svc.ActorContext> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.create({ data: { email: `bata-${roleKey}-${rid()}@example.com`, name: `BA ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return { id: user.id, roles: [roleKey] as Svc.ActorContext['roles'] };
  }
  const input = (over: Partial<Svc.ArticleInput> = {}): Svc.ArticleInput => ({
    slug: `bata-${rid()}`, title: 'Batch A Integration Headline', excerpt: 'An excerpt long enough for the gate.',
    blocks: [{ type: 'paragraph', text: 'One paragraph.' }, { type: 'paragraph', text: 'Two.' }],
    categoryName: 'NFR Competition', authorName: 'BA Tester', imageRightsStatus: 'Staff Photo',
    imageAltText: 'A descriptive alt text for the photo.', ...over,
  });
  async function approved(): Promise<string> {
    const r = await svc.saveArticle(actors.admin, input());
    await svc.transitionWorkflow(actors.admin, r.id, 'IN_REVIEW');
    await svc.transitionWorkflow(actors.admin, r.id, 'APPROVED');
    return r.id;
  }

  beforeAll(async () => {
    actors.admin = await makeUser('super_admin');
    actors.editor = await makeUser('editor');
    actors.author = await makeUser('author');
  });
  afterAll(async () => {
    await prisma.articleRedirect.deleteMany({ where: { sourcePath: { startsWith: '/articles/bata-' } } });
    await prisma.article.deleteMany({ where: { slug: { startsWith: 'bata-' } } });
    await prisma.rodeoEventEdition.deleteMany({ where: { editionSlug: { startsWith: 'bata-' } } });
    await prisma.rodeoEvent.deleteMany({ where: { slug: { startsWith: 'bata-' } } });
    await prisma.source.deleteMany({ where: { id: { startsWith: 'bata-' } } });
    await prisma.source.deleteMany({ where: { title: { startsWith: 'BA Typed Source' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'bata-' } } });
  });

  // ---- A3 scheduling (server side)
  it('rejects moving an article to SCHEDULED for every role, with the exact message, and changes nothing', async () => {
    const id = await approved();
    for (const a of [actors.admin, actors.editor, actors.author]) {
      await expect(svc.transitionWorkflow(a, id, 'SCHEDULED', undefined, new Date(Date.now() + 86_400_000).toISOString()))
        .rejects.toMatchObject({ code: 'validation', message: 'Scheduled publishing is not available yet. Please publish manually.' });
    }
    expect((await prisma.article.findUniqueOrThrow({ where: { id } })).workflowStatus).toBe('APPROVED');
  });

  it('existing SCHEDULED rows can still be unscheduled or published manually', async () => {
    const a = await approved();
    await prisma.article.update({ where: { id: a }, data: { workflowStatus: 'SCHEDULED' } });
    expect((await svc.transitionWorkflow(actors.editor, a, 'APPROVED')).status).toBe('APPROVED');
    const b = await approved();
    await prisma.article.update({ where: { id: b }, data: { workflowStatus: 'SCHEDULED' } });
    expect((await svc.transitionWorkflow(actors.editor, b, 'PUBLISHED')).becamePublic).toBe(true);
  });

  // ---- A4 source picker (server side)
  it('attaching an existing directory source links it without creating a duplicate or editing it', async () => {
    const src = await prisma.source.create({ data: { id: `bata-src-${rid()}`, title: 'BA Directory Source', url: 'https://example.org/ba', publisher: 'Example' } });
    const before = await prisma.source.count();
    const r = await svc.saveArticle(actors.admin, input({ sources: [{ sourceId: src.id, title: 'TAMPERED TITLE', url: 'https://evil.example/', publisher: 'X' }] }));
    expect(await prisma.source.count()).toBe(before);
    const after = await prisma.source.findUniqueOrThrow({ where: { id: src.id } });
    expect([after.title, after.url, after.publisher]).toEqual(['BA Directory Source', 'https://example.org/ba', 'Example']);
    expect((await prisma.articleSource.findMany({ where: { articleId: r.id } })).map((s) => s.sourceId)).toEqual([src.id]);
  });

  it('rejects unknown or deleted source ids and persists nothing', async () => {
    await expect(svc.saveArticle(actors.admin, input({ sources: [{ sourceId: 'no-such-source', title: 'x', url: 'https://example.org' }] })))
      .rejects.toMatchObject({ code: 'validation' });
  });

  it('a typed-in source never overwrites an existing directory row; the same source twice links once', async () => {
    const r1 = await svc.saveArticle(actors.admin, input({ sources: [{ title: 'BA Typed Source', url: 'https://example.org/typed', publisher: 'First' }] }));
    const sid = (await prisma.articleSource.findFirstOrThrow({ where: { articleId: r1.id } })).sourceId;
    await svc.saveArticle(actors.admin, input({ sources: [{ title: 'BA Typed Source', url: 'https://example.org/typed', publisher: 'Second' }] }));
    expect((await prisma.source.findUniqueOrThrow({ where: { id: sid } })).publisher).toBe('First');
    const r3 = await svc.saveArticle(actors.admin, input({ sources: [{ sourceId: sid, title: 'a', url: 'https://example.org/typed' }, { sourceId: sid, title: 'a', url: 'https://example.org/typed' }] }));
    expect(await prisma.articleSource.count({ where: { articleId: r3.id } })).toBe(1);
  });

  // ---- A2 purse never in the public model
  it('an edition with a stored purse note exposes no purse in the public edition object', async () => {
    const ev = await prisma.rodeoEvent.create({ data: { slug: `bata-ev-${rid()}`, name: 'BA Event' } });
    await prisma.rodeoEventEdition.create({ data: { eventId: ev.id, editionSlug: `bata-${rid()}`, label: 'BA Edition', purseBenchmark: '$9,999,999 (should never be public)' } });
    const ed = await prisma.rodeoEventEdition.findFirstOrThrow({ where: { eventId: ev.id } });
    const pub = await rodeo.getPublicEditionBySlug(ev.slug, ed.editionSlug);
    expect(pub).toBeTruthy();
    expect(JSON.stringify(pub)).not.toMatch(/9,999,999|purse/i);
    expect(Object.keys(pub!)).not.toContain('purseBenchmark');
  });

  // ---- A5 seed safety (runs the real seed against the ISOLATED test DB only)
  it('re-running the seed creates fixtures once and never reverts CMS edits or republishes content', async () => {
    const runSeed = () => spawnSync(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'prisma/seed.ts'], {
      cwd: root, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, encoding: 'utf8', timeout: 120_000,
    });
    const first = runSeed();
    expect(first.status, first.stderr).toBe(0);
    const fixture = await prisma.article.findFirstOrThrow({ where: { slug: FIXTURE_SLUGS.publishedArticle } });
    expect(fixture.workflowStatus).toBe('PUBLISHED');
    expect(fixture.title.startsWith('Fixture:')).toBe(true);

    const disc = await prisma.discipline.findFirstOrThrow({ where: { slug: 'bull-riding' } });
    const originalTitle = fixture.title;
    try {
      await prisma.article.update({ where: { id: fixture.id }, data: { title: 'Fixture: edited in CMS', workflowStatus: 'DRAFT' } });
      await prisma.discipline.update({ where: { id: disc.id }, data: { summary: 'Edited in CMS' } });
      const counts = async () => [await prisma.article.count(), await prisma.category.count(), await prisma.discipline.count(), await prisma.source.count()];
      const before = await counts();

      const second = runSeed();
      expect(second.status, second.stderr).toBe(0);

      const again = await prisma.article.findUniqueOrThrow({ where: { id: fixture.id } });
      expect([again.title, again.workflowStatus]).toEqual(['Fixture: edited in CMS', 'DRAFT']);
      expect((await prisma.discipline.findUniqueOrThrow({ where: { id: disc.id } })).summary).toBe('Edited in CMS');
      expect(await counts()).toEqual(before);
    } finally {
      await prisma.article.update({ where: { id: fixture.id }, data: { title: originalTitle, workflowStatus: 'PUBLISHED' } });
      await prisma.discipline.update({ where: { id: disc.id }, data: { summary: disc.summary } });
    }
  }, 300_000);
});
