import { describe, it, expect } from 'vitest';

/**
 * Stage 03 Task E — SEO metadata causation pattern.
 *
 * BEHAVIOUR PROVEN: a stored EntitySeo override reaches the metadata a route
 * emits, and the indexing policy cannot be widened by an editor.
 *
 * The existing suite tests `mergeSeoMeta` in isolation and separately asserts
 * that route files contain the string `generateMetadata`. Neither proves the
 * override actually surfaces. This establishes the reusable pattern; Stage 09
 * applies it to every page family.
 *
 * The SEO engine is NOT modified — this stage only observes it.
 */

const { mergeSeoMeta } = await import('../lib/cms/entitySeoService');
const { buildMetadata } = await import('../lib/seo');

/** Shapes taken from the real contract (lib/cms/entitySeoService.ts). */
type StoredSeo = Parameters<typeof mergeSeoMeta>[0];
type DerivedMeta = Parameters<typeof mergeSeoMeta>[1];

const DERIVED: DerivedMeta = {
  title: 'Derived Title From Entity Data',
  description: 'Derived description from entity data.',
  path: '/derived/path/',
};

function storedSeo(over: Partial<Record<string, unknown>>): StoredSeo {
  return {
    entityType: 'SECTION', entityId: 'stage03-entity',
    seoTitle: null, metaDescription: null, canonicalOverride: null, ogImage: null, noindex: false,
    intro: null, updatedAt: new Date(), id: 'stage03-seo', createdAt: new Date(), updatedById: null,
    ...over,
  } as unknown as StoredSeo;
}

describe('Stage 03 Task E — an EntitySeo override reaches emitted metadata', () => {
  it('a stored seoTitle replaces the derived title', () => {
    const merged = mergeSeoMeta(storedSeo({ seoTitle: 'ZzStage03SeoTitle' }), DERIVED);
    expect(merged.title).toBe('ZzStage03SeoTitle');
  });

  it('a stored metaDescription replaces the derived description', () => {
    const merged = mergeSeoMeta(storedSeo({ metaDescription: 'ZzStage03SeoDescription' }), DERIVED);
    expect(merged.description).toBe('ZzStage03SeoDescription');
  });

  it('with no override, the derived values survive untouched', () => {
    const merged = mergeSeoMeta(storedSeo({}), DERIVED);
    expect(merged.title).toBe(DERIVED.title);
    expect(merged.description).toBe(DERIVED.description);
  });

  it('the override survives all the way into buildMetadata output', () => {
    // This is the causation link the old suite never made: merged values must
    // appear in the object a route's generateMetadata actually returns.
    const merged = mergeSeoMeta(storedSeo({ seoTitle: 'ZzStage03EndToEnd' }), DERIVED);
    const meta = buildMetadata(merged);

    expect(JSON.stringify(meta)).toContain('ZzStage03EndToEnd');
    // buildMetadata emits Next's absolute-title form with the site suffix applied,
    // so the override must appear inside it rather than replace it wholesale.
    expect((meta.title as { absolute: string }).absolute).toContain('ZzStage03EndToEnd');
    expect((meta.title as { absolute: string }).absolute).toContain('NFRGuide');
  });

  it('the override also reaches the Open Graph and Twitter blocks', () => {
    const merged = mergeSeoMeta(storedSeo({ seoTitle: 'ZzStage03Social', metaDescription: 'ZzStage03SocialDesc' }), DERIVED);
    const meta = buildMetadata(merged);
    expect(JSON.stringify(meta.openGraph)).toContain('ZzStage03Social');
    expect(JSON.stringify(meta.twitter)).toContain('ZzStage03Social');
  });

  it('an empty-string override does NOT blank the derived value', () => {
    const merged = mergeSeoMeta(storedSeo({ seoTitle: '' }), DERIVED);
    expect(merged.title).toBe(DERIVED.title);
  });
});

describe('Stage 03 Task E — indexing policy cannot be widened by an editor', () => {
  it('a stored noindex is honoured', () => {
    const merged = mergeSeoMeta(storedSeo({ noindex: true }), DERIVED);
    expect(merged.robots?.index).toBe(false);
  });

  it('noindex is ADDITIVE ONLY — an editor cannot force-index content policy excludes', () => {
    // The protective property of the existing engine. If this ever inverts, an
    // editor could publish content the indexing policy intends to withhold.
    // Content-based exclusion is signalled by `derivedNoindex`.
    const merged = mergeSeoMeta(storedSeo({ noindex: false }), { ...DERIVED, derivedNoindex: true });
    expect(merged.robots?.index, 'an editor widened the indexing policy').toBe(false);
  });

  it('content-based noindex is nofollow, while editor noindex keeps follow', () => {
    // The two exclusion sources carry different follow semantics by design.
    const contentExcluded = mergeSeoMeta(storedSeo({ noindex: false }), { ...DERIVED, derivedNoindex: true });
    const editorExcluded = mergeSeoMeta(storedSeo({ noindex: true }), DERIVED);
    expect(contentExcluded.robots?.follow).toBe(false);
    expect(editorExcluded.robots?.follow).toBe(true);
  });

  it('a noindex override keeps follow semantics rather than hard nofollow', () => {
    const merged = mergeSeoMeta(storedSeo({ noindex: true }), DERIVED);
    expect(merged.robots?.follow).toBe(true);
  });
});

describe('Stage 03 Task E — negative control', () => {
  it('a sentinel that was never stored does not appear in output', () => {
    const merged = mergeSeoMeta(storedSeo({ seoTitle: 'ZzStage03Present' }), DERIVED);
    const meta = buildMetadata({ title: merged.title, description: merged.description, canonicalPath: '/x/' } as never);
    expect(JSON.stringify(meta)).not.toContain('ZzStage03Absent');
  });
});
