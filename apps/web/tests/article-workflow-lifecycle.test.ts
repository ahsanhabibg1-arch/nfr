import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * The editorial lifecycle, end to end: draft, review, approval, publication.
 *
 * WHY THIS EXISTS. The save path and the workflow path are separate pieces of
 * code, with separate permission checks and a publication gate between them,
 * and nothing exercised them in SEQUENCE against a real database. A production
 * report — "Create Draft says Unexpected server error" — showed what that
 * costs: the first step of the sequence was failing for an ordinary reason and
 * reporting it as a fault, and no test would have noticed.
 *
 * The subject article is built from a REAL published row, so the publication
 * gate is satisfied the way an author satisfies it rather than by this test
 * guessing at its rules. If the gate gains a requirement, this starts failing
 * instead of quietly testing a weaker article.
 */

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

/** The editor sends labels; the column stores an enum. */
const RIGHTS_LABEL: Record<string, string> = {
  STAFF_PHOTO: 'Staff Photo', EDITORIAL_POOL: 'Editorial Pool', PRCA_ARCHIVE: 'PRCA Archive',
  LICENSED_CREATIVE: 'Licensed Creative', UNRESOLVED: 'Unresolved',
};

suite('the editorial lifecycle', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/articleService');
  let actor: { id: string; roles: string[] };
  let publishable: Record<string, unknown>;
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
    const type = await prisma.articleType.findFirst({ where: { selectable: true }, select: { value: true } });
    const model = await prisma.article.findFirstOrThrow({
      where: { workflowStatus: 'PUBLISHED' },
      select: {
        heroImageUrl: true, imageCredit: true, imageAltText: true, imageSeoTitle: true,
        imageRightsStatus: true, disclosureType: true,
        seo: { select: { metaDescription: true } },
        blocks: { select: { data: true }, orderBy: { sortOrder: 'asc' } },
        sources: { select: { source: { select: { title: true, url: true, publisher: true } } } },
        disciplines: { select: { disciplineId: true } },
        hubs: { select: { hubId: true } },
      },
    });

    publishable = {
      title: 'Lifecycle Check - How to Watch NFR 2026',
      deck: 'A synthetic article used to verify the editorial workflow end to end.',
      excerpt: 'A synthetic article used to verify that draft, review, approval and publication all work.',
      blocks: model.blocks.map((b) => b.data),
      seoTitle: 'Lifecycle Check - How to Watch NFR 2026',
      metaDescription: model.seo?.metaDescription
        ?? 'A synthetic meta description long enough to satisfy the editor checks for this verification run.',
      imageSeoTitle: model.imageSeoTitle ?? 'NFR broadcast schedule',
      imageAltText: model.imageAltText ?? 'A rodeo competitor during a televised round',
      subcategoryId: null,
      articleType: type?.value ?? 'General Information',
      categoryName: cat.name,
      authorName: author?.name ?? '', authorRole: author?.role ?? '',
      reviewerName: 'Desk Editor',
      heroImage: model.heroImageUrl ?? '',
      imageCredit: model.imageCredit ?? 'Editorial Staff',
      imageCaption: 'Lifecycle verification',
      imageRightsStatus: RIGHTS_LABEL[model.imageRightsStatus] ?? 'Staff Photo',
      disclosure: model.disclosureType ?? 'editorial-independent',
      disclosureNote: '',
      tags: [], takeaways: [],
      sources: model.sources.map((s) => ({
        title: s.source.title, url: s.source.url ?? '', publisher: s.source.publisher, note: '',
      })),
      disciplineIds: model.disciplines.map((d) => d.disciplineId),
      hubIds: model.hubs.map((h) => h.hubId),
      eventIds: [], editionIds: [],
    };
  });

  afterAll(async () => {
    for (const id of made) {
      await prisma.seoFinding.deleteMany({ where: { articleId: id } }).catch(() => {});
      await prisma.articleBlock.deleteMany({ where: { articleId: id } });
      await prisma.articleSeo.deleteMany({ where: { articleId: id } });
      await prisma.articleSource.deleteMany({ where: { articleId: id } }).catch(() => {});
      await prisma.articleRevision.deleteMany({ where: { articleId: id } });
      await prisma.article.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('runs draft to in-review to approved to published, and the article goes live', async () => {
    const created = await svc.saveArticle(actor as never, {
      ...publishable, slug: `lifecycle-${Date.now()}`,
    } as never);
    made.push(created.id);
    expect(created.version).toBe(1);

    const review = await svc.transitionWorkflow(actor as never, created.id, 'IN_REVIEW' as never, created.version);
    expect(review.status).toBe('IN_REVIEW');

    const approved = await svc.transitionWorkflow(actor as never, created.id, 'APPROVED' as never, review.version);
    expect(approved.status).toBe('APPROVED');

    const published = await svc.transitionWorkflow(actor as never, created.id, 'PUBLISHED' as never, approved.version);
    expect(published.status).toBe('PUBLISHED');
    // `becamePublic` is what drives the public-page revalidation in the action.
    expect(published.becamePublic).toBe(true);

    const row = await prisma.article.findUniqueOrThrow({
      where: { id: created.id }, select: { workflowStatus: true, publishedAt: true },
    });
    expect(row.workflowStatus).toBe('PUBLISHED');
    expect(row.publishedAt, 'a published article must carry its publication time').toBeTruthy();
  });

  it('refuses a step out of order, and leaves the article where it was', async () => {
    const created = await svc.saveArticle(actor as never, {
      ...publishable, slug: `lifecycle-skip-${Date.now()}`,
    } as never);
    made.push(created.id);

    // DRAFT straight to PUBLISHED is not a transition the workflow offers.
    const err = await svc
      .transitionWorkflow(actor as never, created.id, 'PUBLISHED' as never, created.version)
      .then(() => null)
      .catch((e: Error & { code?: string }) => e);

    expect(err, 'skipping review must be refused').toBeTruthy();
    expect(err?.message).not.toContain('Unexpected server error');

    const row = await prisma.article.findUniqueOrThrow({
      where: { id: created.id }, select: { workflowStatus: true },
    });
    expect(row.workflowStatus, 'a refused transition must not move the article').toBe('DRAFT');
  });

  it('BLOCKS publication of an article that fails the gate, as a validation refusal', async () => {
    /*
      The gate is what keeps an incomplete article off the public site. What
      matters here is not only that it refuses, but that it refuses as a
      ServiceError — an unexpected throw reaches the editor as "Unexpected
      server error", which tells an author nothing about what to fix.
    */
    const created = await svc.saveArticle(actor as never, {
      ...publishable,
      slug: `lifecycle-blocked-${Date.now()}`,
      imageAltText: '',                 // an accessibility/compliance blocker
      imageRightsStatus: 'Unresolved',  // a rights blocker
    } as never);
    made.push(created.id);

    const review = await svc.transitionWorkflow(actor as never, created.id, 'IN_REVIEW' as never, created.version);
    const approved = await svc.transitionWorkflow(actor as never, created.id, 'APPROVED' as never, review.version);

    const err = await svc
      .transitionWorkflow(actor as never, created.id, 'PUBLISHED' as never, approved.version)
      .then(() => null)
      .catch((e: Error & { code?: string }) => e);

    expect(err, 'an incomplete article must not publish').toBeTruthy();
    expect(err?.code, 'the author must not be told the server broke').toBe('validation');
    expect(err?.message).not.toContain('Unexpected server error');

    const row = await prisma.article.findUniqueOrThrow({
      where: { id: created.id }, select: { workflowStatus: true },
    });
    expect(row.workflowStatus).toBe('APPROVED');
  });
});
