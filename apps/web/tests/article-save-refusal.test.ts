import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * A refused save must say WHAT is missing.
 *
 * THE DEFECT THIS PINS. `ArticleInputSchema.parse` throws a `ZodError`, which
 * is not a `ServiceError`, so the server action's catch-all turned every
 * missing required field into "Unexpected server error." — the same sentence a
 * genuine fault produces, naming nothing.
 *
 * It was reported from production: pressing "Create Draft" on a new article
 * failed with that message while the real causes were an empty excerpt and an
 * unchosen article type. An author had no way to tell their own omission from
 * a broken server, and no way to find the field.
 *
 * These tests go through `saveArticle`, the same entry point the Server Action
 * calls, so they fail if the translation is ever removed.
 */

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

suite('a refused article save names the fields', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/articleService');
  let actor: { id: string; roles: string[] };
  let base: Record<string, unknown>;
  const made: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    svc = await import('../lib/cms/articleService');
    const admin = await prisma.user.findFirstOrThrow({
      where: { roles: { some: { role: { key: 'super_admin' } } } },
      select: { id: true, roles: { select: { role: { select: { key: true } } } } },
    });
    actor = { id: admin.id, roles: admin.roles.map((r) => r.role.key) };
    const cat = await prisma.category.findFirstOrThrow({ select: { name: true } });
    const author = await prisma.author.findFirst({ select: { name: true, role: true } });
    base = {
      title: 'How to Watch NFR 2026 TV Channels Streaming Schedule',
      deck: '', excerpt: '', blocks: [], seoTitle: 'T', metaDescription: '',
      imageSeoTitle: '', imageAltText: '', subcategoryId: null, articleType: '',
      categoryName: cat.name, authorName: author?.name ?? '', authorRole: author?.role ?? '',
      reviewerName: '', heroImage: '', imageCredit: '', imageCaption: '',
      imageRightsStatus: 'Unresolved', disclosure: 'editorial-independent', disclosureNote: '',
      tags: [], takeaways: [], sources: [],
      disciplineIds: [], hubIds: [], eventIds: [], editionIds: [],
    };
  });

  afterAll(async () => {
    for (const id of made) {
      await prisma.articleBlock.deleteMany({ where: { articleId: id } });
      await prisma.articleSeo.deleteMany({ where: { articleId: id } });
      await prisma.articleRevision.deleteMany({ where: { articleId: id } });
      await prisma.article.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  /** Saves and returns the thrown error, or fails if the save succeeded. */
  async function refusal(input: Record<string, unknown>) {
    try {
      const res = await svc.saveArticle(actor as never, input as never);
      made.push(res.id);
      throw new Error('expected the save to be refused, but it succeeded');
    } catch (e) {
      return e as Error & { code?: string; details?: unknown };
    }
  }

  it('is a VALIDATION refusal, not an unexpected server error', async () => {
    const err = await refusal({ ...base, slug: `refusal-${Date.now()}` });
    expect(err.code, 'the author must not be told the server broke').toBe('validation');
    expect(err.message).not.toContain('Unexpected server error');
  });

  it('names every missing field, not just the first', async () => {
    const err = await refusal({ ...base, slug: `refusal-${Date.now()}` });
    // The two real causes from the production report.
    expect(err.message).toMatch(/Excerpt is required/i);
    expect(err.message).toMatch(/article type/i);
  });

  it('uses a rule\'s own wording verbatim instead of repeating the field', async () => {
    // "Article type — Choose an article type" reads as a stutter; the rule's
    // message was written to be read by an author.
    const err = await refusal({ ...base, slug: `refusal-${Date.now()}` });
    expect(err.message).not.toMatch(/Article type\s*[—:]\s*Choose an article type/i);
  });

  it('carries the issues as details, so a field-level gate can still be shown', async () => {
    const err = await refusal({ ...base, slug: `refusal-${Date.now()}` });
    const issues = (err.details as { issues?: { path: string; field: string }[] })?.issues ?? [];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.path)).toContain('excerpt');
    expect(issues.map((i) => i.path)).toContain('articleType');
  });

  it('SAVES once those fields are supplied', async () => {
    // The other half of the report: the draft is otherwise legitimate, so the
    // same payload must succeed as soon as the two gaps are filled.
    const type = await prisma.articleType.findFirst({ where: { selectable: true }, select: { value: true } });
    const res = await svc.saveArticle(actor as never, {
      ...base,
      slug: `refusal-ok-${Date.now()}`,
      excerpt: 'A short editorial summary of the 2026 broadcast schedule.',
      articleType: type?.value ?? 'General Information',
    } as never);
    made.push(res.id);
    expect(res.id).toBeTruthy();
    expect(res.version).toBe(1);
  });
});
