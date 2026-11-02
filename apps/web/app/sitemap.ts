import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import {
  getPublishedArticles,
  getAllDisciplines,
  getAllSectionKeys,
  getSectionMeta,
} from '@/lib/content';
import { getAllRodeoSlugs } from '@/lib/rodeoContent';
import { getIndexableVenueSlugs, getIndexableCompetitorSlugs } from '@/lib/batch12Content';

/**
 * Central indexability policy (Master Requirements §8.2 / Batch 01 §12): the XML
 * sitemap lists ONLY published, publicly eligible URLs. Admin, drafts and other
 * non-published content are excluded by construction (adapter returns published
 * only). This replaces the missing Phase 0 sitemap generator.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
  ];

  for (const key of getAllSectionKeys()) {
    const meta = getSectionMeta(key);
    if (!meta) continue;
    entries.push({
      url: `${SITE_URL}${meta.path}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    const catSlug = meta.categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    entries.push({
      url: `${SITE_URL}/categories/${catSlug}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  for (const d of await getAllDisciplines()) {
    entries.push({
      url: `${SITE_URL}/disciplines/${d.slug}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  for (const a of await getPublishedArticles()) {
    entries.push({
      url: `${SITE_URL}/articles/${a.slug}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  // Public rodeo entity pages (Batch 10): hubs, recurring events, annual editions.
  const rodeo = await getAllRodeoSlugs();
  for (const slug of rodeo.hubs) {
    entries.push({ url: `${SITE_URL}/rodeo-events/${slug}/`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 });
  }
  for (const slug of rodeo.events) {
    entries.push({ url: `${SITE_URL}/rodeo-events/${slug}/`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 });
  }
  for (const e of rodeo.editions) {
    entries.push({ url: `${SITE_URL}/rodeo-events/${e.eventSlug}/${e.editionSlug}/`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 });
  }

  // Public venue & competitor entity pages (Batch 12): only content-bearing, indexable entities.
  for (const slug of await getIndexableVenueSlugs()) {
    entries.push({ url: `${SITE_URL}/venues/${slug}/`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 });
  }
  for (const slug of await getIndexableCompetitorSlugs()) {
    entries.push({ url: `${SITE_URL}/competitors/${slug}/`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 });
  }

  return entries;
}
