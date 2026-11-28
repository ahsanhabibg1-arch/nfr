import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Actor } from '@/lib/cms/guard';

/**
 * Editing an author byline without destroying the parts the form didn't show.
 *
 * THE BUG THIS PINS. `AuthorRow` carried only name and role, so the admin
 * editor had nothing to prefill `bio` and `credentials` from and hardcoded
 * both to ''. Every byline therefore opened looking as though it had no bio,
 * and Save wrote those blanks through `bio: v.bio ?? null` over text that
 * exists nowhere else — a silent, unrecoverable erase, worst for the three
 * desk bylines whose bios run to ~1000 characters.
 *
 * Two independent things have to hold for that to stay fixed: the row must
 * carry what the form edits, and the write must distinguish "said nothing
 * about the bio" from "asked for the bio to be empty".
 */

const prisma = new PrismaClient();
const RID = `authedit-${Date.now()}`;

let hasDb = true;
let authorId = '';
let actor: Actor = { id: '', roles: ['super_admin'] };

const BIO = 'A desk byline long enough to matter: ' + 'editorial coverage of the rodeo season. '.repeat(12);
const CREDS = 'PRCA accredited; 12 seasons covering the NFR.';

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    hasDb = false;
    return;
  }

  const user = await prisma.user.create({
    data: { email: `${RID}@example.com`, name: 'Author Edit Fixture', status: 'ACTIVE' },
    select: { id: true },
  });
  actor = { id: user.id, roles: ['super_admin'] };

  const a = await prisma.author.create({
    data: { id: `author-${RID}`, slug: RID, name: `${RID} Desk`, role: 'Staff Desk', bio: BIO, credentials: CREDS },
    select: { id: true },
  });
  authorId = a.id;
});

afterAll(async () => {
  if (hasDb) {
    if (authorId) await prisma.author.deleteMany({ where: { id: authorId } });
    if (actor.id) {
      await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
      await prisma.user.deleteMany({ where: { id: actor.id } });
    }
  }
  await prisma.$disconnect();
});

describe('author byline — the row the editor reads', () => {
  it('carries the bio and credentials the form edits', async () => {
    if (!hasDb) return;
    const { listAuthors } = await import('@/lib/cms/taxonomyService');
    const row = (await listAuthors()).find((a) => a.id === authorId)!;
    // Without these the editor cannot prefill, and a blank field is
    // indistinguishable from a field the operator cleared on purpose.
    expect(row.bio).toBe(BIO);
    expect(row.credentials).toBe(CREDS);
  });
});

describe('author byline — the write path', () => {
  it('a rename that says nothing about the bio KEEPS the bio', async () => {
    if (!hasDb) return;
    const { updateAuthor, listAuthors } = await import('@/lib/cms/taxonomyService');

    await updateAuthor(actor, authorId, { name: `${RID} Renamed`, role: 'Senior Desk' });

    const row = (await listAuthors()).find((a) => a.id === authorId)!;
    expect(row.name).toBe(`${RID} Renamed`);
    expect(row.role).toBe('Senior Desk');
    expect(row.slug).toBe(RID);
    expect(row.bio).toBe(BIO);
    expect(row.credentials).toBe(CREDS);
  });

  it('an EMPTY string still clears the field, so an operator can remove one', async () => {
    if (!hasDb) return;
    const { updateAuthor, listAuthors } = await import('@/lib/cms/taxonomyService');

    await updateAuthor(actor, authorId, { name: `${RID} Renamed`, role: 'Senior Desk', bio: '', credentials: '' });

    const row = (await listAuthors()).find((a) => a.id === authorId)!;
    // Stored as NULL rather than '' so the public byline can test one thing.
    expect(row.bio).toBeNull();
    expect(row.credentials).toBeNull();
  });

  it('whitespace is not a bio', async () => {
    if (!hasDb) return;
    const { updateAuthor, listAuthors } = await import('@/lib/cms/taxonomyService');

    await updateAuthor(actor, authorId, { name: `${RID} Renamed`, role: 'Senior Desk', bio: '   \n  ' });

    const row = (await listAuthors()).find((a) => a.id === authorId)!;
    expect(row.bio).toBeNull();
  });

  it('text replaces what was there', async () => {
    if (!hasDb) return;
    const { updateAuthor, listAuthors } = await import('@/lib/cms/taxonomyService');

    await updateAuthor(actor, authorId, { name: `${RID} Renamed`, role: 'Senior Desk', bio: 'Replaced bio.' });

    const row = (await listAuthors()).find((a) => a.id === authorId)!;
    expect(row.bio).toBe('Replaced bio.');
  });

  it('saving an article with a renamed byline keeps the selected author ID', async () => {
    if (!hasDb) return;
    const { saveArticle } = await import('@/lib/cms/articleService');
    const name = `${RID} Renamed`;
    const slug = `${RID}-article`;
    try {
      const saved = await saveArticle(actor, {
        slug,
        title: 'Renamed byline fixture',
        excerpt: 'A draft article assigned to the renamed editorial byline.',
        categoryName: 'NFR Competition',
        authorId,
        authorName: name,
        authorRole: 'Stale role from editor',
      });
      const article = await prisma.article.findUniqueOrThrow({ where: { id: saved.id }, include: { author: true } });
      expect(article.authorId).toBe(authorId);
      expect(article.author).toMatchObject({ name, slug: RID, role: 'Senior Desk' });
      expect(await prisma.author.count({ where: { name } })).toBe(1);
    } finally {
      await prisma.article.deleteMany({ where: { slug } });
    }
  });
});

describe('author byline — the editor', () => {
  const page = () => readFileSync(resolve(process.cwd(), 'views/admin/AdminEditorialOrgPage.tsx'), 'utf8');

  it('prefills every field from the row instead of hardcoding blanks', () => {
    const src = page();
    expect(src).toMatch(/bio:\s*a\?\.bio\s*\?\?\s*''/);
    expect(src).toMatch(/credentials:\s*a\?\.credentials\s*\?\?\s*''/);
    // The exact shape of the original defect: literal blanks in `openAuth`.
    expect(src).not.toMatch(/setAuthForm\(\{[^}]*bio:\s*''\s*,\s*credentials:\s*''\s*\}\)/);
  });

  it('shows the frozen identifier, which a rename does not move', () => {
    expect(page()).toMatch(/\{a\.slug\}/);
  });
});

describe('deleting an author byline', () => {
  it('requires a replacement for linked articles and preserves the articles on reassignment', async () => {
    if (!hasDb) return;
    const { deleteAuthor } = await import('@/lib/cms/taxonomyService');
    const { saveArticle } = await import('@/lib/cms/articleService');
    const source = await prisma.author.create({
      data: { slug: `${RID}-delete`, name: 'Byline to delete', role: 'Desk' },
    });
    const slug = `${RID}-reassign`;
    try {
      const saved = await saveArticle(actor, {
        slug,
        title: 'Article with a byline to reassign',
        excerpt: 'The article should survive byline deletion.',
        categoryName: 'NFR Competition',
        authorId: source.id,
        authorName: source.name,
      });

      await expect(deleteAuthor(actor, source.id)).rejects.toMatchObject({ code: 'conflict' });
      await expect(deleteAuthor(actor, source.id, source.id)).rejects.toMatchObject({ code: 'validation' });
      await expect(deleteAuthor(actor, source.id, `${RID}-missing`)).rejects.toMatchObject({ code: 'not_found' });
      expect(await prisma.article.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({
        authorId: source.id,
        version: saved.version,
      });

      await deleteAuthor(actor, source.id, authorId);
      expect(await prisma.author.findUnique({ where: { id: source.id } })).toBeNull();
      expect(await prisma.article.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({
        authorId,
        slug,
        version: saved.version + 1,
      });
    } finally {
      await prisma.article.deleteMany({ where: { slug } });
      await prisma.author.deleteMany({ where: { id: source.id } });
    }
  });
});
