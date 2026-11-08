import type { MetadataRoute } from 'next';
import { buildSitemapEntries } from '@/lib/seo/sitemapEntries';

/**
 * XML sitemap (Master Requirements §8.2 / Batch 01 §12). Thin route wrapper — eligibility
 * is decided by the shared SEO policy (lib/seo/policy.ts) over each content type's existing
 * rules (lib/seo/sitemapEntries.ts): only published, indexable, self-canonical URLs are
 * listed. Admin, drafts, noindex and canonical-away pages are excluded by construction.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries();
}
