import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { ActorContext } from '../lib/cms/articleService';

/**
 * Composer recovery: unsaved work survives a closed tab.
 *
 * WHAT HAS TO BE TRUE, AND WHY EACH MATTERS.
 *
 *   PRIVACY     A snapshot is unfinished work. One editor must never read,
 *               restore or discard another's — not even an administrator,
 *               because the recovery list is a person's own desk.
 *   ONE ROW     Autosave runs every few seconds; if each wrote a row the table
 *               would grow with keystrokes instead of with open composers.
 *   FIDELITY    What comes back must be what was typed, including the body
 *               blocks — a recovery that silently loses formatting is worse
 *               than none, because the author believes they have it back.
 *   NO LEAKAGE  A snapshot must never become an article by itself. Nothing in
 *               the recovery path may create, publish or modify editorial
 *               content.
 *   CLEAN-UP    Once the work IS an article, the copy has to go, or recovery
 *               would offer to restore something older than what is stored.
 */

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

suite('composer recovery snapshots', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/draftRecoveryService');
  let alice: ActorContext;
  let bob: ActorContext;
  const madeUsers: string[] = [];
  const token = Math.random().toString(36).slice(2, 8);

  const payload = (title: string) => ({
    title,
    slug: 'a-draft-in-progress',
    excerpt: '',
    blocks: [
      { type: 'paragraph', text: 'An opening paragraph with a bold word.', runs: [
        { text: 'An opening paragraph with a ' }, { text: 'bold', marks: ['bold'] }, { text: ' word.' },
      ] },
      { type: 'list', items: ['one', 'two', 'three'] },
      { type: 'quote', quote: 'Five words in this quote', attribution: '' },
    ],
    tags: ['nfr'],
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    svc = await import('../lib/cms/draftRecoveryService');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    for (const who of ['alice', 'bob']) {
      const u = await prisma.user.create({
        data: { email: `recovery-${who}-${token}@example.com`, name: who, status: 'ACTIVE' },
      });
      await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
      madeUsers.push(u.id);
    }
    alice = { id: madeUsers[0], roles: ['super_admin'] };
    bob = { id: madeUsers[1], roles: ['super_admin'] };
  });

  afterAll(async () => {
    await prisma.articleDraftSnapshot.deleteMany({ where: { userId: { in: madeUsers } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: madeUsers } } });
    await prisma.$disconnect();
  });

  it('keeps ONE row per composer session, however often it autosaves', async () => {
    const key = `new:${token}onerow`;
    for (let i = 0; i < 5; i += 1) {
      await svc.saveDraftSnapshot(alice, {
        composerKey: key, title: `Draft revision ${i}`, slug: 's', payload: payload(`Draft revision ${i}`),
      });
    }
    const rows = await prisma.articleDraftSnapshot.findMany({ where: { userId: alice.id, composerKey: key } });
    expect(rows, 'autosave must upsert, not append').toHaveLength(1);
    // And it holds the LATEST contents.
    expect(rows[0].title).toBe('Draft revision 4');
  });

  it('returns the body exactly as it was typed, formatting included', async () => {
    const key = `new:${token}fidelity`;
    const original = payload('Fidelity check');
    await svc.saveDraftSnapshot(alice, { composerKey: key, title: 'Fidelity check', slug: 's', payload: original });
    const list = await svc.listDraftSnapshots(alice);
    const found = list.find((d) => d.composerKey === key);
    const restored = await svc.getDraftSnapshot(alice, found!.id);
    expect(restored.payload).toEqual(original);
  });

  it('counts the words at stake, so the list says how much work it is', async () => {
    const key = `new:${token}words`;
    await svc.saveDraftSnapshot(alice, { composerKey: key, title: 'Word count', slug: 's', payload: payload('Word count') });
    const found = (await svc.listDraftSnapshots(alice)).find((d) => d.composerKey === key);
    // 7 in the paragraph, 3 list items, 5 in the quote.
    expect(found!.wordCount).toBe(7 + 3 + 5);
  });

  it('NEVER shows one editor the work of another', async () => {
    const aliceKey = `new:${token}private`;
    await svc.saveDraftSnapshot(alice, {
      composerKey: aliceKey, title: 'Alice is still writing this', slug: 's', payload: payload('Alice'),
    });
    const aliceRow = (await svc.listDraftSnapshots(alice)).find((d) => d.composerKey === aliceKey)!;

    // Bob cannot see it in his list...
    const bobList = await svc.listDraftSnapshots(bob);
    expect(bobList.map((d) => d.id)).not.toContain(aliceRow.id);

    // ...cannot read it by id, even knowing the id...
    await expect(svc.getDraftSnapshot(bob, aliceRow.id)).rejects.toMatchObject({ code: 'not_found' });

    // ...and cannot throw it away.
    await expect(svc.discardDraftSnapshot(bob, aliceRow.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await prisma.articleDraftSnapshot.count({ where: { id: aliceRow.id } })).toBe(1);
  });

  it('refuses a composer key that is not one of the two shapes it issues', async () => {
    // The key is half of a unique constraint and arrives from the client, so a
    // crafted one must not be able to collide with another session's row.
    for (const bad of ['', 'article', 'nope:123', 'new:' + 'x'.repeat(80), 'new:bad key', '../../etc']) {
      await expect(
        svc.saveDraftSnapshot(alice, { composerKey: bad, title: 't', slug: 's', payload: {} }),
        bad,
      ).rejects.toMatchObject({ code: 'validation' });
    }
  });

  it('refuses a snapshot too large to be editor state', async () => {
    const huge = { blocks: [{ type: 'paragraph', text: 'x'.repeat(svc.MAX_SNAPSHOT_BYTES + 100) }] };
    await expect(
      svc.saveDraftSnapshot(alice, { composerKey: `new:${token}huge`, title: 't', slug: 's', payload: huge }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('discards the copy for a composer session once the work is saved', async () => {
    const key = `new:${token}saved`;
    await svc.saveDraftSnapshot(alice, { composerKey: key, title: 'About to be saved', slug: 's', payload: payload('x') });
    expect(await prisma.articleDraftSnapshot.count({ where: { userId: alice.id, composerKey: key } })).toBe(1);

    await svc.discardComposerSnapshot(alice, key);
    expect(
      await prisma.articleDraftSnapshot.count({ where: { userId: alice.id, composerKey: key } }),
      'a saved article must not leave a recovery copy offering an older version',
    ).toBe(0);
  });

  it('creates NO article, revision or public content', async () => {
    /*
      The whole design rests on this: a snapshot is editor state. If recovery
      ever started writing to Article, a half-written composer would appear in
      the directory, the sitemap and the SEO engine.
    */
    const before = {
      articles: await prisma.article.count(),
      revisions: await prisma.articleRevision.count(),
      blocks: await prisma.articleBlock.count(),
    };
    await svc.saveDraftSnapshot(alice, {
      composerKey: `new:${token}isolated`, title: 'Isolated', slug: 's', payload: payload('Isolated'),
    });
    expect({
      articles: await prisma.article.count(),
      revisions: await prisma.articleRevision.count(),
      blocks: await prisma.articleBlock.count(),
    }).toEqual(before);
  });

  it('counts only the caller\'s own drafts for the tab badge', async () => {
    const mine = await svc.countDraftSnapshots(alice);
    const theirs = await svc.countDraftSnapshots(bob);
    expect(mine).toBe(await prisma.articleDraftSnapshot.count({ where: { userId: alice.id } }));
    expect(theirs).toBe(await prisma.articleDraftSnapshot.count({ where: { userId: bob.id } }));
  });

  it('refuses an editor with no composing permission', async () => {
    // `reader` has no composing permission at all.
    const outsider: ActorContext = { id: alice.id, roles: ['reader'] };
    await expect(
      svc.saveDraftSnapshot(outsider, { composerKey: `new:${token}denied`, title: 't', slug: 's', payload: {} }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.listDraftSnapshots(outsider)).rejects.toMatchObject({ code: 'forbidden' });
    expect(await svc.countDraftSnapshots(outsider), 'the badge must not leak a count either').toBe(0);
  });
});
