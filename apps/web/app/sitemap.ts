import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import {
  getPublishedArticles,
  getAllDisciplines,
  getAllSectionKeys,
  getSectionMeta,
} from '@/lib/content';

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

  return entries;
}
