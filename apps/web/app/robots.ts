import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Server-generated robots policy (Batch 01 §12). Mirrors Phase 0 public/robots.txt
// and keeps /admin/ disallowed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/admin/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
