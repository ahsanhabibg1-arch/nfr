import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as Tax from '../lib/cms/taxonomyService';
import type * as Art from '../lib/cms/articleService';

/**
 * Batch 16 — database-backed author bylines.
 *   1. Source guard: the editor uses a server-provided author list (no Phase-0 mock map),
 *      and both article pages supply it.
 *   2. Integration: a byline resolves to a real Author; deleting an in-use byline is blocked
 *      (never orphans an article); an authored article links the correct Author id.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(path.resolve(here, p), 'utf8');

describe('Batch 16 — editor uses database-backed authors (source guard)', () => {
  const editor = read('../views/admin/AdminArticleEditorShell.tsx');
  it('the mock AUTHORS map is no longer imported or used', () => {
    expect(editor).not.toContain("from '../../data/mockEditorialData'");
    expect(editor).not.toContain('AUTHORS');
  });
  it('the dropdown is driven by the server-provided authors prop', () => {
    expect(editor).toContain('authors?: AuthorOption[]');
    expect(editor).toContain('authors.map((a) =>');
    expect(editor).toContain('legacyBylineName'); // legacy byline preserved, not reassigned
  });
  it('both article pages load real authors via listAuthors', () => {
    expect(read('../app/admin/(dashboard)/articles/new/page.tsx')).toContain('listAuthors');
    expect(read('../app/admin/(dashboard)/articles/[id]/edit/page.tsx')).toContain('listAuthors');
  });
});

let available = false;
let prisma: PrismaClient; let tax: typeof Tax; let art: typeof Art;
if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    tax = await import('../lib/cms/taxonomyService');
    art = await import('../lib/cms/articleService');
    await (await import('../lib/auth/roleSync')).syncRolesAndPermissions(prisma);
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 16 — author byline integration', () => {
  const tag = rid(); const userIds: string[] = [];
  let admin: Actor; let authorId = ''; let articleId = '';
  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b16-${tag}-${rid()}@example.com`, name: 'B16', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } }); userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }
  beforeAll(async () => { admin = await makeUser('administrator'); });
  afterAll(async () => {
    if (!available) return;
    if (articleId) await prisma.article.delete({ where: { id: articleId } }).catch(() => {});
    if (authorId) await prisma.author.delete({ where: { id: authorId } }).catch(() => {});
    for (const id of userIds) { await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {}); await prisma.user.delete({ where: { id } }).catch(() => {}); }
  });

  it('creates a database author that appears in the editor list', async () => {
    const c = await tax.createAuthor(admin, { name: `B16 Writer ${tag}`, role: 'Staff Writer' }); authorId = c.id;
    const list = await tax.listAuthors();
    expect(list.some((a) => a.id === authorId && a.name === `B16 Writer ${tag}`)).toBe(true);
  });

  it('an article byline resolves to the matching Author (no duplicate id)', async () => {
    const cat = await prisma.category.findFirstOrThrow({ select: { name: true } });
    const res = await art.saveArticle(admin, { title: `B16 Byline ${tag}`, slug: `b16-byline-${tag}`, excerpt: 'An excerpt for the byline integration test that is long enough.', blocks: [{ type: 'paragraph', text: 'Body.' }], categoryName: cat.name, authorName: `B16 Writer ${tag}`, authorRole: 'Staff Writer', imageRightsStatus: 'Staff Photo', disclosure: 'editorial-independent' } as Art.ArticleInput);
    articleId = res.id;
    const row = await prisma.article.findUniqueOrThrow({ where: { id: articleId }, select: { authorId: true } });
    expect(row.authorId).toBe(authorId); // resolved to the existing author, not a new duplicate
  });

  it('deleting an in-use byline is blocked (never orphans an article)', async () => {
    await expect(tax.deleteAuthor(admin, authorId)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('author management requires author.manage (author role is rejected)', async () => {
    const author = await makeUser('author');
    await expect(tax.createAuthor(author, { name: `Nope ${tag}`, role: 'x' })).rejects.toMatchObject({ code: 'forbidden' });
  });
});
