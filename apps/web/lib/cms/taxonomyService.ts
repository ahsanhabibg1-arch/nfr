import 'server-only';
import { z } from 'zod';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';

/**
 * Editorial Organization: categories, tags, authors (Batch 04 §8/§9).
 * `taxonomy.manage` for categories/tags; `author.manage` for authors.
 * Foundational seeded categories (id `cat-*`) cannot be deleted. The five
 * primary-section slugs/routes are never changed here.
 */
const requireTaxonomy = (a: Actor) => { if (!roleHasPermission(a.roles, 'taxonomy.manage')) throw new ServiceError('forbidden', 'Not permitted to manage taxonomy'); };
const requireAuthor = (a: Actor) => { if (!roleHasPermission(a.roles, 'author.manage')) throw new ServiceError('forbidden', 'Not permitted to manage authors'); };
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ---- Categories ----
export interface CategoryRow { id: string; slug: string; name: string; description: string | null; sortOrder: number; articleCount: number; protected: boolean; }
export async function listCategories(): Promise<CategoryRow[]> {
  const rows = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { articles: true } } } });
  return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, sortOrder: c.sortOrder, articleCount: c._count.articles, protected: c.id.startsWith('cat-') }));
}
const CategoryInput = z.object({ name: z.string().min(1).max(120), description: z.string().max(600).optional(), sortOrder: z.number().int().optional() });
export type CategoryInput = z.input<typeof CategoryInput>;
export async function createCategory(actor: Actor, raw: CategoryInput): Promise<{ id: string }> {
  requireTaxonomy(actor);
  const v = CategoryInput.parse(raw);
  const slug = slugify(v.name);
  if (await prisma.category.findFirst({ where: { OR: [{ slug }, { name: v.name }] } })) throw new ServiceError('conflict', 'A category with that name/slug already exists.');
  const c = await prisma.category.create({ data: { slug, name: v.name, description: v.description ?? null, sortOrder: v.sortOrder ?? 99 } });
  await audit(actor.id, 'category.create', 'category', c.id, v.name);
  return { id: c.id };
}
export async function updateCategory(actor: Actor, id: string, raw: CategoryInput): Promise<void> {
  requireTaxonomy(actor);
  const v = CategoryInput.parse(raw);
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('not_found', 'Category not found');
  // Protected (seeded) categories keep their canonical slug; only name/description/order change.
  await prisma.category.update({ where: { id }, data: { name: v.name, description: v.description ?? null, sortOrder: v.sortOrder ?? existing.sortOrder } });
  await audit(actor.id, 'category.update', 'category', id, v.name);
}
export async function deleteCategory(actor: Actor, id: string): Promise<void> {
  requireTaxonomy(actor);
  const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { articles: true } } } });
  if (!c) throw new ServiceError('not_found', 'Category not found');
  if (c.id.startsWith('cat-')) throw new ServiceError('forbidden', 'Foundational primary-section categories cannot be deleted.');
  if (c._count.articles > 0) throw new ServiceError('conflict', `Cannot delete: ${c._count.articles} article(s) use this category.`);
  await prisma.category.delete({ where: { id } });
  // Batch 11: remove polymorphic SEO/FAQ rows for this category (orphan cleanup).
  const { deleteEntitySeoForEntity } = await import('./entitySeoService');
  const { deleteFaqsForEntity } = await import('./faqService');
  await deleteEntitySeoForEntity('CATEGORY', id);
  await deleteFaqsForEntity('CATEGORY', id);
  await audit(actor.id, 'category.delete', 'category', id, c.name);
}

// ---- Tags ----
export interface TagRow { id: string; slug: string; name: string; articleCount: number; }
export async function listTags(q?: string): Promise<TagRow[]> {
  const rows = await prisma.tag.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined, orderBy: { name: 'asc' }, include: { _count: { select: { articles: true } } }, take: 300 });
  return rows.map((t) => ({ id: t.id, slug: t.slug, name: t.name, articleCount: t._count.articles }));
}
export async function createTag(actor: Actor, name: string): Promise<{ id: string }> {
  requireTaxonomy(actor);
  const clean = z.string().min(1).max(60).parse(name);
  const id = `tag-${slugify(clean)}`;
  if (await prisma.tag.findUnique({ where: { id } })) throw new ServiceError('conflict', 'That tag already exists.');
  await prisma.tag.create({ data: { id, slug: slugify(clean), name: clean } });
  await audit(actor.id, 'tag.create', 'tag', id, clean);
  return { id };
}
export async function deleteTag(actor: Actor, id: string): Promise<void> {
  requireTaxonomy(actor);
  const t = await prisma.tag.findUnique({ where: { id } });
  if (!t) throw new ServiceError('not_found', 'Tag not found');
  await prisma.tag.delete({ where: { id } }); // ArticleTag links cascade (associations only)
  await audit(actor.id, 'tag.delete', 'tag', id, t.name);
}

// ---- Authors (public byline identities, distinct from auth Users — §9) ----
export interface AuthorRow { id: string; slug: string; name: string; role: string; articleCount: number; }
export async function listAuthors(): Promise<AuthorRow[]> {
  const rows = await prisma.author.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { articles: true } } } });
  return rows.map((a) => ({ id: a.id, slug: a.slug, name: a.name, role: a.role, articleCount: a._count.articles }));
}
const AuthorInput = z.object({ name: z.string().min(1).max(120), role: z.string().min(1).max(120), bio: z.string().max(1000).optional(), credentials: z.string().max(300).optional() });
export type AuthorInput = z.input<typeof AuthorInput>;
export async function createAuthor(actor: Actor, raw: AuthorInput): Promise<{ id: string }> {
  requireAuthor(actor);
  const v = AuthorInput.parse(raw);
  const id = `author-${slugify(v.name)}`;
  if (await prisma.author.findUnique({ where: { id } })) throw new ServiceError('conflict', 'An author byline with that name already exists.');
  await prisma.author.create({ data: { id, slug: slugify(v.name), name: v.name, role: v.role, bio: v.bio ?? null, credentials: v.credentials ?? null } });
  await audit(actor.id, 'author.create', 'author', id, v.name);
  return { id };
}
export async function updateAuthor(actor: Actor, id: string, raw: AuthorInput): Promise<void> {
  requireAuthor(actor);
  const v = AuthorInput.parse(raw);
  if (!(await prisma.author.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Author not found');
  await prisma.author.update({ where: { id }, data: { name: v.name, role: v.role, bio: v.bio ?? null, credentials: v.credentials ?? null } });
  await audit(actor.id, 'author.update', 'author', id, v.name);
}
export async function deleteAuthor(actor: Actor, id: string): Promise<void> {
  requireAuthor(actor);
  const a = await prisma.author.findUnique({ where: { id }, include: { _count: { select: { articles: true } } } });
  if (!a) throw new ServiceError('not_found', 'Author not found');
  if (a._count.articles > 0) throw new ServiceError('conflict', `Cannot delete: this byline is used by ${a._count.articles} article(s).`);
  await prisma.author.delete({ where: { id } });
  await audit(actor.id, 'author.delete', 'author', id, a.name);
}
