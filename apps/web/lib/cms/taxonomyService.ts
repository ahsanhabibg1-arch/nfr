import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { ACTIVE_ONLY, lifecycleWhere, type LifecycleFilter } from './lifecycle';
import { normalizeSlug, slugShapeError } from './slugRules';
import { RESERVED_SUBCATEGORY_SLUGS } from '../../config/routes';

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

// ---- Subcategories (Batch 04-B) ----

/**
 * Managed Subcategory taxonomy: a curated second level inside ONE primary
 * section. It lives here, beside Categories and Tags, because this service and
 * `taxonomy.manage` already own editorial organisation — a second taxonomy
 * administration system is exactly what the brief forbids.
 *
 * The database is the final integrity boundary (composite FK, three unique
 * constraints, `ON DELETE/UPDATE RESTRICT`). Every rule below is checked here
 * FIRST so an editor reads a sentence instead of a constraint name; the
 * constraint is what makes the rule true even if a future code path forgets it.
 */
export interface SubcategoryRow {
  id: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  name: string;
  slug: string;
  description: string | null;
  /** Landing-page content for the public `/<slug>/` archive. */
  summary: string | null;
  image: string | null;
  imageCredit: string | null;
  guide: string[];
  sortOrder: number;
  archivedAt: Date | null;
  articleCount: number;
}

export interface ListSubcategoriesParams {
  /** Restrict to one primary section. */
  categoryId?: string;
  /** Matches name or slug, case-insensitively. */
  q?: string;
  /** Default `active` — archived rows are hidden unless asked for. */
  lifecycle?: LifecycleFilter;
}

export async function listSubcategories(params: ListSubcategoriesParams = {}): Promise<SubcategoryRow[]> {
  const where: Prisma.SubcategoryWhereInput = { ...lifecycleWhere(params.lifecycle ?? 'active') };
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.subcategory.findMany({
    where,
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { category: { select: { slug: true, name: true } }, _count: { select: { articles: true } } },
  });
  return rows.map((s) => ({
    id: s.id, categoryId: s.categoryId, categorySlug: s.category.slug, categoryName: s.category.name,
    name: s.name, slug: s.slug, description: s.description, sortOrder: s.sortOrder,
    summary: s.summary, image: s.image, imageCredit: s.imageCredit,
    guide: Array.isArray(s.guide) ? (s.guide as unknown[]).filter((g): g is string => typeof g === 'string') : [],
    archivedAt: s.archivedAt, articleCount: s._count.articles,
  }));
}

const SubcategoryInput = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  /** Omitted on create → derived from the name. */
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(600).optional(),
  /**
   * Landing-page content. A subcategory archive is a public entity page, so it
   * carries the same editorial surface a discipline guide does.
   *
   * `guide` is an array of paragraphs rather than rich text: the archive is a
   * short orientation above a list of articles, not another article, and a
   * plain string array needs no sanitiser on the way out.
   */
  summary: z.string().max(600).optional(),
  image: z.string().max(600).optional(),
  imageCredit: z.string().max(300).optional(),
  guide: z.array(z.string().max(2000)).max(12).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type SubcategoryInput = z.input<typeof SubcategoryInput>;

/**
 * The landing-page columns, normalised the same way on create and update.
 *
 * Blank strings become NULL so "not filled in" is one value rather than two,
 * and an all-blank guide becomes NULL rather than an empty JSON array that
 * would read as "a guide exists and is empty".
 */
function landingFields(v: z.infer<typeof SubcategoryInput>) {
  const guide = v.guide?.map((p) => p.trim()).filter(Boolean) ?? [];
  return {
    summary: v.summary?.trim() || null,
    image: v.image?.trim() || null,
    imageCredit: v.imageCredit?.trim() || null,
    guide: guide.length ? guide : Prisma.DbNull,
  };
}

/** Shape + reserved-word rules, shared with the UI so both agree exactly. */
function resolveSlug(name: string, raw?: string): string {
  const slug = normalizeSlug(raw?.trim() ? raw : name);
  const shape = slugShapeError(slug);
  if (shape) throw new ServiceError('validation', shape);
  return slug;
}

/**
 * A subcategory slug becomes a depth-1 public path, so it shares a namespace
 * with every section and static page the site serves.
 *
 * Next.js would resolve the static route and leave the subcategory permanently
 * unreachable — no error, no warning, just a page nobody can ever open. Refusing
 * the name at write time is the only point where that is still visible.
 */
function assertSlugNotReserved(slug: string): void {
  if (!RESERVED_SUBCATEGORY_SLUGS.has(slug)) return;
  throw new ServiceError(
    'validation',
    `"${slug}" is already a page on this site, so a subcategory cannot use it as its URL — the subcategory would never be reachable. Choose a different slug, for example "nfr-${slug}".`,
  );
}

/**
 * Name is unique per section; SLUG is unique across the whole site.
 *
 * The two scopes differ because the flat public route `/<subcategory>/` is
 * identified by slug alone. Two sections may still both have a "Tickets" — but
 * not two `tickets` — so the slug clash is reported with the owning section
 * named, since that row is invisible from the section the operator is editing.
 */
async function assertUnique(categoryId: string, name: string, slug: string, excludeId?: string): Promise<void> {
  const exclude = excludeId ? { id: { not: excludeId } } : {};
  /**
   * NAME is checked first, and the order is deliberate.
   *
   * A slug is derived from the name, so a duplicate name inside one section
   * produces a duplicate slug as well and BOTH checks fail. Reporting the slug
   * first would answer a question the operator did not ask — they typed a name,
   * not a URL — and would send them to rename the slug when the real problem is
   * the name they just entered.
   */
  const nameClash = await prisma.subcategory.findFirst({
    where: { categoryId, name, ...exclude },
    select: { id: true },
  });
  if (nameClash) throw new ServiceError('conflict', `This section already has a subcategory named "${name}".`);

  const slugClash = await prisma.subcategory.findFirst({
    where: { slug, ...exclude },
    select: { category: { select: { name: true } } },
  });
  if (slugClash) {
    throw new ServiceError(
      'conflict',
      `The URL slug "${slug}" is already used by a subcategory in ${slugClash.category.name}. Subcategory URLs are site-wide, so each one must be unique across every section.`,
    );
  }
}

export async function createSubcategory(actor: Actor, raw: SubcategoryInput): Promise<{ id: string }> {
  requireTaxonomy(actor);
  const v = SubcategoryInput.parse(raw);
  const category = await prisma.category.findUnique({ where: { id: v.categoryId }, select: { id: true, name: true } });
  if (!category) throw new ServiceError('not_found', 'That primary section does not exist.');
  const slug = resolveSlug(v.name, v.slug);
  assertSlugNotReserved(slug);
  await assertUnique(v.categoryId, v.name, slug);
  const max = await prisma.subcategory.aggregate({ where: { categoryId: v.categoryId }, _max: { sortOrder: true } });
  const row = await prisma.subcategory.create({
    data: {
      categoryId: v.categoryId, name: v.name, slug,
      description: v.description?.trim() || null,
      ...landingFields(v),
      sortOrder: v.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
  await audit(actor.id, 'subcategory.create', 'subcategory', row.id, `${category.name} / ${v.name}`);
  return { id: row.id };
}

export async function updateSubcategory(actor: Actor, id: string, raw: SubcategoryInput): Promise<void> {
  requireTaxonomy(actor);
  const v = SubcategoryInput.parse(raw);
  const existing = await prisma.subcategory.findUnique({
    where: { id },
    select: { id: true, categoryId: true, _count: { select: { articles: true } } },
  });
  if (!existing) throw new ServiceError('not_found', 'Subcategory not found');

  /**
   * A parent change is blocked while articles are attached.
   *
   * Moving it would put those articles' subcategory in a section they do not
   * belong to. The database refuses it too (`ON UPDATE RESTRICT` on the
   * composite FK), which is what makes this safe rather than merely polite —
   * without that, Prisma's default CASCADE would have silently rewritten every
   * attached article's `categoryId`, relocating published articles as a side
   * effect of a taxonomy edit.
   */
  if (v.categoryId !== existing.categoryId && existing._count.articles > 0) {
    throw new ServiceError(
      'conflict',
      `Cannot move this subcategory to another section: ${existing._count.articles} article(s) use it. Detach them first, or create a new subcategory in the other section.`,
    );
  }
  if (v.categoryId !== existing.categoryId) {
    if (!(await prisma.category.findUnique({ where: { id: v.categoryId }, select: { id: true } }))) {
      throw new ServiceError('not_found', 'That primary section does not exist.');
    }
  }

  const slug = resolveSlug(v.name, v.slug);
  assertSlugNotReserved(slug);
  await assertUnique(v.categoryId, v.name, slug, id);
  await prisma.subcategory.update({
    where: { id },
    data: {
      categoryId: v.categoryId, name: v.name, slug,
      description: v.description?.trim() || null,
      ...landingFields(v),
      ...(v.sortOrder === undefined ? {} : { sortOrder: v.sortOrder }),
    },
  });
  await audit(actor.id, 'subcategory.update', 'subcategory', id, v.name);
}

/**
 * Archive / reactivate. Archiving keeps every existing article link — it only
 * withdraws the subcategory from NEW assignment, so a published article never
 * silently loses its classification.
 */
export async function setSubcategoryArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  requireTaxonomy(actor);
  const existing = await prisma.subcategory.findUnique({ where: { id }, select: { name: true } });
  if (!existing) throw new ServiceError('not_found', 'Subcategory not found');
  await prisma.subcategory.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await audit(actor.id, archived ? 'subcategory.archive' : 'subcategory.reactivate', 'subcategory', id, existing.name);
}

/**
 * Delete only when nothing references it — ANY article, in any workflow state,
 * blocks it. Mirrors `deleteCategory`, and the FK's `ON DELETE RESTRICT` is the
 * backstop if a future path skips this check.
 */
export async function deleteSubcategory(actor: Actor, id: string): Promise<void> {
  requireTaxonomy(actor);
  const row = await prisma.subcategory.findUnique({
    where: { id },
    select: { name: true, _count: { select: { articles: true } } },
  });
  if (!row) throw new ServiceError('not_found', 'Subcategory not found');
  if (row._count.articles > 0) {
    throw new ServiceError(
      'conflict',
      `Cannot delete: ${row._count.articles} article(s) use this subcategory. Archive it instead to keep those links intact.`,
    );
  }
  await prisma.subcategory.delete({ where: { id } });
  await audit(actor.id, 'subcategory.delete', 'subcategory', id, row.name);
}

/**
 * Active subcategories for one section — what the article editor offers.
 *
 * Archived rows are excluded so they cannot be newly assigned, while an article
 * that already points at an archived one keeps it (the editor adds the current
 * value separately, exactly as Batch 04-A does for a legacy article type).
 */
export async function listAssignableSubcategories(categoryId: string): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.subcategory.findMany({
    where: { categoryId, ...ACTIVE_ONLY },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
  return rows;
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
/**
 * Stage 03 (G-03) — rename a tag IN PLACE.
 *
 * A tag could only be created and deleted, so the only way to correct a name
 * was delete-and-recreate — which drops every `ArticleTag` link, silently
 * unlabelling articles. This updates the row, so the id and all associations
 * survive by construction: nothing touches `ArticleTag` at all.
 *
 * The SLUG moves with the name, because the slug is derived from it and no
 * public tag route exists for an old slug to keep serving. The id does NOT
 * move: it is the association key, and `createTag` derives it from the
 * original name, so a renamed tag keeps an id that reflects its first name.
 * That is deliberate — an id is an identity, not a label.
 */
export async function updateTag(actor: Actor, id: string, name: string): Promise<void> {
  requireTaxonomy(actor);
  const clean = z.string().trim().min(1).max(60).parse(name);
  const existing = await prisma.tag.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) throw new ServiceError('not_found', 'Tag not found');
  if (existing.name === clean) return; // nothing to do; not an error

  const slug = slugify(clean);
  if (!slug) throw new ServiceError('validation', 'That tag name has no usable characters.');
  // Uniqueness is checked here for a readable message; the unique index on
  // `slug` is what makes it true under a concurrent rename.
  const clash = await prisma.tag.findFirst({
    where: { id: { not: id }, OR: [{ name: clean }, { slug }] },
    select: { name: true },
  });
  if (clash) throw new ServiceError('conflict', `Another tag is already called "${clash.name}".`);

  try {
    await prisma.tag.update({ where: { id }, data: { name: clean, slug } });
  } catch (e) {
    // A concurrent rename to the same name loses the race on the unique index.
    if ((e as { code?: string }).code === 'P2002') {
      throw new ServiceError('conflict', `Another tag is already called "${clean}".`);
    }
    throw e;
  }
  await audit(actor.id, 'tag.update', 'tag', id, `${existing.name} → ${clean}`);
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
