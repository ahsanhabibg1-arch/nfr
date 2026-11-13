import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { lifecycleWhere, type LifecycleFilter } from './lifecycle';
import {
  ARTICLE_SCHEMA_TYPES,
  articleTypeValueError,
  isArticleSchemaTypeName,
  normalizeArticleTypeValue,
  type ArticleSchemaTypeName,
} from '../content/articleTypeShape';
import { invalidateArticleTypes } from './articleTypeRegistry';
import { ARTICLE_TYPE_TOMBSTONE_KIND } from './articleTypeBootstrap';

/**
 * Batch 04-E — managed Article Type administration.
 *
 * THREE PERMISSIONS, NOT ONE. An Article Type carries two settings that change
 * what the public site asserts about already-published work, so they are gated
 * separately from the editorial metadata:
 *
 *   `articletype.manage`  create, label, description, order, activate, archive, delete
 *                                                        (Administrator, Super Admin)
 *   `articletype.seo`     evergreen eligibility          (SEO Manager, Super Admin)
 *   `system.config`       Article vs NewsArticle          (Super Admin only)
 *
 * Batch 04-E.1 moved evergreen eligibility off the shared `seo.config` — which
 * Administrator also holds site-wide — and onto a permission of its own, so the
 * SEO owner alone decides what the evergreen surface may show. The three sets
 * are independent: none of them implies another.
 *
 * Every check is here, on the server, in the service — not in the action and
 * not in the component. The action re-checks before calling, and the UI hides
 * controls, but neither is the boundary.
 *
 * A NEW TYPE STARTS AT THE SAFEST SETTINGS: not evergreen, classified
 * `Article`. Becoming evergreen or `NewsArticle` is a separate act requiring
 * its own permission, so an Administrator cannot mint a `NewsArticle` type in
 * one step.
 */

const requireManage = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'articletype.manage')) {
    throw new ServiceError('forbidden', 'Not permitted to manage article types');
  }
};
const requireSeo = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'articletype.seo')) {
    throw new ServiceError(
      'forbidden',
      'Changing article type evergreen eligibility is restricted to SEO Manager and Super Admin',
    );
  }
};
const requireSystem = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'system.config')) {
    throw new ServiceError(
      'forbidden',
      'Changing the Article / NewsArticle classification is restricted to Super Admin',
    );
  }
};

const dbSchema = (s: ArticleSchemaTypeName): 'ARTICLE' | 'NEWS_ARTICLE' =>
  s === 'NewsArticle' ? 'NEWS_ARTICLE' : 'ARTICLE';
const appSchema = (s: string): ArticleSchemaTypeName => (s === 'NEWS_ARTICLE' ? 'NewsArticle' : 'Article');

export interface ArticleTypeRow {
  id: string;
  value: string;
  label: string;
  description: string | null;
  sortOrder: number;
  selectable: boolean;
  evergreen: boolean;
  schemaType: ArticleSchemaTypeName;
  archivedAt: Date | null;
  /** Articles storing this exact value, in any workflow state. */
  articleCount: number;
  updatedAt: Date;
}

export interface ListArticleTypesParams {
  /** Matches value or label, case-insensitively. */
  q?: string;
  /** Default `all` for the admin list — lifecycle is what the admin is managing. */
  lifecycle?: LifecycleFilter;
  /** `true` → only selectable, `false` → only non-selectable. */
  selectable?: boolean;
}

/**
 * Usage counts for every stored value, in ONE grouped query.
 *
 * There is no foreign key (see the schema comment), so the count is a GROUP BY
 * over `Article.articleType`. Doing it per row would be 23 queries for one
 * page; doing it once is one. The map is keyed by the exact stored string.
 */
export async function countArticlesByType(): Promise<Map<string, number>> {
  const rows = await prisma.article.groupBy({ by: ['articleType'], _count: { _all: true } });
  return new Map(rows.map((r) => [r.articleType, r._count._all]));
}

export async function listArticleTypes(params: ListArticleTypesParams = {}): Promise<ArticleTypeRow[]> {
  const where: Prisma.ArticleTypeWhereInput = { ...lifecycleWhere(params.lifecycle ?? 'all') };
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { value: { contains: q, mode: 'insensitive' } },
      { label: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (params.selectable !== undefined) where.selectable = params.selectable;

  const [rows, counts] = await Promise.all([
    prisma.articleType.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
    countArticlesByType(),
  ]);
  return rows.map((r) => ({
    id: r.id,
    value: r.value,
    label: r.label,
    description: r.description,
    sortOrder: r.sortOrder,
    selectable: r.selectable,
    evergreen: r.evergreen,
    schemaType: appSchema(r.schemaType),
    archivedAt: r.archivedAt,
    articleCount: counts.get(r.value) ?? 0,
    updatedAt: r.updatedAt,
  }));
}

/** Recent audit entries for the Article Type entity, newest first. */
export async function listArticleTypeAudit(limit = 25): Promise<
  { at: Date; action: string; entityId: string | null; detail: string | null; actorName: string | null }[]
> {
  const rows = await prisma.auditLog.findMany({
    where: { entityType: 'articleType' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { actor: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    at: r.createdAt,
    action: r.action,
    entityId: r.entityId,
    detail: r.detail,
    actorName: r.actor?.name ?? r.actor?.email ?? null,
  }));
}

// ---- create ---------------------------------------------------------------

const CreateInput = z.object({
  /** Becomes the permanent stored identity. */
  value: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().max(600).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  selectable: z.boolean().optional(),
});
export type CreateArticleTypeInput = z.input<typeof CreateInput>;

/**
 * Refuses a value that already exists, and a value that differs from an
 * existing one only by letter case.
 *
 * The case rule is enforced HERE and not by a database constraint, because the
 * column cannot carry one: the compatibility vocabulary contains both `News`
 * and the legacy `news`, two distinct stored strings that real articles hold.
 * A unique index on `lower(value)` would have made one of them impossible to
 * represent. The bootstrap writes those exact values directly and so bypasses
 * this check by design; everything an administrator can do goes through it.
 */
async function assertIdentityFree(value: string): Promise<void> {
  const exact = await prisma.articleType.findUnique({ where: { value }, select: { id: true } });
  if (exact) {
    throw new ServiceError('conflict', `An article type with the value "${value}" already exists.`);
  }
  const variant = await prisma.articleType.findFirst({
    where: { value: { equals: value, mode: 'insensitive' } },
    select: { value: true },
  });
  if (variant) {
    throw new ServiceError(
      'conflict',
      `"${variant.value}" already uses this identity. A new article type cannot differ from an existing one only by letter case.`,
    );
  }
}

export async function createArticleType(actor: Actor, raw: CreateArticleTypeInput): Promise<{ id: string }> {
  requireManage(actor);
  const v = CreateInput.parse(raw);
  const value = normalizeArticleTypeValue(v.value);
  const shape = articleTypeValueError(value);
  if (shape) throw new ServiceError('validation', shape);
  await assertIdentityFree(value);

  const max = await prisma.articleType.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.articleType.create({
    data: {
      value,
      label: v.label,
      description: v.description?.trim() || null,
      sortOrder: v.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
      selectable: v.selectable ?? true,
      // Safest settings, by policy. Both require their own permission to change.
      evergreen: false,
      schemaType: 'ARTICLE',
    },
    select: { id: true },
  });
  invalidateArticleTypes();
  await audit(actor.id, 'articleType.create', 'articleType', row.id, `${value} (${v.label})`);
  return { id: row.id };
}

// ---- display metadata -----------------------------------------------------

const MetadataInput = z.object({
  label: z.string().trim().min(1).max(120),
  description: z.string().max(600).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type ArticleTypeMetadataInput = z.input<typeof MetadataInput>;

/**
 * Edits what readers and editors SEE. The stored identity is not an input here,
 * and an attempt to smuggle one in is refused rather than ignored: silently
 * dropping it would let a caller believe a rename had happened.
 */
export async function updateArticleTypeMetadata(
  actor: Actor,
  id: string,
  raw: ArticleTypeMetadataInput,
): Promise<void> {
  requireManage(actor);
  if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    throw new ServiceError(
      'validation',
      'An article type value is permanent and cannot be changed. Edit the label instead, or create a new type and deactivate this one.',
    );
  }
  const v = MetadataInput.parse(raw);
  const existing = await prisma.articleType.findUnique({ where: { id }, select: { value: true, sortOrder: true } });
  if (!existing) throw new ServiceError('not_found', 'Article type not found');
  await prisma.articleType.update({
    where: { id },
    data: {
      label: v.label,
      description: v.description?.trim() || null,
      sortOrder: v.sortOrder ?? existing.sortOrder,
    },
  });
  invalidateArticleTypes();
  await audit(actor.id, 'articleType.update', 'articleType', id, `${existing.value} → label "${v.label}"`);
}

export async function reorderArticleTypes(actor: Actor, idsInOrder: string[]): Promise<void> {
  requireManage(actor);
  const ids = z.array(z.string().min(1)).min(1).max(500).parse(idsInOrder);
  const found = await prisma.articleType.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) throw new ServiceError('not_found', 'One or more article types no longer exist.');
  await prisma.$transaction(
    ids.map((id, i) => prisma.articleType.update({ where: { id }, data: { sortOrder: i } })),
  );
  invalidateArticleTypes();
  await audit(actor.id, 'articleType.reorder', 'articleType', undefined, `${ids.length} types reordered`);
}

// ---- lifecycle ------------------------------------------------------------

/**
 * Withdraw from (or restore to) NEW classification.
 *
 * Articles already storing the value are untouched and stay public. This is the
 * supported alternative to deletion, and the reason deletion is blocked while
 * anything references the value.
 */
export async function setArticleTypeSelectable(actor: Actor, id: string, selectable: boolean): Promise<void> {
  requireManage(actor);
  const existing = await prisma.articleType.findUnique({ where: { id }, select: { value: true } });
  if (!existing) throw new ServiceError('not_found', 'Article type not found');
  await prisma.articleType.update({ where: { id }, data: { selectable } });
  invalidateArticleTypes();
  await audit(
    actor.id,
    selectable ? 'articleType.activate' : 'articleType.deactivate',
    'articleType',
    id,
    existing.value,
  );
}

export async function setArticleTypeArchived(actor: Actor, id: string, archived: boolean): Promise<void> {
  requireManage(actor);
  const existing = await prisma.articleType.findUnique({ where: { id }, select: { value: true } });
  if (!existing) throw new ServiceError('not_found', 'Article type not found');
  await prisma.articleType.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  invalidateArticleTypes();
  await audit(
    actor.id,
    archived ? 'articleType.archive' : 'articleType.reactivate',
    'articleType',
    id,
    existing.value,
  );
}

/**
 * Delete only when NOTHING stores the value — any article, in any workflow
 * state, blocks it. Without a foreign key this check IS the integrity boundary,
 * so it counts rows rather than trusting a cached figure.
 */
export async function deleteArticleType(actor: Actor, id: string): Promise<void> {
  requireManage(actor);
  const row = await prisma.articleType.findUnique({ where: { id }, select: { value: true } });
  if (!row) throw new ServiceError('not_found', 'Article type not found');
  const used = await prisma.article.count({ where: { articleType: row.value } });
  if (used > 0) {
    throw new ServiceError(
      'conflict',
      `Cannot delete: ${used} article(s) are classified as "${row.value}". Deactivate or archive it instead — those articles keep their type and stay published.`,
    );
  }
  /**
   * Batch 04-E.2 — the delete and its TOMBSTONE are one transaction.
   *
   * Mirrors `deleteDiscipline` exactly, for the same reason and with the same
   * mechanism: `SeedTombstone` already exists to record that a seeded
   * foundational record was deliberately removed, so a later seeding run does
   * not resurrect it. Without this, re-running the article type bootstrap
   * recreated a definition an administrator had deleted — the bootstrap undid
   * the decision.
   *
   * It is also what makes "incomplete registry" and "deliberately removed"
   * distinguishable, which the evergreen resolution in `articleTypeRegistry`
   * depends on. A crash between the delete and the tombstone would produce a
   * value that is gone with no record of intent, i.e. exactly the ambiguity
   * this is meant to remove, so neither half may commit alone.
   *
   * The key is the VALUE, not the row id: the id is regenerated if the
   * definition is ever recreated, while the value is the permanent identity.
   */
  await prisma.$transaction(async (tx) => {
    await tx.articleType.delete({ where: { id } });
    await tx.seedTombstone.upsert({
      where: { kind_key: { kind: ARTICLE_TYPE_TOMBSTONE_KIND, key: row.value } },
      update: {},
      create: { kind: ARTICLE_TYPE_TOMBSTONE_KIND, key: row.value },
    });
  });
  invalidateArticleTypes();
  await audit(
    actor.id, 'articleType.delete', 'articleType', id,
    `${row.value}; tombstoned so no bootstrap run can recreate it`,
  );
}

// ---- SEO-bearing settings -------------------------------------------------

/**
 * Evergreen eligibility — `articletype.seo` (SEO Manager, Super Admin).
 *
 * It changes which published articles the evergreen surface may show, with
 * effect at the next revalidation of the pages that render it. Nothing about
 * the articles themselves changes.
 */
export async function setArticleTypeEvergreen(actor: Actor, id: string, evergreen: boolean): Promise<void> {
  requireSeo(actor);
  const existing = await prisma.articleType.findUnique({ where: { id }, select: { value: true } });
  if (!existing) throw new ServiceError('not_found', 'Article type not found');
  await prisma.articleType.update({ where: { id }, data: { evergreen } });
  invalidateArticleTypes();
  await audit(
    actor.id,
    'articleType.evergreen',
    'articleType',
    id,
    `${existing.value} → evergreen=${evergreen}`,
  );
}

/**
 * Structured-data classification — `system.config`, Super Admin only.
 *
 * This is the single most consequential setting in the module: it decides
 * whether every published article of this type declares `NewsArticle` or
 * `Article` to search engines. Only the two supported classifications are
 * accepted, and the value is validated here rather than trusted from the form.
 */
export async function setArticleTypeSchemaType(
  actor: Actor,
  id: string,
  schemaType: ArticleSchemaTypeName,
): Promise<void> {
  requireSystem(actor);
  if (!isArticleSchemaTypeName(schemaType)) {
    throw new ServiceError(
      'validation',
      `Unsupported structured-data classification. Choose one of: ${ARTICLE_SCHEMA_TYPES.join(', ')}.`,
    );
  }
  const existing = await prisma.articleType.findUnique({ where: { id }, select: { value: true } });
  if (!existing) throw new ServiceError('not_found', 'Article type not found');
  await prisma.articleType.update({ where: { id }, data: { schemaType: dbSchema(schemaType) } });
  invalidateArticleTypes();
  await audit(
    actor.id,
    'articleType.schemaType',
    'articleType',
    id,
    `${existing.value} → ${schemaType}`,
  );
}

// ---- bootstrap (admin-triggered, local/dev convenience) -------------------

/**
 * Run the idempotent bootstrap from the admin UI.
 *
 * `system.config` rather than `articletype.manage`: initialising the registry
 * is an installation step, not a taxonomy edit. The underlying function only
 * ever inserts, so a mistaken second press changes nothing.
 */
export async function runArticleTypeBootstrap(
  actor: Actor,
  apply: boolean,
): Promise<{
  created: number;
  present: number;
  conflicts: number;
  /** Definitions an administrator deleted; reported, never recreated. */
  tombstoned: string[];
  complete: boolean;
}> {
  requireSystem(actor);
  const { bootstrapArticleTypes } = await import('./articleTypeBootstrap');
  const report = await bootstrapArticleTypes(prisma, { apply });
  if (apply) {
    invalidateArticleTypes();
    await audit(
      actor.id,
      'articleType.bootstrap',
      'articleType',
      undefined,
      `created=${report.created} present=${report.present} conflicts=${report.conflicts}` +
        (report.tombstoned.length ? ` tombstoned=${report.tombstoned.join('|')}` : ''),
    );
  }
  return {
    created: report.created,
    present: report.present,
    conflicts: report.conflicts,
    tombstoned: report.tombstoned,
    complete: report.complete,
  };
}
