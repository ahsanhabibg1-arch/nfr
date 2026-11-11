/**
 * NFRGuide — Server-side SEO helpers (Batch 01 §12).
 *
 * Replaces the Phase 0 client-side DOM-injection `useSEO` hook with Next.js
 * Metadata API objects and JSON-LD builders that are rendered into the initial
 * server HTML. Canonical/robots/sitemap all derive from one SITE_URL policy.
 *
 * Structured data is emitted ONLY from verified content fields and uses types
 * that reflect the actual page (Article/NewsArticle for articles) — never a
 * fabricated SportsEvent (Master Requirements §8.2).
 */

import type { Metadata } from 'next';
import { Article, Discipline } from '../types';
import { INDEX_FOLLOW, LEGACY_NOINDEX, type RobotsPolicy } from './seo/robots';
import { PRODUCTION_SITE_URL } from './seo/canonical';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL
).replace(/\/$/, '');

const DEFAULT_OG_IMAGE = '/assets/images/hero_bull_riding_1793166440262.jpg';

interface BuildMetaInput {
  title: string;
  description: string;
  /** Canonical path beginning with '/' and (per policy) ending with '/'. */
  path: string;
  image?: string;
  type?: 'website' | 'article';
  /**
   * Route-level shorthand: when true, emit noindex, nofollow (unavailable / not-found /
   * thin / filtered states). Unchanged pre-S3 behaviour. Ignored when `robots` is given.
   */
  noindex?: boolean;
  /**
   * Independent index/follow policy (Batch S3). Takes precedence over `noindex`.
   * Used for stored editorial directives (ArticleSeo.robots, EntitySeo.noindex).
   */
  robots?: RobotsPolicy;
  publishedTime?: string;
  authorName?: string;
  /** Absolute canonical URL overriding the path-derived one (same-site only, validated upstream). */
  canonical?: string;
}

function absolute(pathOrUrl: string | undefined): string {
  if (!pathOrUrl) return `${SITE_URL}${DEFAULT_OG_IMAGE}`;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export function buildMetadata({
  title,
  description,
  path,
  image,
  type = 'website',
  noindex = false,
  robots: robotsPolicy,
  publishedTime,
  authorName,
  canonical: canonicalOverride,
}: BuildMetaInput): Metadata {
  const robots = robotsPolicy ?? (noindex ? LEGACY_NOINDEX : INDEX_FOLLOW);
  const canonical = canonicalOverride || `${SITE_URL}${path}`;
  const ogImage = absolute(image);
  // Mirror the Phase 0 suffix behaviour without double-appending when the brand
  // is already present (root layout sets no template, so this is authoritative).
  const fullTitle = title.includes('NFRGuide') ? title : `${title} — NFRGuide`;
  return {
    title: { absolute: fullTitle },
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical },
    robots: { index: robots.index, follow: robots.follow },
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      type,
      images: [{ url: ogImage }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(authorName ? { authors: [authorName] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
    },
  };
}

/**
 * Article types that are time-bound news reporting and therefore NewsArticle (owner
 * decision D2, Batch A). Every other editorial type is a general Article.
 */
export const NEWS_ARTICLE_TYPES: ReadonlySet<string> = new Set(['news', 'event update']);

export function isNewsArticleType(articleType: string | null | undefined): boolean {
  return NEWS_ARTICLE_TYPES.has((articleType ?? '').trim().toLowerCase());
}

export function articleJsonLd(article: Article): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': isNewsArticleType(article.articleType) ? 'NewsArticle' : 'Article',
    headline: article.title,
    description: article.deck || article.excerpt,
    image: absolute(article.heroImage),
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    author: {
      '@type': 'Person',
      name: article.author.name,
      jobTitle: article.author.role,
    },
    publisher: {
      '@type': 'Organization',
      name: 'NFRGuide',
      url: SITE_URL,
    },
    articleSection: article.category,
    mainEntityOfPage: `${SITE_URL}/articles/${article.slug}/`,
  };
}

export function disciplineJsonLd(discipline: Discipline): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${discipline.name} Guide`,
    description: discipline.summary,
    image: absolute(discipline.image),
    publisher: {
      '@type': 'Organization',
      name: 'NFRGuide',
      url: SITE_URL,
    },
    mainEntityOfPage: `${SITE_URL}/disciplines/${discipline.slug}/`,
  };
}

/**
 * schema.org Event for a rodeo edition — emitted ONLY when dates are verified
 * (Master Reqs §8.2: never fabricate event data). Returns null for editions with
 * unknown dates, so the page omits structured event data rather than inventing it.
 */
export function rodeoEditionJsonLd(input: {
  name: string;
  startAt: string | null;
  endAt: string | null;
  url: string;
  description?: string | null;
  venue?: { name: string; city: string | null; state: string | null; country: string | null } | null;
}): Record<string, unknown> | null {
  if (!input.startAt) return null;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.name,
    startDate: input.startAt,
    url: input.url,
  };
  if (input.endAt) data.endDate = input.endAt;
  if (input.description) data.description = input.description;
  if (input.venue) {
    data.location = {
      '@type': 'Place',
      name: input.venue.name,
      address: {
        '@type': 'PostalAddress',
        ...(input.venue.city ? { addressLocality: input.venue.city } : {}),
        ...(input.venue.state ? { addressRegion: input.venue.state } : {}),
        ...(input.venue.country ? { addressCountry: input.venue.country } : {}),
      },
    };
  }
  return data;
}

/**
 * schema.org Place for a venue (Batch 12). Built ONLY from verified stored fields;
 * optional address/geo/capacity are omitted when unknown rather than fabricated.
 */
export function venueJsonLd(input: {
  name: string; url: string; description?: string | null;
  city?: string | null; state?: string | null; country?: string | null;
  latitude?: number | null; longitude?: number | null; capacity?: number | null;
}): Record<string, unknown> {
  const data: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'Place', name: input.name, url: input.url };
  if (input.description) data.description = input.description;
  if (input.city || input.state || input.country) {
    data.address = {
      '@type': 'PostalAddress',
      ...(input.city ? { addressLocality: input.city } : {}),
      ...(input.state ? { addressRegion: input.state } : {}),
      ...(input.country ? { addressCountry: input.country } : {}),
    };
  }
  if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
    data.geo = { '@type': 'GeoCoordinates', latitude: input.latitude, longitude: input.longitude };
  }
  if (typeof input.capacity === 'number') data.maximumAttendeeCapacity = input.capacity;
  return data;
}

/**
 * schema.org Person for a competitor/athlete (Batch 12). Built ONLY from verified
 * stored fields; no fabricated achievements, rankings or prize money are emitted.
 */
export function competitorJsonLd(input: {
  name: string; url: string; description?: string | null; image?: string | null;
  disciplines?: string[]; hometown?: string | null;
}): Record<string, unknown> {
  const data: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'Person', name: input.name, url: input.url };
  if (input.description) data.description = input.description;
  if (input.image) data.image = absolute(input.image);
  if (input.hometown) data.homeLocation = { '@type': 'Place', name: input.hometown };
  if (input.disciplines && input.disciplines.length) data.knowsAbout = input.disciplines;
  return data;
}

export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * FAQPage structured data (Batch 11). Returns null unless there is at least one
 * visible FAQ, and is built from EXACTLY the enabled FAQs rendered on the page (no
 * hidden content). Rich-result display is at the search engine's discretion — this
 * only provides accurate structured data, it does not guarantee rich results.
 */
export function faqPageJsonLd(faqs: { question: string; answer: string }[]): Record<string, unknown> | null {
  if (!faqs || faqs.length === 0) return null;

  /**
   * Stage 09 Task C — defence in depth, closing no live hole.
   *
   * schema.org requires a `Question` to carry both a `name` and an
   * `acceptedAnswer.text`; a `Question` with an empty answer is invalid markup
   * rather than an incomplete one. The emitter previously mapped every entry
   * through unconditionally, so an empty `answer` would have been published as
   * `acceptedAnswer: { text: '' }`.
   *
   * To be precise about severity: this was **not reachable** through the
   * supported path. `faqService` validates both fields with
   * `z.string().trim().min(3)` on create and update, so no stored `EntityFaq`
   * row can hold a blank question or answer, and the audit found no other
   * writer. The filter makes the guarantee local to the emitter instead of
   * resting on a validator three modules away — it is hardening, not a fix for
   * an observed defect, and it changes nothing for valid input.
   */
  const complete = faqs.filter((f) => (f.question ?? '').trim() !== '' && (f.answer ?? '').trim() !== '');
  if (complete.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: complete.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/**
 * Serialize structured data for embedding in a <script type="application/ld+json">.
 *
 * Values include CMS-editable text (titles, decks, author names, FAQ answers, venue and
 * event names), so a raw JSON.stringify could contain `</script>` (any casing) or `<!--`
 * and break out of the element. `<`, `>` and `&` only ever occur inside JSON string
 * literals, so replacing them with \uXXXX escapes keeps the output valid, equivalent JSON
 * while making it impossible to close the script element. U+2028/U+2029 are escaped too
 * (legal in JSON, but line terminators in older JS parsers).
 */
// Built from char codes so the source file never contains the raw separator characters.
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
}

/** Render JSON-LD in server components. All structured data goes through serializeJsonLd. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
