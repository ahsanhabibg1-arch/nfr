import 'server-only';
import type { MetadataRoute } from 'next';
import { prisma } from '../db';
import { SITE_URL } from '../seo';
import { PRIMARY_SECTIONS } from '../../config/routes';
import { LEGAL_PAGES } from '../../config/legalPages';
import { publicArticleWhere, isHiddenFixtureSlug } from '../fixturePolicy';
import { publicRodeoWhere, publicEditionWhere, ACTIVE_ONLY } from '../cms/lifecycle';
import { resolveCanonical } from '../cms/entitySeoService';
import { getContentEligibleVenues, getContentEligibleCompetitors } from '../batch12Content';
import { listPublicCoverageEditions } from '../cms/competitionService';
import { normalizeSameSiteCanonical } from './articleMeta';
import { type SeoSubject, type SitemapExclusionReason, sitemapExclusionReason, newestDate } from './policy';

/**
 * Batch S / S4 — sitemap entries built through the shared policy (lib/seo/policy.ts).
 *
 * Each content type keeps its EXISTING eligibility rules (mirrored from the page that
 * renders it) and is then filtered by the same policy for every type: published →
 * indexable (content rule + stored robots + EntitySeo noindex) → self-canonical.
 * One batched query per type — no per-URL database reads.
 *
 * lastModified (Next 16 `MetadataRoute.Sitemap` declares it optional and only writes
 * <lastmod> when set — node_modules/next/.../resolve-route-data.js): real timestamps only.
 *   home      newest of PageLayout('homepage').publishedAt and newest article updatedAt
 *   sections  newest of SectionConfig.updatedAt, PageLayout('section:<key>').publishedAt and
 *             the section's newest article updatedAt
 *   category  the category's newest article updatedAt (its listing is exactly those articles)
 *   articles  Article.updatedAt
 *   coverage  newest updatedAt of the published+verified rows for that page
 *   legal     InfoPage.updatedAt when a published DB version exists
 *   others    omitted — disciplines, hubs, events, editions, venues, competitors and the two
 *             directory indexes have no trustworthy modification timestamp; the current time
 *             is never substituted.
 */

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

export interface SitemapCandidate {
  subject: SeoSubject;
  /** Content family, for reporting/tests (e.g. "article", "rodeo-hub"). */
  family: string;
  lastModified?: Date;
  changeFrequency: Freq;
  priority: number;
}

export interface SitemapEvaluation {
  entries: MetadataRoute.Sitemap;
  included: SitemapCandidate[];
  excluded: { candidate: SitemapCandidate; reason: SitemapExclusionReason | 'duplicate-url' }[];
}

/** Pure: apply the shared policy to candidates (order preserved, duplicate URLs dropped). */
export function evaluateSitemap(candidates: SitemapCandidate[], siteUrl: string = SITE_URL): SitemapEvaluation {
  const base = siteUrl.replace(/\/+$/, '');
  const seen = new Set<string>();
  const out: SitemapEvaluation = { entries: [], included: [], excluded: [] };
  for (const c of candidates) {
    const reason = sitemapExclusionReason(c.subject, base);
    if (reason) { out.excluded.push({ candidate: c, reason }); continue; }
    const url = `${base}${c.subject.path}`;
    if (seen.has(url)) { out.excluded.push({ candidate: c, reason: 'duplicate-url' }); continue; }
    seen.add(url);
    out.included.push(c);
    out.entries.push({
      url,
      ...(c.lastModified ? { lastModified: c.lastModified } : {}),
      changeFrequency: c.changeFrequency,
      priority: c.priority,
    });
  }
  return out;
}

const slugifyCategory = (categoryKey: string) => categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Load every sitemap candidate with its type's existing rules (server only). */
export async function loadSitemapCandidates(): Promise<SitemapCandidate[]> {
  const sectionKeys = Object.keys(PRIMARY_SECTIONS);
  const [
    articles, entitySeo, sectionConfigs, layouts, categories, disciplines,
    hubs, events, editions, venues, competitors, coverage, infoPages,
  ] = await Promise.all([
    prisma.article.findMany({
      where: publicArticleWhere(),
      select: { slug: true, updatedAt: true, category: { select: { name: true, slug: true } }, seo: { select: { robots: true, canonicalUrl: true } } },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.entitySeo.findMany({ select: { entityType: true, entityId: true, noindex: true, canonicalOverride: true } }),
    prisma.sectionConfig.findMany({ where: { sectionKey: { in: sectionKeys } }, select: { sectionKey: true, updatedAt: true } }),
    prisma.pageLayout.findMany({ where: { pageKey: { in: ['homepage', ...sectionKeys.map((k) => `section:${k}`)] } }, select: { pageKey: true, publishedAt: true } }),
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.discipline.findMany({ where: ACTIVE_ONLY, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true } }),
    prisma.rodeoHub.findMany({
      where: publicRodeoWhere(),
      select: { id: true, slug: true, hubEvents: { select: { event: { select: { slug: true } } } }, _count: { select: { articles: { where: { article: publicArticleWhere() } } } } },
    }),
    prisma.rodeoEvent.findMany({
      where: publicRodeoWhere(),
      select: { id: true, slug: true, description: true, _count: { select: { editions: true, articles: { where: { article: publicArticleWhere() } } } } },
    }),
    prisma.rodeoEventEdition.findMany({ where: publicEditionWhere(), select: { id: true, editionSlug: true, event: { select: { slug: true } } } }),
    getContentEligibleVenues(),
    getContentEligibleCompetitors(),
    listPublicCoverageEditions(),
    prisma.infoPage.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
  ]);

  const seoBy = new Map(entitySeo.map((s) => [`${s.entityType}:${s.entityId}`, s]));
  const entity = (type: string, id: string | undefined): Pick<SeoSubject, 'editorNoindex' | 'canonical'> => {
    const s = id ? seoBy.get(`${type}:${id}`) : undefined;
    return { editorNoindex: !!s?.noindex, canonical: resolveCanonical(s?.canonicalOverride) };
  };
  const layoutAt = new Map(layouts.map((l) => [l.pageKey, l.publishedAt]));
  const sectionConfigAt = new Map(sectionConfigs.map((c) => [c.sectionKey, c.updatedAt]));
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const newestArticle = (pred: (a: (typeof articles)[number]) => boolean) =>
    newestDate(...articles.filter(pred).map((a) => a.updatedAt));

  const out: SitemapCandidate[] = [];

  // Home
  out.push({
    family: 'home', subject: { path: '/', published: true },
    lastModified: newestDate(layoutAt.get('homepage'), newestArticle(() => true)),
    changeFrequency: 'daily', priority: 1,
  });

  // Sections (EntitySeo SECTION keyed by PRIMARY_SECTIONS[key].id) + their category archives
  for (const key of sectionKeys) {
    const meta = PRIMARY_SECTIONS[key];
    out.push({
      family: 'section', subject: { path: meta.path, published: true, ...entity('SECTION', meta.id) },
      lastModified: newestDate(sectionConfigAt.get(key), layoutAt.get(`section:${key}`), newestArticle((a) => a.category.name === meta.categoryKey)),
      changeFrequency: 'weekly', priority: 0.8,
    });
    const catSlug = slugifyCategory(meta.categoryKey);
    out.push({
      family: 'category', subject: { path: `/categories/${catSlug}/`, published: true, ...entity('CATEGORY', categoryIdBySlug.get(catSlug)) },
      lastModified: newestArticle((a) => a.category.slug === catSlug),
      changeFrequency: 'weekly', priority: 0.5,
    });
  }

  // Disciplines (no content-based noindex on the page)
  for (const d of disciplines) {
    out.push({ family: 'discipline', subject: { path: `/disciplines/${d.slug}/`, published: true, ...entity('DISCIPLINE', d.id) }, changeFrequency: 'monthly', priority: 0.6 });
  }

  // Articles — stored ArticleSeo robots + same-site canonical (as rendered by S1)
  for (const a of articles) {
    out.push({
      family: 'article',
      subject: {
        path: `/articles/${a.slug}/`, published: true,
        storedRobots: a.seo ? a.seo.robots : undefined,
        canonical: normalizeSameSiteCanonical(a.seo?.canonicalUrl),
      },
      lastModified: a.updatedAt, changeFrequency: 'weekly', priority: 0.7,
    });
  }

  // Rodeo: hubs + events share /rodeo-events/<slug>/ (event takes precedence, as resolveRodeoEntity)
  const eventSlugs = new Set(events.map((e) => e.slug));
  for (const h of hubs) {
    const visibleEvents = h.hubEvents.filter((he) => !isHiddenFixtureSlug(he.event.slug)).length;
    out.push({
      family: 'rodeo-hub',
      subject: {
        path: `/rodeo-events/${h.slug}/`,
        published: !eventSlugs.has(h.slug), // shadowed by an event with the same slug → never renders
        contentEligible: visibleEvents > 0 || h._count.articles > 0, // = getPublicHubBySlug().indexable
        ...entity('RODEO_HUB', h.id),
      },
      changeFrequency: 'monthly', priority: 0.5,
    });
  }
  for (const e of events) {
    out.push({
      family: 'rodeo-event',
      subject: {
        path: `/rodeo-events/${e.slug}/`, published: true,
        contentEligible: e._count.editions > 0 || e._count.articles > 0 || !!e.description, // = getPublicEventBySlug().indexable
        ...entity('RODEO_EVENT', e.id),
      },
      changeFrequency: 'monthly', priority: 0.6,
    });
  }
  for (const ed of editions) {
    out.push({ family: 'rodeo-edition', subject: { path: `/rodeo-events/${ed.event.slug}/${ed.editionSlug}/`, published: true, ...entity('RODEO_EDITION', ed.id) }, changeFrequency: 'weekly', priority: 0.6 });
  }

  // Directory indexes (unfiltered listing is index, follow)
  out.push({ family: 'directory', subject: { path: '/competitors/', published: true }, changeFrequency: 'weekly', priority: 0.6 });
  out.push({ family: 'directory', subject: { path: '/venues/', published: true }, changeFrequency: 'weekly', priority: 0.6 });

  // Venues & competitors — existing content rule (candidates) + EntitySeo policy
  for (const v of venues) out.push({ family: 'venue', subject: { path: `/venues/${v.slug}/`, published: true, ...entity('VENUE', v.id) }, changeFrequency: 'monthly', priority: 0.5 });
  for (const c of competitors) out.push({ family: 'competitor', subject: { path: `/competitors/${c.slug}/`, published: true, ...entity('COMPETITOR', c.id) }, changeFrequency: 'monthly', priority: 0.5 });

  // Edition coverage — only sections with published+verified rows (page is noindex when empty)
  for (const c of coverage) {
    const base = `/rodeo-events/${c.eventSlug}/${c.editionSlug}`;
    const published = !isHiddenFixtureSlug(c.eventSlug); // page 404s for hidden fixture events
    if (c.schedule) out.push({ family: 'coverage', subject: { path: `${base}/schedule/`, published }, lastModified: c.scheduleUpdatedAt ?? undefined, changeFrequency: 'weekly', priority: 0.6 });
    if (c.results) out.push({ family: 'coverage', subject: { path: `${base}/results/`, published }, lastModified: c.resultsUpdatedAt ?? undefined, changeFrequency: 'weekly', priority: 0.6 });
    if (c.standings) out.push({ family: 'coverage', subject: { path: `${base}/standings/`, published }, lastModified: c.standingsUpdatedAt ?? undefined, changeFrequency: 'weekly', priority: 0.6 });
  }

  // Legal/info pages — same rule as LegalPageView: indexable when a published DB version
  // exists OR the config copy is owner-approved; otherwise rendered noindex.
  const infoAt = new Map(infoPages.map((p) => [p.slug, p.updatedAt]));
  for (const p of LEGAL_PAGES) {
    out.push({
      family: 'legal',
      subject: { path: p.path, published: true, contentEligible: infoAt.has(p.slug) || p.review === 'approved' },
      lastModified: infoAt.get(p.slug),
      changeFrequency: 'yearly', priority: 0.3,
    });
  }

  return out;
}

/** The sitemap: every candidate filtered through the shared policy. */
export async function buildSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  return evaluateSitemap(await loadSitemapCandidates(), SITE_URL).entries;
}
