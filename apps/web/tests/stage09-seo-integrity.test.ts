import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

/**
 * Stage 09 Tasks A–D — SEO field ownership, metadata rendering, structured data
 * integrity, and indexability.
 *
 * SCOPE DISCIPLINE. The repository already carries ~134 SEO tests across 13
 * files covering `buildMetadata`, canonical normalisation, robots policy and
 * sitemap predicates. This file does not re-test those. It covers the gaps the
 * Stage 09 audit found:
 *
 *   1. **Single SEO ownership** — that the Builder has not become a parallel
 *      SEO database, and that dead SEO storage stays dead rather than being
 *      wired up to compete with authoritative CMS data.
 *   2. **Real route metadata** — asserted by calling a route's own
 *      `generateMetadata`, not by inspecting `buildMetadata` in isolation.
 *   3. **Structured data factual integrity** — that every emitted property is
 *      derived from a real record, and that nothing is fabricated.
 *   4. **Publisher identity absence** — that no `Organization` or `WebSite`
 *      JSON-LD exists, because D-14 is unapproved and the facts are unverified.
 */

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const seo = await import('../lib/seo');
const { LEGAL_PAGES, getLegalPage } = await import('../config/legalPages');

/* ── 1. SEO field ownership (Task A) ─────────────────────────────── */

describe('Stage 09 Task A — SEO Intelligence is the single owner of SEO metadata', () => {
  it('no Builder block declares an SEO metadata property', () => {
    /**
     * The invariant that keeps the Builder from becoming a parallel SEO
     * database. A block may own PRESENTATION copy — a kicker, a heading, a CTA
     * label — but never a canonical, a robots directive or a meta description.
     */
    const registry = read('lib/cms/sectionRegistry.ts');
    const seoOwned = [
      'canonical', 'canonicalUrl', 'canonicalOverride', 'robots', 'noindex',
      'metaDescription', 'seoTitle', 'ogImage', 'structuredDataType',
    ];
    const offenders = seoOwned.filter((k) => registry.includes(`key: '${k}'`));
    expect(offenders, 'SEO metadata must live in SEO Intelligence, not in layout JSON').toEqual([]);
  });

  it('image alt text is the one SEO-tab property a block may own', () => {
    /**
     * Two blocks declare `heroImageAlt` / `imageAlt` under `tab: 'seo'`. That is
     * correct and is NOT a metadata field: alt text describes a presentational
     * image the Builder chose for the page, so the Builder owns it. Pinned so
     * the distinction stays deliberate.
     */
    const registry = read('lib/cms/sectionRegistry.ts');
    expect(registry).toContain("tab: 'seo'");
    const seoTabKeys = [...registry.matchAll(/key: '(\w+)'[^}]*tab: 'seo'/g)].map((m) => m[1]);
    expect(seoTabKeys.length).toBeGreaterThan(0);
    for (const k of seoTabKeys) {
      expect(k, 'only alt text may sit on a block SEO tab').toMatch(/Alt$/);
    }
  });

  it('DEAD STORAGE: ArticleSeo.structuredDataType is read by nothing', () => {
    /**
     * Task A finding, and owner decision D-10's open item ("drop or consume").
     *
     * The column exists with `@default("Article")`, and `types/index.ts` declares
     * four possible values including `'Guide'` and `'BreadcrumbList'` — which
     * would be invalid as an Article `@type` anyway. Nothing reads it.
     *
     * This test pins it as unused DELIBERATELY. Wiring it up would create a
     * second owner for the JSON-LD `@type`, competing with the authoritative
     * `article.articleType`, and a stored `'Guide'` would emit a schema type
     * that does not describe the page. Dropping the column is a schema change
     * and therefore needs approval; until then, it must stay inert.
     */
    const consumers: string[] = [];
    for (const dir of ['lib', 'app', 'views', 'components']) {
      const walk = (d: string): void => {
        for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
          const rel = path.join(d, e.name);
          if (e.isDirectory()) walk(rel);
          else if (/\.tsx?$/.test(e.name) && read(rel).includes('structuredDataType')) consumers.push(rel);
        }
      };
      walk(dir);
    }
    expect(consumers, 'structuredDataType must stay inert until D-10 is resolved').toEqual([]);
  });

  it('the JSON-LD @type comes from authoritative CMS data, not stored SEO', () => {
    // `isNewsArticleType(article.articleType)` — the entity's own field.
    expect(seo.isNewsArticleType('news')).toBe(true);
    expect(seo.isNewsArticleType('event update')).toBe(true);
    expect(seo.isNewsArticleType('guide')).toBe(false);
    expect(seo.isNewsArticleType(null)).toBe(false);
    expect(seo.isNewsArticleType(undefined)).toBe(false);
  });

  it('GAP: ArticleSeo.robots is rendered and honoured but has no editing surface', () => {
    /**
     * The single most consequential Task A finding.
     *
     * `ArticleSeo.robots` is genuinely consumed in two places:
     *   - `lib/seo/articleMeta.ts` parses it into the page's `robots` metadata;
     *   - `lib/seo/sitemapEntries.ts` reads it as `storedRobots`, so it decides
     *     whether the article appears in the sitemap at all.
     *
     * But nothing WRITES it. `articleService.ts` is the only module that touches
     * the `ArticleSeo` table, and its upsert sets exactly four columns —
     * `seoTitle`, `metaDescription`, `canonicalUrl`, `ogImage`. No admin screen,
     * server action or service writes `robots`, so every row carries the schema
     * default `"index, follow"` forever.
     *
     * Consequence: an editor cannot noindex one article through the CMS. The
     * capability is fully built on the read side and simply has no control
     * attached, so the only way to use it is direct database access.
     *
     * Stage 09 does not add the control: it is a new editorial capability with
     * publication-policy implications, not a correctness fix, and §2 forbids
     * expanding scope. It is pinned here and carried to the Stage 10 readiness
     * register.
     */
    const service = read('lib/cms/articleService.ts');
    const upsert = service.slice(service.indexOf('tx.articleSeo.upsert'), service.indexOf('tx.articleSeo.upsert') + 500);
    expect(upsert).toContain('seoTitle');
    expect(upsert).toContain('metaDescription');
    expect(upsert).toContain('canonicalUrl');
    expect(upsert).toContain('ogImage');
    expect(upsert, 'no writer sets robots — the field is read-only in practice').not.toContain('robots');

    // And the read side really does consume it, so this is a missing control,
    // not dead storage like `structuredDataType`.
    expect(read('lib/seo/articleMeta.ts')).toContain('parseRobotsDirective(seo?.robots)');
    expect(read('lib/seo/sitemapEntries.ts')).toContain('storedRobots');
  });

  it('a stored article canonical is the production URL from the shared constant', async () => {
    /**
     * `ArticleSeo.canonicalUrl` is derived, not editable, and must never carry a
     * dev or staging host — a staging canonical published to production would
     * point every article at a host search engines cannot reach.
     */
    const service = read('lib/cms/articleService.ts');
    expect(service).toContain('productionCanonicalUrl(`/articles/${v.slug}/`)');
    const { productionCanonicalUrl, PRODUCTION_SITE_URL } = await import('../lib/seo/canonical');
    expect(productionCanonicalUrl('/articles/x/')).toBe(`${PRODUCTION_SITE_URL}/articles/x/`);
  });

  it('the editor shell duplicates the canonical rule, but the server ignores it', () => {
    /**
     * A category-6 duplication finding, recorded with its real severity rather
     * than inflated. `AdminArticleEditorShell` builds a client-side snapshot for
     * live validation that contains a hardcoded
     * `https://nfrguide.com/articles/${slug}/` literal instead of the shared
     * constant. It never reaches the database: `articleService` recomputes the
     * canonical from `productionCanonicalUrl()` and the client value is not part
     * of the save payload schema.
     *
     * So the consequence is limited to drift in what the editor's own validator
     * sees if the production host ever changes — worth fixing when the host
     * changes, not a live defect.
     */
    const shell = read('views/admin/AdminArticleEditorShell.tsx');
    expect(shell).toContain('https://nfrguide.com/articles/');
    // The proof that it is inert: the server's input schema has no canonical field.
    const service = read('lib/cms/articleService.ts');
    const schema = service.slice(service.indexOf('ArticleInputSchema'), service.indexOf('export type ArticleInput'));
    expect(schema, 'the client cannot supply a canonical').not.toContain('canonicalUrl');
  });

  it('MISLEADING: a stored SEO title is never empty, so deliberate and copied values look identical', () => {
    /**
     * `articleService` writes `v.seoTitle || v.title` and
     * `v.metaDescription || v.excerpt`, so the fallback is applied AT WRITE TIME
     * and the stored column is never null.
     *
     * The effect is that the database cannot distinguish "an editor wrote a
     * deliberate SEO title" from "the editor left the field blank and the
     * headline was copied in". Any audit, export or report reading stored values
     * sees a fully populated SEO title on every article and will conclude the
     * field is being used, which is exactly the misleading signal Task A asks
     * about. The rendered output is correct either way; the reporting is not.
     */
    const service = read('lib/cms/articleService.ts');
    expect(service).toContain('seoTitle: v.seoTitle || v.title');
    expect(service).toContain('metaDescription: v.metaDescription || v.excerpt');
  });

  it('EntitySeo validates every field it accepts, and refuses an off-site canonical', () => {
    /**
     * The counter-example, and the audit is as useful for confirming this as for
     * finding gaps: `upsertEntitySeo` bounds all six fields, strips HTML from
     * `intro`, and runs `validateCanonicalOverride`, which applies the SAME rule
     * as rendering — so a value is storable only if it would actually be
     * emitted. An off-site canonical is refused on write and ignored on render.
     */
    const svc = read('lib/cms/entitySeoService.ts');
    for (const field of ['seoTitle', 'metaDescription', 'canonicalOverride', 'ogImage', 'noindex', 'intro']) {
      expect(svc, `${field} must be in the input schema`).toMatch(new RegExp(`${field}:\\s*z\\.`));
    }
    expect(svc).toContain("regex(/^[^<>]*$/s, 'HTML is not allowed')");
    expect(svc).toContain('validateCanonicalOverride(v.canonicalOverride)');
  });

  it('GAP: ogImage is length-bounded but not checked as a URL', () => {
    /**
     * Low severity, stated as such. `ogImage` is accepted as any string up to
     * 500 characters, so a typo is stored and emitted as `og:image` with no
     * warning, producing a broken social preview. It is NOT an injection
     * vector: `absolute()` passes through only `http(s)://` values and prefixes
     * everything else onto the site origin, so a `javascript:` string becomes an
     * inert 404 path, and the value lands in a meta `content` attribute that is
     * never executed.
     */
    const svc = read('lib/cms/entitySeoService.ts');
    expect(svc).toContain('ogImage: z.string().max(500)');
    expect(svc, 'no format check today').not.toMatch(/ogImage:\s*z\.string\(\)\.url\(\)/);

    const meta = seo.buildMetadata({ title: 't', description: 'd', path: '/p/', image: 'javascript:alert(1)' });
    const og = (meta.openGraph as { images: { url: string }[] }).images[0].url;
    expect(og, 'a non-http value is neutralised onto the site origin').toBe(`${seo.SITE_URL}/javascript:alert(1)`);
    const tw = (meta.twitter as { images: string[] }).images[0];
    expect(tw).toBe(`${seo.SITE_URL}/javascript:alert(1)`);
  });

  it('BOUNDARY: EntitySeo.intro is visible body copy owned by SEO Intelligence', () => {
    /**
     * The mirror image of the risk Task A is written to catch. The guarded
     * direction is "the Builder must not own SEO metadata", and it does not. But
     * the boundary is crossed in the other direction: `EntitySeo.intro` is
     * plain-text body copy, edited on the SEO screen, rendered inside the page
     * through `<EntityIntro>` — not metadata at all.
     *
     * That is a deliberate design (SEO-driven directory intros) and Stage 09
     * does not move it. The consequence to record is that a Builder appendage
     * block on the same entity page can render a second intro paragraph, and
     * nothing reconciles the two, so "the intro" has no single owner even though
     * SEO metadata does.
     */
    expect(read('app/(public)/competitors/[slug]/page.tsx')).toContain('<EntityIntro intro={seo?.intro} />');
    const svc = read('lib/cms/entitySeoService.ts');
    expect(svc).toContain('intro:');
    // It is body content, so it must never leak into the page description.
    expect(svc, 'intro is not a metadata field').not.toMatch(/description:\s*seo\??\.?\.intro/);
  });
});

/* ── 2. Structured data factual integrity (Task C) ───────────────── */

/** A complete, realistic article record. */
function article(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    slug: 'nfr-round-one-recap',
    title: 'NFR Round One Recap',
    deck: 'What happened in round one.',
    excerpt: 'Round one summary.',
    heroImage: '/img/round-one.jpg',
    publishedAt: '2026-12-05T02:00:00.000Z',
    updatedAt: '2026-12-06T09:00:00.000Z',
    articleType: 'news',
    author: { name: 'Reporter Name', role: 'Staff Writer' },
    ...over,
  } as never;
}

describe('Stage 09 Task C — Article JSON-LD is factual and complete', () => {
  it('emits the required properties, all derived from the record', () => {
    const ld = seo.articleJsonLd(article());
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('NewsArticle');
    expect(ld.headline).toBe('NFR Round One Recap');
    expect(ld.description).toBe('What happened in round one.');
    expect(String(ld.image)).toContain('/img/round-one.jpg');
    expect(ld.datePublished).toBe('2026-12-05T02:00:00.000Z');
    expect(ld.dateModified).toBe('2026-12-06T09:00:00.000Z');
  });

  it('falls back from deck to excerpt rather than inventing a description', () => {
    expect(seo.articleJsonLd(article({ deck: '' })).description).toBe('Round one summary.');
  });

  it('is Article, not NewsArticle, for an evergreen type', () => {
    // Claiming NewsArticle for a guide would misrepresent the page to a crawler.
    expect(seo.articleJsonLd(article({ articleType: 'guide' }))['@type']).toBe('Article');
  });

  it('uses the publish date as dateModified when there is no update', () => {
    const ld = seo.articleJsonLd(article({ updatedAt: null }));
    expect(ld.dateModified).toBe('2026-12-05T02:00:00.000Z');
  });

  it('emits an absolute image URL, as schema.org requires', () => {
    const img = String(seo.articleJsonLd(article()).image);
    expect(img).toMatch(/^https?:\/\//);
  });

  it('names a Person author only from the record', () => {
    const ld = seo.articleJsonLd(article()) as { author: Record<string, unknown> };
    expect(ld.author['@type']).toBe('Person');
    expect(ld.author.name).toBe('Reporter Name');
    expect(ld.author.jobTitle).toBe('Staff Writer');
  });

  it('fabricates no ratings, offers, awards or results', () => {
    /**
     * The directive is explicit: do not fabricate event dates, competitors,
     * results, awards, ratings, offers, ticket availability or broadcaster
     * information. Asserted over the whole serialized payload, so a future
     * property cannot slip in.
     */
    const json = JSON.stringify(seo.articleJsonLd(article()));
    for (const banned of ['aggregateRating', 'offers', 'award', 'ratingValue', 'price', 'availability', 'broadcast']) {
      expect(json, `${banned} must never appear without a verified source`).not.toContain(banned);
    }
  });
});

describe('Stage 09 Task C — BreadcrumbList JSON-LD', () => {
  it('numbers positions from 1 and emits absolute item URLs', () => {
    const ld = seo.breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Competition', path: '/competition/' },
    ]) as { itemListElement: Record<string, unknown>[] };
    expect(ld['@type' as keyof typeof ld]).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[0].position).toBe(1);
    expect(ld.itemListElement[1].position).toBe(2);
    for (const el of ld.itemListElement) {
      expect(String(el.item)).toMatch(/^https?:\/\//);
    }
  });

  it('is emitted on the routes that have a hierarchy', () => {
    // A breadcrumb that does not match the real hierarchy is worse than none.
    for (const route of [
      'app/(public)/competitors/page.tsx',
      'app/(public)/venues/page.tsx',
      'app/(public)/[section]/page.tsx',
    ]) {
      expect(read(route), `${route} must emit a breadcrumb`).toContain('breadcrumbJsonLd');
    }
  });
});

describe('Stage 09 Task C — FAQ JSON-LD is emitted only when there are real questions', () => {
  it('returns null for an empty list rather than an empty FAQPage', () => {
    expect(seo.faqPageJsonLd([])).toBeNull();
  });

  it('emits a question only when it has both a question and an answer', () => {
    const ld = seo.faqPageJsonLd([
      { question: 'Real question?', answer: 'Real answer.' },
      { question: 'No answer?', answer: '' },
      { question: '', answer: 'Orphan answer.' },
    ]) as { mainEntity: Record<string, unknown>[] } | null;
    expect(ld).not.toBeNull();
    expect(ld!.mainEntity, 'incomplete pairs must be dropped').toHaveLength(1);
  });
});

/* ── 3. Publisher identity is ABSENT, deliberately (D-14) ────────── */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * D-14 — PUBLISHER IDENTITY IS ALREADY BEING ASSERTED. CORRECTION.
 *
 * An earlier pass of this audit reported that no `Organization` or `WebSite`
 * JSON-LD existed anywhere in the codebase, and treated D-14 as a question about
 * whether to ADD publisher markup. **That was wrong**, and these tests record
 * the measured truth instead: `articleJsonLd` and `disciplineJsonLd` each embed
 * a hardcoded
 *
 *     publisher: { '@type': 'Organization', name: 'NFRGuide', url: SITE_URL }
 *
 * so every article page and every discipline page already publishes an
 * organization identity claim in machine-readable markup. The earlier search
 * missed it because it looked for a top-level `Organization` builder; the node is
 * nested inside the Article payload.
 *
 * What that changes about D-14: the decision is not "should we add publisher
 * identity" but "is the identity we are ALREADY claiming correct". Three facts
 * for the owner, all verified against the code:
 *
 *   1. The name is the hardcoded brand string `'NFRGuide'`. It is not read from
 *      `SiteConfig`, not owner-verified, and not a legal entity name.
 *   2. It is duplicated in two builders, so the two could drift apart — a Task A
 *      ownership finding in its own right.
 *   3. There is no `publisher.logo`, which Google's Article guidance asks for.
 *      Absent is the right state while the logo is unverified, but it means the
 *      markup is incomplete as well as unconfirmed.
 *
 * Stage 09 does NOT change this markup. Removing a publisher that has been
 * emitted since Batch A would alter delivered SEO output and could affect
 * rich-result eligibility; inventing a legal name or a logo URL is explicitly
 * forbidden. So the existing claim is pinned exactly as it stands, the absence
 * of SITEWIDE `Organization`/`WebSite` markup is pinned separately, and both go
 * to the owner in Package 3.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('Stage 09 D-14 — the publisher identity already in the markup', () => {
  it('article JSON-LD already claims an Organization publisher', () => {
    const ld = seo.articleJsonLd(article()) as { publisher: Record<string, unknown> };
    expect(ld.publisher, 'this claim is pre-existing, not introduced by Stage 09').toEqual({
      '@type': 'Organization',
      name: 'NFRGuide',
      url: seo.SITE_URL,
    });
  });

  it('the publisher name is a hardcoded brand string, not owner-verified data', () => {
    // Pinned so the Package 3 question is answerable from the code: if the owner
    // corrects the name, exactly these two call sites change.
    const src = read('lib/seo.tsx');
    const claims = [...src.matchAll(/'@type':\s*'Organization',\s*\n\s*name:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(claims, 'two builders each hardcode the same unverified name').toEqual(['NFRGuide', 'NFRGuide']);
    expect(src, 'the name is not sourced from SiteConfig').not.toMatch(/name:\s*siteConfig/);
  });

  it('claims no logo, address, legal name, founding date or contact point', () => {
    /**
     * The honest half of the existing markup: it asserts a name and a URL and
     * stops. Every field that would need owner verification is absent, and must
     * stay absent until D-14 is answered.
     */
    const json = JSON.stringify(seo.articleJsonLd(article())) + JSON.stringify(
      seo.disciplineJsonLd({ name: 'Bull Riding', slug: 'bull-riding', summary: 's', image: '/i.jpg' } as never),
    );
    for (const field of ['logo', 'address', 'legalName', 'foundingDate', 'contactPoint', 'telephone', 'taxID', 'sameAs']) {
      expect(json, `${field} must not be invented`).not.toContain(field);
    }
  });

  it('no SITEWIDE Organization or WebSite JSON-LD is emitted', () => {
    /**
     * The distinct, still-true half of the original finding. A sitewide
     * `Organization` node (typically on the homepage, with a `logo` and
     * `sameAs` profiles) and a `WebSite` node (with `potentialAction` for
     * sitelinks search) are what D-14 would authorise. Neither exists, and
     * neither may be added before approval.
     */
    const layout = read('app/(public)/layout.tsx');
    expect(layout).not.toContain('Organization');
    expect(layout).not.toContain('WebSite');

    const offenders: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && /'@type':\s*'WebSite'/.test(read(rel))) offenders.push(rel);
      }
    };
    walk('app');
    walk('lib');
    walk('views');
    expect(offenders, 'WebSite markup needs D-14 approval').toEqual([]);
  });

  it('the SEO module exports no standalone Organization or WebSite builder', () => {
    // So the only publisher claim in the system stays the nested one above,
    // rather than a second owner appearing alongside it.
    expect(Object.keys(seo).filter((k) => /^(organization|website)/i.test(k))).toEqual([]);
  });
});

/* ── 4. Legal page indexing (Task D / D-13) ──────────────────────── */

describe('Stage 09 Task D — unapproved legal pages are not indexable', () => {
  it('all seven legal pages are still pending review', () => {
    expect(LEGAL_PAGES).toHaveLength(7);
    for (const p of LEGAL_PAGES) {
      expect(p.review, `${p.slug} must not claim approval`).not.toBe('approved');
    }
  });

  it('each one declares the facts it is still missing', () => {
    // So D-13 can be answered from the page's own record rather than a guess.
    for (const p of LEGAL_PAGES) {
      expect(p.ownerInputs.length, `${p.slug} must declare its open questions`).toBeGreaterThan(0);
    }
  });

  it('a pending legal page renders noindex', async () => {
    const { legalPageMetadata } = await import('../views/LegalPageView');
    for (const p of LEGAL_PAGES) {
      const meta = await legalPageMetadata(p.slug);
      const robots = meta.robots as { index?: boolean; follow?: boolean } | undefined;
      expect(robots?.index, `${p.slug} must not be indexable while pending`).toBe(false);
    }
  });

  it('a pending legal page carries a visitor-facing draft notice', () => {
    // The reader is told the wording is not final; that is what makes serving
    // the page at all defensible.
    const view = read('views/LegalPageView.tsx');
    expect(view).toContain('Draft — pending owner and legal review');
    expect(view).toContain('data-legal-review="pending"');
  });

  it('an unknown info slug 404s rather than rendering an empty policy page', async () => {
    expect(getLegalPage('not-a-real-policy')).toBeUndefined();
    const view = read('views/LegalPageView.tsx');
    expect(view).toContain('notFound()');
  });

  it('the canonical path for a legacy slug is its own short URL, not /info/', () => {
    // Two URLs for one policy would be a duplicate; the config pins the short one.
    for (const p of LEGAL_PAGES) {
      expect(p.path, `${p.slug} canonical path`).toBe(`/${p.slug}/`);
    }
  });
});

/* ── 5. Metadata rendering integrity via real routes (Task B) ────── */

describe('Stage 09 Task B — real route metadata, not buildMetadata in isolation', () => {
  it('a directory route produces a canonical, a title and a description', async () => {
    const mod = await import('../app/(public)/competitors/page');
    const meta = await mod.generateMetadata({ searchParams: Promise.resolve({}) } as never);
    expect(meta.alternates?.canonical).toBe(`${seo.SITE_URL}/competitors/`);
    expect(String(meta.title && typeof meta.title === 'object' ? (meta.title as { absolute: string }).absolute : meta.title)).toContain('Competitors');
    expect(meta.description).toBeTruthy();
  });

  it('a FILTERED directory view is noindexed, so facets do not become duplicates', async () => {
    const mod = await import('../app/(public)/competitors/page');
    const filtered = await mod.generateMetadata({ searchParams: Promise.resolve({ q: 'wright' }) } as never);
    expect((filtered.robots as { index?: boolean }).index, 'a search result page must not be indexed').toBe(false);

    const paged = await mod.generateMetadata({ searchParams: Promise.resolve({ page: '2' }) } as never);
    expect((paged.robots as { index?: boolean }).index, 'page 2 must not be indexed').toBe(false);
  });

  it('the unfiltered directory view IS indexable', async () => {
    const mod = await import('../app/(public)/competitors/page');
    const meta = await mod.generateMetadata({ searchParams: Promise.resolve({}) } as never);
    expect((meta.robots as { index?: boolean }).index).toBe(true);
  });

  it('canonical stays on the unfiltered path even for a filtered view', async () => {
    /**
     * Otherwise every facet combination would declare itself canonical and the
     * directory would compete with its own filters.
     */
    const mod = await import('../app/(public)/competitors/page');
    const filtered = await mod.generateMetadata({ searchParams: Promise.resolve({ q: 'x', page: '3' }) } as never);
    expect(filtered.alternates?.canonical).toBe(`${seo.SITE_URL}/competitors/`);
  });

  it('emits exactly one canonical and one robots directive', () => {
    const meta = seo.buildMetadata({ title: 'T', description: 'D', path: '/x/' });
    expect(Object.keys(meta.alternates ?? {})).toEqual(['canonical']);
    const robots = meta.robots as { index: boolean; follow: boolean };
    expect(Object.keys(robots).sort()).toEqual(['follow', 'index']);
  });

  it('every canonical is absolute and on the site origin', () => {
    const meta = seo.buildMetadata({ title: 'T', description: 'D', path: '/articles/x/' });
    expect(String(meta.alternates!.canonical)).toBe(`${seo.SITE_URL}/articles/x/`);
    expect(String(meta.alternates!.canonical)).toMatch(/^https?:\/\//);
  });

  it('does not double-append the brand suffix', () => {
    const plain = seo.buildMetadata({ title: 'Venues', description: 'd', path: '/venues/' });
    const branded = seo.buildMetadata({ title: 'Venues — NFRGuide', description: 'd', path: '/venues/' });
    expect((plain.title as { absolute: string }).absolute).toBe('Venues — NFRGuide');
    expect((branded.title as { absolute: string }).absolute).toBe('Venues — NFRGuide');
  });

  it('Open Graph and Twitter agree with the page title and canonical', () => {
    const meta = seo.buildMetadata({ title: 'T', description: 'D', path: '/p/', image: '/i.jpg' });
    expect(meta.openGraph?.title).toBe('T — NFRGuide');
    expect(String((meta.openGraph as { url?: string }).url)).toBe(`${seo.SITE_URL}/p/`);
    expect((meta.twitter as { card?: string }).card).toBe('summary_large_image');
    expect(String((meta.twitter as { images?: string[] }).images?.[0])).toMatch(/^https?:\/\//);
  });
});

/* ── 6. Sitemap and robots (Task D), DB-backed ───────────────────── */

let available = false;
let prisma: PrismaClient;

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.article.findFirst();
    available = true;
  } catch {
    available = false;
  }
}

describe.runIf(available)('Stage 09 Task D — the sitemap contains only indexable public pages', () => {
  let entries: { url: string }[] = [];

  beforeAll(async () => {
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    entries = (await buildSitemapEntries()) as { url: string }[];
  });

  it('is non-empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('contains no admin, api, preview or auth URL', () => {
    for (const bad of ['/admin', '/api/', '_preview', '/login', '/register', '/account', '/reset-password']) {
      expect(entries.filter((e) => e.url.includes(bad)), `${bad} must not be in the sitemap`).toEqual([]);
    }
  });

  it('contains no duplicate URLs', () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size, 'a duplicate sitemap URL competes with itself').toBe(urls.length);
  });

  it('every URL is absolute and on the site origin', () => {
    for (const e of entries) {
      expect(e.url).toMatch(/^https?:\/\//);
      expect(e.url.startsWith(seo.SITE_URL), `${e.url} must be on the site origin`).toBe(true);
    }
  });

  it('every URL keeps the trailing-slash convention', () => {
    // Next is configured for trailing slashes; a mixed sitemap would advertise
    // URLs that redirect, and a redirecting sitemap entry is a defect.
    for (const e of entries) {
      const pathPart = e.url.slice(seo.SITE_URL.length);
      if (pathPart === '' || pathPart === '/') continue;
      expect(pathPart.endsWith('/'), `${e.url} must end with a slash`).toBe(true);
    }
  });

  it('contains no unapproved legal page', () => {
    /**
     * All seven are `pending-owner-review` and render `noindex`. A noindexed
     * page in a sitemap is a contradictory instruction to a crawler.
     */
    for (const p of LEGAL_PAGES) {
      const hit = entries.filter((e) => e.url.endsWith(p.path));
      expect(hit, `${p.slug} is noindex and must not be in the sitemap`).toEqual([]);
    }
  });

  it('EXPECTED: fixture slugs ARE listed in a test environment', async () => {
    /**
     * Not a defect, and worth pinning so nobody "fixes" it.
     *
     * `lib/fixturePolicy.ts` excludes `fixture-` slugs from public reads only
     * when `appEnv() === 'production'`. In test and CI they stay visible on
     * purpose, so smoke and browser tests can exercise real public routes. A
     * test-environment sitemap therefore SHOULD contain them, and the assertion
     * below would be the wrong one to make here — which is exactly the mistake
     * the first draft of this suite made.
     */
    const { FIXTURE_PREFIX } = await import('../prisma/fixtures');
    const { appEnv } = await import('../lib/env');
    expect(appEnv()).not.toBe('production');
    expect(
      entries.some((e) => e.url.includes(`/${FIXTURE_PREFIX}`)),
      'fixtures are deliberately visible outside production',
    ).toBe(true);
  });

  it('excludes every fixture slug when the app runs as production', async () => {
    /**
     * The guarantee that actually matters, proved end to end rather than by
     * reading the predicate: rebuild the sitemap with `APP_ENV=production` and
     * assert no fixture survives. `appEnv()` reads `process.env` on every call,
     * so the stub takes effect without re-importing, and this is a read-only
     * query against the isolated test database.
     */
    const { FIXTURE_PREFIX } = await import('../prisma/fixtures');
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');

    const previous = process.env.APP_ENV;
    try {
      process.env.APP_ENV = 'production';
      const prod = (await buildSitemapEntries()) as { url: string }[];
      expect(prod.length, 'the production sitemap must not be empty').toBeGreaterThan(0);
      const leaked = prod.filter((e) => e.url.includes(`/${FIXTURE_PREFIX}`));
      expect(leaked.map((e) => e.url), 'a fixture must never be advertised in production').toEqual([]);
      // And the exclusion must be surgical, not a wholesale emptying.
      expect(prod.length).toBeLessThan(entries.length);
    } finally {
      process.env.APP_ENV = previous;
    }
  });
});

afterAll(async () => {
  // This suite writes nothing; nothing to clean up.
});
