import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Legacy block compatibility through the COMPLETE server save path.
 *
 * THE DEFECT THESE TESTS LOCK DOWN. The rich-text adapter carries an unknown
 * block type through the editor untouched, but the server schema is a
 * discriminated union of the ten renderable types — so the save refused it:
 *
 *   blocks.1.type -> Invalid discriminator value. Expected 'heading' | ...
 *
 * An article containing a legacy or future block type could therefore be opened
 * and edited but never saved. The editor preserved it; the database would not
 * accept it. An earlier report claimed such a block "survives an edit
 * untouched", which was true of the adapter alone.
 *
 * The rule now: a block that fails strict validation is stored only when a
 * byte-identical payload is ALREADY STORED on that article. These tests prove
 * both halves — that untouched legacy content survives, and that this cannot be
 * used to introduce new unvalidated content.
 */

const { resolveBlocks, canonicalJson, decideBlock } =
  await import('../lib/content/articleBlockGrandfather');

const LEGACY = { type: 'legacyScoreboard', eventId: 'nfr-2026', rounds: [1, 2, 3], note: 'kept' };

// ---------------------------------------------------------------------------
// The grandfathering rule, in isolation
// ---------------------------------------------------------------------------

describe('the grandfathering rule', () => {
  it('accepts a known block and enforces its inline projection', () => {
    const r = resolveBlocks(
      [{ type: 'paragraph', text: 'ab', runs: [{ text: 'a', marks: ['bold'] }, { text: 'b' }] }],
      [],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.grandfathered).toBe(0);
    expect((r.value.blocks[0] as { runs?: unknown[] }).runs).toHaveLength(2);
  });

  it('REFUSES an unknown block type on a NEW article (nothing stored to vouch for it)', () => {
    const r = resolveBlocks([LEGACY], []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0].type).toBe('legacyScoreboard');
  });

  it('ACCEPTS an unknown block type that is byte-identical to stored content', () => {
    const r = resolveBlocks([LEGACY], [LEGACY]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.grandfathered).toBe(1);
    // Carried through exactly, not normalised.
    expect(r.value.blocks[0]).toEqual(LEGACY);
  });

  it('REFUSES a MODIFIED legacy block — nothing can vouch for the new shape', () => {
    const edited = { ...LEGACY, note: 'tampered' };
    const r = resolveBlocks([edited], [LEGACY]);
    expect(r.ok).toBe(false);
  });

  it('REFUSES a new unknown block even when a DIFFERENT legacy block is stored', () => {
    // The exact-payload rule must not become "this article may contain any
    // unknown type because it already contains one".
    const other = { type: 'legacyTicker', symbol: 'x' };
    const r = resolveBlocks([other], [LEGACY]);
    expect(r.ok).toBe(false);
  });

  it('cannot be bypassed by reordering object keys', () => {
    // Canonical comparison sorts keys, so a legitimate reorder still matches...
    const reordered = { note: 'kept', rounds: [1, 2, 3], eventId: 'nfr-2026', type: 'legacyScoreboard' };
    expect(canonicalJson(reordered)).toBe(canonicalJson(LEGACY));
    expect(resolveBlocks([reordered], [LEGACY]).ok).toBe(true);
    // ...while a changed VALUE still does not.
    const changed = { ...reordered, rounds: [1, 2, 4] };
    expect(resolveBlocks([changed], [LEGACY]).ok).toBe(false);
  });

  it('cannot be used to smuggle executable content', () => {
    for (const hostile of [
      { type: 'iframe', src: 'https://evil.example/x' },
      { type: 'script', text: 'alert(1)' },
      { type: 'html', html: '<img src=x onerror=alert(1)>' },
    ]) {
      expect(resolveBlocks([hostile], []).ok, hostile.type).toBe(false);
      // Not even alongside real stored legacy content.
      expect(resolveBlocks([hostile], [LEGACY]).ok, `${hostile.type} + stored legacy`).toBe(false);
    }
  });

  it('reports the position and type of every refused block', () => {
    const r = resolveBlocks(
      [{ type: 'paragraph', text: 'ok' }, LEGACY, { type: 'nope' }],
      [],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.index)).toEqual([1, 2]);
    expect(r.errors.map((e) => e.type)).toEqual(['legacyScoreboard', 'nope']);
  });

  it('a block that is not an object at all is refused', () => {
    for (const junk of [null, 42, 'text', [], {}]) {
      expect(decideBlock(junk, 0, new Set()).ok, String(junk)).toBe(false);
    }
  });

  it('preserves a known block\'s unknown KEYS while still validating it', () => {
    const r = resolveBlocks([{ type: 'paragraph', text: 'P', legacyField: 'keep' }], []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value.blocks[0] as Record<string, unknown>).legacyField).toBe('keep');
  });
});

// ---------------------------------------------------------------------------
// The full save path, against a real article
// ---------------------------------------------------------------------------

const dbUrl = process.env.DATABASE_URL ?? '';
const dbSuite = dbUrl ? describe : describe.skip;

dbSuite('the complete server save path', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/articleService');
  let actor: { id: string; roles: ['super_admin'] };
  let articleId = '';
  const madeUsers: string[] = [];
  const slug = `legacy-compat-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    if (!dbUrl) return;
    prisma = new PrismaClient();
    svc = await import('../lib/cms/articleService');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const u = await prisma.user.create({
      data: { email: `legacy-${Math.random().toString(36).slice(2, 8)}@example.com`, name: 'Legacy Tester', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    madeUsers.push(u.id);
    actor = { id: u.id, roles: ['super_admin'] };
  });

  afterAll(async () => {
    if (!dbUrl) return;
    const drop = async (what: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch { console.warn(`[legacy-compat] could not clean ${what}`); }
    };
    if (articleId) {
      await drop('blocks', () => prisma.articleBlock.deleteMany({ where: { articleId } }));
      await drop('seo', () => prisma.articleSeo.deleteMany({ where: { articleId } }));
      await drop('tags', () => prisma.articleTag.deleteMany({ where: { articleId } }));
      await drop('revisions', () => prisma.articleRevision.deleteMany({ where: { articleId } }));
      await drop('article', () => prisma.article.delete({ where: { id: articleId } }));
    }
    await drop('audit', () => prisma.auditLog.deleteMany({ where: { actorId: { in: madeUsers } } }));
    await drop('roles', () => prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } }));
    await drop('users', () => prisma.user.deleteMany({ where: { id: { in: madeUsers } } }));
    await prisma.$disconnect();
  });

  const input = (blocks: unknown[]) => ({
    id: articleId || undefined,
    slug,
    title: 'Legacy Compatibility Fixture',
    excerpt: 'A synthetic article used to verify that stored legacy blocks survive a save.',
    blocks,
    categoryName: 'NFR Competition',
    authorName: 'Legacy Tester',
    articleType: 'General Information',
  }) as never;

  it('creates an article with ordinary blocks', async () => {
    const r = await svc.saveArticle(actor as never, input([{ type: 'paragraph', text: 'First paragraph.' }]));
    articleId = r.id;
    const stored = await prisma.articleBlock.findMany({ where: { articleId }, select: { blockType: true } });
    expect(stored.map((b) => b.blockType)).toEqual(['paragraph']);
  });

  it('REFUSES to add a brand-new unknown block type', async () => {
    await expect(
      svc.saveArticle(actor as never, input([{ type: 'paragraph', text: 'First paragraph.' }, LEGACY])),
    ).rejects.toThrow(/legacyScoreboard/);
  });

  it('a legacy block already in the database CAN be saved again, unchanged', async () => {
    // Simulates content written before validation existed: inserted directly,
    // the way a legacy row actually got there.
    await prisma.articleBlock.create({
      data: { articleId, sortOrder: 1, blockType: LEGACY.type, data: LEGACY },
    });

    const body = [{ type: 'paragraph', text: 'First paragraph, now edited.' }, LEGACY];
    await svc.saveArticle(actor as never, input(body));

    const stored = await prisma.articleBlock.findMany({
      where: { articleId }, orderBy: { sortOrder: 'asc' }, select: { blockType: true, data: true },
    });
    expect(stored.map((b) => b.blockType)).toEqual(['paragraph', 'legacyScoreboard']);
    // Byte-for-byte, not normalised into something else.
    expect(stored[1].data).toEqual(LEGACY);
    // And the edit to the real paragraph took effect.
    expect((stored[0].data as { text: string }).text).toBe('First paragraph, now edited.');
  });

  it('but a MODIFIED version of that same legacy block is refused', async () => {
    await expect(
      svc.saveArticle(actor as never, input([
        { type: 'paragraph', text: 'First paragraph, now edited.' },
        { ...LEGACY, note: 'tampered' },
      ])),
    ).rejects.toThrow(/legacyScoreboard/);
  });

  it('removing a legacy block is allowed — preservation must not mean imprisonment', async () => {
    await svc.saveArticle(actor as never, input([{ type: 'paragraph', text: 'Only the paragraph remains.' }]));
    const stored = await prisma.articleBlock.findMany({ where: { articleId }, select: { blockType: true } });
    expect(stored.map((b) => b.blockType)).toEqual(['paragraph']);
  });
});
