import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * SEO link analysis through the REAL audit.
 *
 * The companion unit tests pin the inventory. This runs `runAudit` against the
 * isolated database with a seeded article whose body contains inline links, and
 * checks the findings that actually reach the SEO Intelligence screens — which
 * is the only way to know the orchestrator, the analyzer and the rule registry
 * agree with each other.
 *
 * It also covers the requirement that a link change is reflected after a
 * recalculation: the body is edited and the audit re-run.
 */

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

suite('link findings from a real audit', () => {
  let prisma: PrismaClient;
  let orch: typeof import('../lib/seo-intel/orchestrator');
  let articleId = '';
  let publishedTargetSlug = '';
  const madeUsers: string[] = [];
  const token = Math.random().toString(36).slice(2, 8);

  /** Body links: one internal (valid), one external, one empty-anchor internal. */
  const body = (targetSlug: string) => [
    {
      type: 'paragraph',
      text: 'Read the scoring guide and the partner site.',
      runs: [
        { text: 'Read the ' },
        { text: 'scoring guide', href: `/articles/${targetSlug}/` },
        { text: ' and the ' },
        { text: 'partner site', href: 'https://partner.example/report' },
        { text: '.' },
      ],
    },
    {
      type: 'list',
      items: ['click here', 'a described destination'],
      itemRuns: [
        [{ text: 'click here', href: `/articles/${targetSlug}/` }],
        [{ text: 'a described destination', href: '/competition/' }],
      ],
    },
  ];

  beforeAll(async () => {
    if (!dbUrl) return;
    prisma = new PrismaClient();
    orch = await import('../lib/seo-intel/orchestrator');
    await orch.syncSeoRules(prisma);

    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const u = await prisma.user.create({
      data: { email: `sla-${token}@example.com`, name: 'SLA Tester', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    madeUsers.push(u.id);

    // An existing PUBLISHED article is the valid internal target.
    const target = await prisma.article.findFirstOrThrow({
      where: { workflowStatus: 'PUBLISHED' },
      select: { slug: true, authorId: true, categoryId: true, createdById: true },
    });
    publishedTargetSlug = target.slug;

    const created = await prisma.article.create({
      data: {
        slug: `sla-subject-${token}`,
        title: `Link Analysis Subject ${token}`,
        excerpt: 'A synthetic article whose body links are analysed by the SEO audit.',
        articleType: 'General Information',
        workflowStatus: 'PUBLISHED',
        publishedAt: new Date(),
        authorId: target.authorId,
        categoryId: target.categoryId,
        createdById: target.createdById,
        blocks: {
          create: body(publishedTargetSlug).map((data, i) => ({
            sortOrder: i, blockType: data.type, data: data as never,
          })),
        },
      },
      select: { id: true },
    });
    articleId = created.id;
  });

  afterAll(async () => {
    if (!dbUrl) return;
    const drop = async (what: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch { console.warn(`[sla] could not clean ${what}`); }
    };
    if (articleId) {
      await drop('findings', () => prisma.seoFinding.deleteMany({ where: { articleId } }));
      await drop('blocks', () => prisma.articleBlock.deleteMany({ where: { articleId } }));
      await drop('article', () => prisma.article.delete({ where: { id: articleId } }));
    }
    await drop('audit', () => prisma.auditLog.deleteMany({ where: { actorId: { in: madeUsers } } }));
    await drop('roles', () => prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } }));
    await drop('users', () => prisma.user.deleteMany({ where: { id: { in: madeUsers } } }));
    await prisma.$disconnect();
  });

  /** Runs a single-article audit and returns this article's findings by code. */
  async function auditCodes(): Promise<Map<string, string[]>> {
    await orch.runAudit(prisma, { kind: 'article', articleId }, madeUsers[0]);
    const rows = await prisma.seoFinding.findMany({
      where: { articleId },
      select: { ruleCode: true, evidence: true },
    });
    const byCode = new Map<string, string[]>();
    for (const r of rows) {
      const list = byCode.get(r.ruleCode) ?? [];
      list.push(r.evidence ?? '');
      byCode.set(r.ruleCode, list);
    }
    return byCode;
  }

  it('reports the link inventory with internal, external and citation counts', async () => {
    const codes = await auditCodes();
    const inv = codes.get('LINK_INVENTORY');
    expect(inv, 'expected a LINK_INVENTORY finding').toBeTruthy();
    // 3 internal editorial links, 1 external, 0 citations.
    expect(inv![0]).toMatch(/3 internal/);
    expect(inv![0]).toMatch(/1 external/);
    expect(inv![0]).toMatch(/0 citation/);
    // Two of the three internal links share a target.
    expect(inv![0]).toMatch(/2 distinct internal target/);
  });

  it('says an external destination was NOT VERIFIED instead of implying it is fine', async () => {
    const codes = await auditCodes();
    const ext = codes.get('LINK_EXTERNAL_NOT_VERIFIED');
    expect(ext, 'an unverifiable external link must produce a finding, not silence').toBeTruthy();
    expect(ext!.join(' ')).toContain('partner.example');
    expect(ext!.join(' ')).toMatch(/no network requests/i);
  });

  it('flags the non-descriptive anchor and names the block it is in', async () => {
    const codes = await auditCodes();
    const nd = codes.get('LINK_ANCHOR_NONDESCRIPTIVE');
    expect(nd, 'expected "click here" to be flagged').toBeTruthy();
    expect(nd!.join(' ')).toContain('click here');
    // Provenance: the finding points at the list item, not just the article.
    expect(nd!.join(' ')).toMatch(/block 2 \(list\), item 1/);
  });

  it('does NOT report a valid internal link as broken', async () => {
    const codes = await auditCodes();
    const broken = (codes.get('LINK_BROKEN') ?? []).join(' ');
    expect(broken).not.toContain(publishedTargetSlug);
    expect(broken).not.toContain('/competition/');
  });

  it('reflects a link CHANGE after the audit is re-run', async () => {
    // Remove the external link and the bad anchor; keep one internal link.
    await prisma.articleBlock.deleteMany({ where: { articleId } });
    await prisma.articleBlock.create({
      data: {
        articleId, sortOrder: 0, blockType: 'paragraph',
        data: {
          type: 'paragraph',
          text: 'Only one internal link now.',
          runs: [
            { text: 'Only one ' },
            { text: 'internal link', href: `/articles/${publishedTargetSlug}/` },
            { text: ' now.' },
          ],
        } as never,
      },
    });

    const codes = await auditCodes();
    const inv = codes.get('LINK_INVENTORY');
    expect(inv![0]).toMatch(/1 internal/);
    expect(inv![0]).toMatch(/0 external/);
    // The findings for the removed links are no longer OPEN against this article.
    const open = await prisma.seoFinding.findMany({
      where: { articleId, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] } },
      select: { ruleCode: true },
    });
    const openCodes = open.map((o) => o.ruleCode);
    expect(openCodes).not.toContain('LINK_EXTERNAL_NOT_VERIFIED');
    expect(openCodes).not.toContain('LINK_ANCHOR_NONDESCRIPTIVE');
  });

  it('a draft internal target is reported as a link to unpublished content', async () => {
    const draft = await prisma.article.create({
      data: {
        slug: `sla-draft-${token}`,
        title: `SLA Draft ${token}`,
        excerpt: 'A draft used as an invalid internal link target.',
        articleType: 'General Information',
        workflowStatus: 'DRAFT',
        authorId: (await prisma.article.findFirstOrThrow({ where: { id: articleId }, select: { authorId: true } })).authorId,
        categoryId: (await prisma.article.findFirstOrThrow({ where: { id: articleId }, select: { categoryId: true } })).categoryId,
        createdById: madeUsers[0],
      },
      select: { id: true, slug: true },
    });
    try {
      await prisma.articleBlock.deleteMany({ where: { articleId } });
      await prisma.articleBlock.create({
        data: {
          articleId, sortOrder: 0, blockType: 'paragraph',
          data: {
            type: 'paragraph', text: 'A draft link.',
            runs: [{ text: 'A draft link', href: `/articles/${draft.slug}/` }],
          } as never,
        },
      });
      const codes = await auditCodes();
      const unpublished = (codes.get('LINK_TO_UNPUBLISHED') ?? []).join(' ');
      expect(unpublished, 'linking to a draft must be reported').toContain(draft.slug);
    } finally {
      await prisma.seoFinding.deleteMany({ where: { articleId: draft.id } });
      await prisma.article.delete({ where: { id: draft.id } });
    }
  });
});
