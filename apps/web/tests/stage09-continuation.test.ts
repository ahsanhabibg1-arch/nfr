import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stage 09 continuation — Tasks C (structured data) and H (SEO Admin UX).
 *
 * Every test here asserts on COMPUTED or RENDERED output, not on source text:
 * the JSON-LD builders are called, and the two admin components are rendered
 * through `renderToStaticMarkup`. Only the router and the server-action modules
 * are mocked, because neither can run outside a Next request.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  useParams: () => ({}),
}));
vi.mock('../app/admin/landing-seo-actions', () => ({
  upsertEntitySeoAction: vi.fn(),
  createFaqAction: vi.fn(),
  updateFaqAction: vi.fn(),
  deleteFaqAction: vi.fn(),
  setFaqEnabledAction: vi.fn(),
  reorderFaqsAction: vi.fn(),
}));
vi.mock('../app/admin/rodeo-actions', () => ({ updateDisciplineAction: vi.fn() }));
vi.mock('../app/admin/info-page-actions', () => ({
  saveInfoPageDraftAction: vi.fn(),
  submitForReviewAction: vi.fn(),
  approveInfoPageAction: vi.fn(),
  publishInfoPageAction: vi.fn(),
  revertToDraftAction: vi.fn(),
  unpublishInfoPageAction: vi.fn(),
}));

const seo = await import('../lib/seo');
const { SearchAppearancePreview, describeArticleIndexing } = await import('../components/admin/editor/SearchAppearancePreview');
const { AdminLandingSeoPage, effectiveLandingCanonical } = await import('../views/admin/AdminLandingSeoPage');
const { productionCanonicalUrl } = await import('../lib/seo/canonical');

/* ── Task C — structured data URLs and addresses ─────────────────────── */

describe('Stage 09 continuation Task C — JSON-LD url values are absolute', () => {
  it('venueJsonLd turns the route path every caller passes into an absolute URL', () => {
    const ld = seo.venueJsonLd({ name: 'Thomas & Mack Center', url: '/venues/thomas-mack/' });
    expect(ld.url).toBe(`${seo.SITE_URL}/venues/thomas-mack/`);
  });

  it('competitorJsonLd turns the route path into an absolute URL', () => {
    const ld = seo.competitorJsonLd({ name: 'Rider Name', url: '/competitors/rider-name/' });
    expect(ld.url).toBe(`${seo.SITE_URL}/competitors/rider-name/`);
  });

  it('an already-absolute url is left exactly as given (the edition caller)', () => {
    const abs = `${seo.SITE_URL}/rodeo-events/nfr/2026/`;
    const ld = seo.rodeoEditionJsonLd({ name: 'NFR: 2026', startAt: '2026-12-04T00:00:00.000Z', endAt: null, url: abs });
    expect(ld!.url).toBe(abs);
    expect(seo.venueJsonLd({ name: 'X', url: abs }).url).toBe(abs);
  });

  it('every url-bearing node the public routes emit agrees with its breadcrumb item', () => {
    // The breadcrumb's last item and the entity's own url describe the same page;
    // a crawler sees a mismatch when one is relative and the other absolute.
    const path = '/venues/south-point-arena/';
    const crumb = seo.breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'South Point', path }]) as {
      itemListElement: { item: string }[];
    };
    expect(seo.venueJsonLd({ name: 'South Point', url: path }).url).toBe(crumb.itemListElement[1].item);
  });
});

describe('Stage 09 continuation Task C — Event location never asserts an empty address', () => {
  const base = { name: 'NFR: 2026', startAt: '2026-12-04T00:00:00.000Z', endAt: '2026-12-13T00:00:00.000Z', url: '/x/' };

  it('omits PostalAddress when the venue has no stored locality', () => {
    const ld = seo.rodeoEditionJsonLd({ ...base, venue: { name: 'Arena TBC', city: null, state: null, country: null } })!;
    const location = ld.location as Record<string, unknown>;
    expect(location.name).toBe('Arena TBC');
    expect(location, 'an empty PostalAddress asserts nothing').not.toHaveProperty('address');
  });

  it('emits only the locality fields that are stored', () => {
    const ld = seo.rodeoEditionJsonLd({ ...base, venue: { name: 'Thomas & Mack', city: 'Las Vegas', state: null, country: 'US' } })!;
    const address = (ld.location as { address: Record<string, unknown> }).address;
    expect(address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Las Vegas', addressCountry: 'US' });
  });

  it('still emits no Event at all without a verified start date', () => {
    expect(seo.rodeoEditionJsonLd({ ...base, startAt: null })).toBeNull();
  });
});

/* ── Task H — article search-appearance preview ──────────────────────── */

function preview(over: { storedRobots?: string; workflowStatus?: 'draft' | 'published' | 'in_review'; title?: string } = {}) {
  return renderToStaticMarkup(
    React.createElement(SearchAppearancePreview, {
      article: { title: over.title ?? 'Round One Recap', seo: { title: over.title ?? 'Round One Recap', description: 'A summary of round one that is long enough.' } } as never,
      slug: 'round-one-recap',
      storedRobots: over.storedRobots,
      workflowStatus: over.workflowStatus ?? 'published',
    }),
  );
}

describe('Stage 09 continuation Task H — the article preview reports the real indexing state', () => {
  it('no longer prints the hardcoded "index, follow (SSL Enforced)" claim', () => {
    expect(preview({ storedRobots: 'noindex, follow' })).not.toContain('SSL Enforced');
  });

  it('shows the stored noindex directive, exactly as the public route parses it', () => {
    const html = preview({ storedRobots: 'NOINDEX,follow' });
    expect(html).toMatch(/data-testid="seo-robots"[^>]*>noindex, follow</);
    expect(html).toContain('keeps it out of search results and the sitemap');
  });

  it('shows index, follow for the schema default', () => {
    expect(preview({ storedRobots: 'index, follow' })).toMatch(/data-testid="seo-robots"[^>]*>index, follow</);
    expect(preview({ storedRobots: undefined })).toMatch(/data-testid="seo-robots"[^>]*>index, follow</);
  });

  it('a draft is never described as indexable, whatever the directive', () => {
    const html = preview({ storedRobots: 'index, follow', workflowStatus: 'draft' });
    expect(html).toContain('Not public while draft');
    expect(describeArticleIndexing('draft', 'index, follow').indexable).toBe(false);
    expect(describeArticleIndexing('in_review', undefined).note).toContain('Not public while in review');
  });

  it('the indexing verdict matches the public metadata for every directive', async () => {
    const { parseRobotsDirective } = await import('../lib/seo/robots');
    for (const d of ['index, follow', 'noindex', 'none', 'index, nofollow', '', 'max-snippet:-1']) {
      expect(describeArticleIndexing('published', d).indexable, d).toBe(parseRobotsDirective(d).index);
    }
  });

  it('shows the canonical the server stores, from the shared builder', () => {
    expect(preview()).toContain(productionCanonicalUrl('/articles/round-one-recap/'));
  });

  it('shows the title with the brand suffix, as buildMetadata renders it', () => {
    const html = preview({ title: 'Round One Recap' });
    const rendered = (seo.buildMetadata({ title: 'Round One Recap', description: 'd', path: '/a/' }).title as { absolute: string }).absolute;
    expect(rendered).toBe('Round One Recap — NFRGuide');
    expect(html).toContain(rendered);
    // and does not double-append when the brand is already present
    expect(seo.brandedTitle('NFRGuide Picks')).toBe('NFRGuide Picks');
  });
});

/* ── Task H — landing/entity SEO form ────────────────────────────────── */

function landing(canonicalOverride: string | null) {
  return renderToStaticMarkup(
    React.createElement(AdminLandingSeoPage, {
      groups: [],
      selected: {
        entityType: 'VENUE',
        entityId: 'v1',
        label: 'Thomas & Mack',
        publicUrl: '/venues/thomas-mack/',
        canEdit: true,
        seo: { seoTitle: null, metaDescription: null, canonicalOverride, ogImage: null, noindex: false, intro: null },
        faqs: [],
        disciplineFields: null,
      } as never,
    }),
  );
}

describe('Stage 09 continuation Task H — the entity SEO form', () => {
  it('every form label is programmatically associated with a control', () => {
    const html = landing(null);
    const fors = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
    expect(fors.length, 'the five SEO text fields are labelled').toBeGreaterThanOrEqual(5);
    for (const id of fors) {
      expect(html, `label for="${id}" must point at a real control`).toMatch(new RegExp(`<(input|textarea|select)[^>]*\\bid="${id.replace(/[:]/g, '\\:')}"`));
    }
  });

  it('enforces the server length bounds in the browser', () => {
    const html = landing(null);
    for (const n of ['160', '320', '500', '4000']) expect(html).toContain(`maxLength="${n}"`);
  });

  it('shows the self canonical when no override is set', () => {
    expect(landing(null)).toContain(`Effective canonical: ${seo.SITE_URL}/venues/thomas-mack/ (self)`);
  });

  it('warns before save when an override would be refused', () => {
    const html = landing('https://example.org/elsewhere/');
    expect(html).toContain('will be refused on save');
    expect(html).toContain('aria-invalid="true"');
  });

  it('effectiveLandingCanonical agrees with the server rule for each kind of value', () => {
    const site = 'https://nfrguide.com';
    expect(effectiveLandingCanonical('', '/venues/a/', site)).toEqual({ url: `${site}/venues/a/`, source: 'self' });
    expect(effectiveLandingCanonical('/venues/b', '/venues/a/', site)).toEqual({ url: `${site}/venues/b/`, source: 'override' });
    expect(effectiveLandingCanonical('https://evil.example/x/', '/venues/a/', site).source).toBe('invalid');
    expect(effectiveLandingCanonical('javascript:alert(1)', '/venues/a/', site).source).toBe('invalid');
  });

  it('tells the editor that SEO saves go live immediately', () => {
    expect(landing(null)).toContain('SEO fields have no draft step');
  });
});

/* ── Task E/H — InfoPage screen tells the truth about D-09 ───────────── */

const info = await import('../views/admin/AdminInfoPagesPage');

function infoRow(over: Record<string, unknown>) {
  return {
    slug: 'privacy', isLegacy: true, defaultTitle: 'Privacy Policy', defaultDescription: null, hardcodedReview: 'pending-owner-review',
    dbId: 'p1', dbTitle: 'Privacy Policy', dbBody: '<p>x</p>', dbSeoTitle: null, dbMetaDescription: null,
    dbStatus: 'PUBLISHED', dbUpdatedAt: '2026-11-01T00:00:00.000Z', ...over,
  } as never;
}

describe('Stage 09 continuation Task E/H — the InfoPage screen', () => {
  it('explains WHY Edit is disabled on a published page, instead of a silent grey button', () => {
    const html = renderToStaticMarkup(React.createElement(info.AdminInfoPagesPage, { pages: [infoRow({})] }));
    const edit = html.match(/<button[^>]*>Edit<\/button>/)![0];
    expect(edit).toContain('disabled=""');
    expect(edit).toMatch(/aria-describedby="([^"]+)"/);
    const describedBy = edit.match(/aria-describedby="([^"]+)"/)![1];
    expect(html, 'the description element exists and is visible').toMatch(new RegExp(`id="${describedBy.replace(/[:]/g, '\\:')}"[^>]*>Published pages cannot be edited in place`));
  });

  it('does not invent a mechanism: it names the real path and its public cost', () => {
    expect(info.PUBLISHED_EDIT_BLOCKED).toMatch(/Unpublish first/);
    expect(info.PUBLISHED_EDIT_BLOCKED).toMatch(/removes this version from the public site/);
    expect(info.PUBLISHED_EDIT_BLOCKED).not.toMatch(/draft revision/i);
  });

  it('the unpublish confirmation states the actual public effect for each kind of page', () => {
    expect(info.unpublishConsequence({ slug: 'privacy', isLegacy: true, hardcodedReview: 'pending-owner-review' }))
      .toMatch(/falls back to its built-in text, which is still pending legal review/);
    expect(info.unpublishConsequence({ slug: 'faq', isLegacy: false, hardcodedReview: null }))
      .toMatch(/return "not found"/);
  });

  it('a save over an approved or pending page reports that the approval was reset', () => {
    expect(info.saveDraftMessage('APPROVED', false)).toMatch(/approval was reset/);
    expect(info.saveDraftMessage('PENDING_REVIEW', false)).toMatch(/approval was reset/);
    expect(info.saveDraftMessage('DRAFT', false)).toBe('Draft saved.');
    expect(info.saveDraftMessage(null, true)).toBe('Page created as draft.');
  });

  it('a page with no published row shows no published-edit notice', () => {
    const html = renderToStaticMarkup(React.createElement(info.AdminInfoPagesPage, { pages: [infoRow({ dbStatus: 'DRAFT' })] }));
    expect(html).not.toContain('Published pages cannot be edited in place');
    expect(html.match(/<button[^>]*>Edit<\/button>/)![0]).not.toContain('disabled=""');
  });
});
