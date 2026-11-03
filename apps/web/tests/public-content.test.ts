import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, WorkflowStatus } from '@prisma/client';
import { LEGAL_PAGES, getIndexableLegalPages, getLegalPage } from '../config/legalPages';
import { QUICK_ACCESS_LINKS } from '../config/quickAccess';
import { PRIMARY_SECTIONS } from '../config/routes';

/**
 * Phase 2 / Workstream 1 — public content eligibility + legal pages.
 * Static guards run everywhere; the draft-exclusion check needs the isolated test DB.
 */

const root = path.resolve(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|mts)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Public code paths: everything that can render on a non-admin page. */
function publicSourceFiles(): string[] {
  const files = [
    ...walk(path.join(root, 'app', '(public)')),
    ...walk(path.join(root, 'components')).filter((f) => !f.includes(`${path.sep}admin${path.sep}`)),
    ...walk(path.join(root, 'views')).filter((f) => !f.includes(`${path.sep}admin${path.sep}`)),
    ...walk(path.join(root, 'config')),
    ...walk(path.join(root, 'lib')),
    path.join(root, 'app', 'layout.tsx'),
    path.join(root, 'app', 'sitemap.ts'),
  ];
  return files.filter((f) => fs.existsSync(f));
}

describe('public pages render no static mock content', () => {
  it('no public code path imports the Phase 0 mock data modules', () => {
    const offenders = publicSourceFiles().filter((f) =>
      /from\s+['"][^'"]*data\/mock(EditorialData|AdminData)['"]/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it('the fabricated sponsor placeholder component is gone and nothing references it', () => {
    expect(fs.existsSync(path.join(root, 'components', 'AdSlot.tsx'))).toBe(false);
    const refs = publicSourceFiles().filter((f) => /from\s+['"][^'"]*\/AdSlot['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(refs).toEqual([]);
  });

  it('known fabricated claims from the audit do not appear in public source or section metadata', () => {
    const claims = [/Booth 2410/, /July 3.{1,3}12, 2026/, /17,000 spectators/, /editorial@nfrguide\.com/, /Las Vegas & Denver/, /2026 Season Coverage/, /100% Independent/];
    const text = publicSourceFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n') + JSON.stringify(PRIMARY_SECTIONS);
    for (const c of claims) expect(text).not.toMatch(c);
  });

  it('quick-access links are navigation only (no badges/counts) and target real section routes', () => {
    const sectionPaths = new Set(Object.values(PRIMARY_SECTIONS).map((s) => s.path));
    for (const q of QUICK_ACCESS_LINKS) {
      expect(q.badge).toBeUndefined();
      expect(sectionPaths.has(q.targetRoute!)).toBe(true);
      expect(q.description).not.toMatch(/\d/);
    }
  });
});

describe('legal / policy pages', () => {
  const required = ['about', 'editorial-policy', 'corrections', 'affiliate-disclosure', 'privacy', 'terms', 'contact'];

  it('every required page is configured and has a route file', () => {
    for (const slug of required) {
      const page = getLegalPage(slug);
      expect(page, slug).toBeTruthy();
      expect(page!.path).toBe(`/${slug}/`);
      expect(fs.existsSync(path.join(root, 'app', '(public)', slug, 'page.tsx')), `${slug} route`).toBe(true);
    }
  });

  it('pages awaiting review are excluded from the sitemap and list what the owner must confirm', () => {
    for (const p of LEGAL_PAGES) {
      if (p.review !== 'approved') {
        expect(getIndexableLegalPages()).not.toContain(p);
        expect(p.ownerInputs.length).toBeGreaterThan(0);
      }
    }
  });

  it('copy invents no contact details, addresses or certifications', () => {
    const text = JSON.stringify(LEGAL_PAGES);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i); // email address
    expect(text).not.toMatch(/\+?\d[\d\s().-]{7,}\d/); // phone number
    expect(text).not.toMatch(/\b(certified|GDPR[- ]compliant|CCPA[- ]compliant|ISO ?\d{4,})\b/i);
  });

  it('the footer links to the policy routes instead of modal copy', () => {
    const footer = fs.readFileSync(path.join(root, 'components', 'SiteFooter.tsx'), 'utf8');
    expect(footer).toMatch(/LEGAL_PAGES/);
    expect(footer).not.toMatch(/setActivePolicy/);
  });
});

// ---- DB: new homepage feeds never surface non-published content ----

let db: PrismaClient | undefined;
let repo: typeof import('../lib/content') | undefined;
let available = false;
if (process.env.DATABASE_URL) {
  db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    available = (await db.category.count()) > 0 && (await db.author.count()) > 0;
    if (available) repo = await import('../lib/content');
  } catch {
    available = false;
  }
}
const dbSuite = available ? describe : describe.skip;

dbSuite('homepage feeds exclude non-published articles (isolated test DB)', () => {
  const created: string[] = [];
  afterAll(async () => {
    if (created.length) await db!.article.deleteMany({ where: { id: { in: created } } });
    await db!.$disconnect();
  });

  it('a DRAFT / SCHEDULED evergreen article in a section never appears in section or evergreen feeds', async () => {
    const category = await db!.category.findFirstOrThrow({ where: { name: PRIMARY_SECTIONS['plan-watch'].categoryKey } });
    const author = await db!.author.findFirstOrThrow();
    const tag = `p2ws1-${Date.now().toString(36)}`;
    for (const status of [WorkflowStatus.DRAFT, WorkflowStatus.SCHEDULED, WorkflowStatus.ARCHIVED]) {
      const a = await db!.article.create({
        data: { slug: `${tag}-${status.toLowerCase()}`, title: `${tag} ${status}`, excerpt: 'x', articleType: 'History', workflowStatus: status, authorId: author.id, categoryId: category.id },
      });
      created.push(a.id);
    }
    const section = await repo!.getPublishedArticlesBySection(category.name);
    const evergreen = await repo!.getEvergreenArticles(100);
    for (const a of [...section, ...evergreen]) expect(a.slug.startsWith(tag)).toBe(false);
  });

  it('a PUBLISHED evergreen-type article does appear in the evergreen feed', async () => {
    const category = await db!.category.findFirstOrThrow();
    const author = await db!.author.findFirstOrThrow();
    const slug = `p2ws1-pub-${Date.now().toString(36)}`;
    const a = await db!.article.create({
      data: { slug, title: 'evergreen', excerpt: 'x', articleType: 'Rules & Format', workflowStatus: WorkflowStatus.PUBLISHED, publishedAt: new Date(), authorId: author.id, categoryId: category.id },
    });
    created.push(a.id);
    expect((await repo!.getEvergreenArticles(100)).some((x) => x.slug === slug)).toBe(true);
  });
});
