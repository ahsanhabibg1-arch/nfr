import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveArticleCanonical, PRODUCTION_SITE_URL } from '../lib/seo/canonical';
import { articleUrl, ROUTES } from '../config/routes';
import { isInSitemap, sitemapExclusionReason, type SeoSubject } from '../lib/seo/policy';

/**
 * Batch 02 Task E — one resolved, indexable URL per article.
 *
 * THE DEFECT. An article with a managed subcategory lives at
 * `/<subcategory>/<slug>/`, and `/articles/<slug>/` permanently redirects to
 * it. The system-generated `ArticleSeo.canonicalUrl` rows were written before
 * that move and still held the flat path, and a stored same-site canonical
 * outranks the page's own path. So every such article advertised a canonical
 * that redirects — and `lib/seo/policy.ts` lists only SELF-canonical pages, so
 * all of them were silently dropped from the sitemap.
 *
 * Measured on the real content before the fix: 7 of 7 published articles
 * affected, 0 articles in a 35-URL sitemap. After: 42 URLs, all 7 listed at
 * their resolved paths, nothing removed.
 *
 * These cases pin each half of the fix — the healed read and the corrected
 * write — plus the consequence that actually matters: such an article is in the
 * sitemap again.
 */

const SITE = PRODUCTION_SITE_URL;
const SLUG = 'nfr-bull-riding-scoring';
const SUB = 'rules-scoring';
const SELF = `/${SUB}/${SLUG}/`;
const LEGACY = `/articles/${SLUG}/`;

describe('Task E — resolveArticleCanonical', () => {
  it('treats the article\'s own LEGACY flat path as stale and returns self-canonical', () => {
    expect(resolveArticleCanonical(`${SITE}${LEGACY}`, SELF, SLUG, SITE)).toBeNull();
  });

  it('also accepts the stale value as a bare path, not just an absolute URL', () => {
    expect(resolveArticleCanonical(LEGACY, SELF, SLUG, SITE)).toBeNull();
  });

  it('returns self-canonical when the stored value already IS the resolved path', () => {
    expect(resolveArticleCanonical(`${SITE}${SELF}`, SELF, SLUG, SITE)).toBeNull();
  });

  it('PRESERVES a deliberate canonical that points at a different page', () => {
    const other = `${SITE}/rules-scoring/nfr-team-roping-rules/`;
    expect(resolveArticleCanonical(other, SELF, SLUG, SITE)).toBe(other);
  });

  it('does not mistake ANOTHER article\'s legacy path for this one\'s', () => {
    const otherLegacy = `${SITE}/articles/nfr-team-roping-rules/`;
    expect(resolveArticleCanonical(otherLegacy, SELF, SLUG, SITE)).toBe(otherLegacy);
  });

  it('leaves an article WITHOUT a subcategory self-canonical on the flat path', () => {
    expect(resolveArticleCanonical(`${SITE}${LEGACY}`, LEGACY, SLUG, SITE)).toBeNull();
  });

  it('keeps ignoring off-site, non-http and empty values (absent → self-canonical)', () => {
    expect(resolveArticleCanonical('https://example.com/x/', SELF, SLUG, SITE)).toBeNull();
    expect(resolveArticleCanonical('javascript:alert(1)', SELF, SLUG, SITE)).toBeNull();
    expect(resolveArticleCanonical(null, SELF, SLUG, SITE)).toBeNull();
    expect(resolveArticleCanonical('   ', SELF, SLUG, SITE)).toBeNull();
  });

  it('a bare string is a SITE PATH, which is documented normalizer behaviour', () => {
    // Not a malformed value: stored canonicals may be paths, so this resolves
    // on-site and is returned as a deliberate (if odd) cross-page canonical.
    expect(resolveArticleCanonical('/some/other/page/', SELF, SLUG, SITE))
      .toBe(`${SITE}/some/other/page/`);
  });

  it('is trailing-slash and origin tolerant (production origin is "this site")', () => {
    expect(resolveArticleCanonical(`${SITE}/articles/${SLUG}`, SELF, SLUG, SITE)).toBeNull();
    expect(resolveArticleCanonical(`http://WWW.nfrguide.com/articles/${SLUG}/`, SELF, SLUG, SITE)).toBeNull();
  });
});

describe('Task E — the consequence: such an article is sitemap-eligible again', () => {
  const subject = (canonical: string | null): SeoSubject => ({
    path: SELF, published: true, storedRobots: 'index, follow', canonical,
  });

  it('a stale legacy canonical USED to exclude it as canonical-away', () => {
    // The pre-fix value: the raw stored string, not run through the resolver.
    const stale = subject(`${SITE}${LEGACY}`);
    expect(isInSitemap(stale, SITE)).toBe(false);
    expect(sitemapExclusionReason(stale, SITE)).toBe('canonical-away');
  });

  it('and the resolved canonical puts it back in', () => {
    const healed = subject(resolveArticleCanonical(`${SITE}${LEGACY}`, SELF, SLUG, SITE));
    expect(isInSitemap(healed, SITE)).toBe(true);
    expect(sitemapExclusionReason(healed, SITE)).toBeNull();
  });
});

describe('Task E — the shared URL builder is the single source of truth', () => {
  it('articleUrl resolves (subcategory, slug), with the flat path only as the fallback', () => {
    expect(articleUrl({ slug: SLUG, subcategoryRef: { slug: SUB } })).toBe(SELF);
    expect(articleUrl({ slug: SLUG, subcategoryRef: null })).toBe(LEGACY);
    expect(ROUTES.ARTICLE(SLUG, SUB)).toBe(SELF);
  });

  it('JSON-LD mainEntityOfPage is built from that builder, not a hardcoded path', () => {
    const src = readFileSync(resolve(__dirname, '../lib/seo.tsx'), 'utf8');
    expect(src).toContain('mainEntityOfPage: `${SITE_URL}${articleUrl(article)}`');
    expect(src).not.toContain('mainEntityOfPage: `${SITE_URL}/articles/${article.slug}/`');
  });

  it('the stored canonical is WRITTEN from the resolved path, so a save cannot recreate the staleness', () => {
    const src = readFileSync(resolve(__dirname, '../lib/cms/articleService.ts'), 'utf8');
    expect(src).toContain('productionCanonicalUrl(articlePath(v.slug, subcategorySlug))');
    expect(src).not.toContain('productionCanonicalUrl(`/articles/${v.slug}/`)');
  });

  it('public search links to the resolved path rather than through a redirect', () => {
    const src = readFileSync(resolve(__dirname, '../lib/search/publicSearch.ts'), 'utf8');
    expect(src).toContain('url: articlePublicPath(r.slug, r.subcategorySlug)');
    expect(src).not.toContain('url: `/articles/${r.slug}/`');
  });

  it('the sitemap and the renderer share one resolver, so they cannot disagree again', () => {
    const sitemap = readFileSync(resolve(__dirname, '../lib/seo/sitemapEntries.ts'), 'utf8');
    const meta = readFileSync(resolve(__dirname, '../lib/seo/articleMeta.ts'), 'utf8');
    expect(sitemap).toContain('resolveArticleCanonical(');
    expect(meta).toContain('resolveArticleCanonical(');
  });
});
