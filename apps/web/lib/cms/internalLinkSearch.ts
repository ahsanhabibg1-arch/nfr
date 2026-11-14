import 'server-only';
import { prisma } from '../db';
import type { Actor } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { ROUTES, PRIMARY_SECTIONS } from '../../config/routes';
import { ACTIVE_ONLY } from './lifecycle';
import { publicArticleWhere, publicSlugWhere } from '../fixturePolicy';

/**
 * Internal link search for the article editor.
 *
 * WHY A SERVICE AND NOT A URL BUILDER IN THE UI. The editor must insert the
 * entity's REAL canonical path, not a guessed one. So every result's `url`
 * comes from `config/routes.ts` — the same helpers the public pages and the
 * sitemap use — applied to the entity's stored slug. Nothing here concatenates
 * a path by hand, which is how an editor ends up linking to a 404.
 *
 * PUBLISHABILITY IS PART OF THE RESULT, NOT A FILTER. Articles are restricted
 * to the public set (`publicArticleWhere` semantics: published, not archived),
 * because linking to a draft would publish a dead URL. Other entity types are
 * restricted to ACTIVE rows for the same reason. Where an entity can be linked
 * but has no published articles behind it, the result carries a `warning` the
 * editor shows rather than silently hiding the option — the author knows their
 * own plan better than this search does.
 *
 * SEARCH IS DELIBERATELY SIMPLE. Case-insensitive `contains` over the display
 * name plus the slug, ordered so exact prefix matches come first. The data sets
 * are small (tens of rows per type); full-text ranking here would be machinery
 * without a problem. If any of these grows past a page or two, this is the
 * place to add it.
 */

export type InternalLinkKind = 'article' | 'category' | 'section' | 'discipline' | 'hub' | 'event' | 'edition';

export interface InternalLinkResult {
  kind: InternalLinkKind;
  id: string;
  label: string;
  /** Site-relative canonical path, from the route helpers. */
  url: string;
  /** Short context line: the category, region, year — whatever identifies it. */
  detail?: string;
  /** Present when the target is linkable but worth a second look. */
  warning?: string;
}

const LIMIT_PER_KIND = 6;

/** Case-insensitive `contains`, used identically for every kind. */
const like = (q: string) => ({ contains: q, mode: 'insensitive' as const });

/** Exact-prefix matches first, then alphabetical — stable and predictable. */
function rank(results: InternalLinkResult[], q: string): InternalLinkResult[] {
  const needle = q.trim().toLowerCase();
  return results.sort((a, b) => {
    const ap = a.label.toLowerCase().startsWith(needle) ? 0 : 1;
    const bp = b.label.toLowerCase().startsWith(needle) ? 0 : 1;
    return ap !== bp ? ap - bp : a.label.localeCompare(b.label);
  });
}

export async function searchInternalLinkTargets(
  actor: Actor,
  rawQuery: string,
  kinds?: readonly InternalLinkKind[],
): Promise<InternalLinkResult[]> {
  /**
   * Gated on the permissions that let someone write an article body, since that
   * is the only place this is used. `article.edit.own` is included because an
   * author editing their own draft needs to link just as much as an editor
   * does. It reads only public-facing identity fields, but an open endpoint
   * that enumerates unpublished slugs would still be a leak, so it is gated.
   */
  const mayWrite = ['article.create', 'article.edit.own', 'article.edit.any'] as const;
  if (!mayWrite.some((p) => roleHasPermission(actor.roles, p))) {
    throw new ServiceError('forbidden', 'Not permitted to search link targets');
  }

  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const want = (k: InternalLinkKind) => !kinds || kinds.includes(k);
  const out: InternalLinkResult[] = [];

  // ---- articles: published only ----------------------------------------
  if (want('article')) {
    const rows = await prisma.article.findMany({
      /**
       * `publicArticleWhere()` is the project's single definition of "an
       * article a reader can reach" — published, and fixtures excluded where
       * the environment says so. An earlier version of this file hand-wrote
       * `{ workflowStatus: 'PUBLISHED', archivedAt: null }`, which threw
       * because `Article` has no `archivedAt` column at all. Reusing the
       * helper means this search and the public pages cannot disagree about
       * what is linkable.
       */
      where: { ...publicArticleWhere(), OR: [{ title: like(q) }, { slug: like(q) }] },
      select: { id: true, slug: true, title: true, category: { select: { name: true } } },
      orderBy: { publishedAt: 'desc' },
      take: LIMIT_PER_KIND,
    });
    for (const r of rows) {
      out.push({ kind: 'article', id: r.id, label: r.title, url: ROUTES.ARTICLE(r.slug), detail: r.category.name });
    }
  }

  // ---- the five canonical sections (config, not rows) -------------------
  if (want('section')) {
    const needle = q.toLowerCase();
    for (const [key, s] of Object.entries(PRIMARY_SECTIONS)) {
      const section = s as { name: string; path: string };
      if (!section.name.toLowerCase().includes(needle) && !key.toLowerCase().includes(needle)) continue;
      out.push({ kind: 'section', id: key, label: section.name, url: section.path, detail: 'Section landing' });
    }
  }

  // ---- category archives -----------------------------------------------
  if (want('category')) {
    const rows = await prisma.category.findMany({
      where: { OR: [{ name: like(q) }, { slug: like(q) }] },
      select: { id: true, slug: true, name: true, _count: { select: { articles: { where: publicArticleWhere() } } } },
      take: LIMIT_PER_KIND,
    });
    for (const r of rows) {
      out.push({
        kind: 'category', id: r.id, label: r.name, url: ROUTES.CATEGORY(r.slug),
        detail: `${r._count.articles} published`,
        // The archive route exists either way, but an empty one is a thin page
        // to send a reader to, and the sitemap deliberately omits it.
        warning: r._count.articles === 0 ? 'No published articles in this category yet' : undefined,
      });
    }
  }

  // ---- disciplines, hubs, events, editions: active rows only ------------
  if (want('discipline')) {
    const rows = await prisma.discipline.findMany({
      where: { ...ACTIVE_ONLY, OR: [{ name: like(q) }, { slug: like(q) }] },
      select: { id: true, slug: true, name: true, category: true },
      take: LIMIT_PER_KIND,
    });
    for (const r of rows) {
      out.push({ kind: 'discipline', id: r.id, label: r.name, url: ROUTES.DISCIPLINE(r.slug), detail: r.category ?? undefined });
    }
  }

  if (want('hub')) {
    const rows = await prisma.rodeoHub.findMany({
      where: { ...ACTIVE_ONLY, ...publicSlugWhere(), OR: [{ title: like(q) }, { slug: like(q) }] },
      select: { id: true, slug: true, title: true, region: true },
      take: LIMIT_PER_KIND,
    });
    for (const r of rows) {
      out.push({ kind: 'hub', id: r.id, label: r.title, url: ROUTES.RODEO_HUB(r.slug), detail: r.region ?? undefined });
    }
  }

  if (want('event')) {
    const rows = await prisma.rodeoEvent.findMany({
      where: { ...ACTIVE_ONLY, ...publicSlugWhere(), OR: [{ name: like(q) }, { slug: like(q) }] },
      select: { id: true, slug: true, name: true, location: true },
      take: LIMIT_PER_KIND,
    });
    for (const r of rows) {
      out.push({ kind: 'event', id: r.id, label: r.name, url: ROUTES.RODEO_EVENT(r.slug), detail: r.location ?? undefined });
    }
  }

  if (want('edition')) {
    const rows = await prisma.rodeoEventEdition.findMany({
      where: { OR: [{ label: like(q) }, { editionSlug: like(q) }] },
      select: { id: true, label: true, editionSlug: true, event: { select: { slug: true, name: true, archivedAt: true } } },
      take: LIMIT_PER_KIND,
    });
    for (const r of rows) {
      // An edition's URL is nested under its event, so an archived parent makes
      // the whole path unreachable.
      if (r.event.archivedAt) continue;
      out.push({
        kind: 'edition', id: r.id, label: r.label,
        url: `${ROUTES.RODEO_EVENT(r.event.slug)}${r.editionSlug}/`,
        detail: r.event.name,
      });
    }
  }

  return rank(out, q);
}
