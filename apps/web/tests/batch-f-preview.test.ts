import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Phase F — Shared Preview Guard', () => {
  const guardSrc = read('lib/cms/previewGuard.ts');

  it('is a server-only module', () => {
    expect(guardSrc).toMatch(/^import 'server-only'/);
  });

  it('exports isStaffDraftPreview', () => {
    expect(guardSrc).toContain('export async function isStaffDraftPreview');
  });

  it('checks draftMode().isEnabled', () => {
    expect(guardSrc).toContain('draftMode');
    expect(guardSrc).toContain('isEnabled');
  });

  it('checks system.config permission via getCurrentUser and userHasPermission', () => {
    expect(guardSrc).toContain('getCurrentUser');
    expect(guardSrc).toContain('userHasPermission');
    expect(guardSrc).toContain("'system.config'");
  });
});

describe('Phase F — Homepage uses shared guard', () => {
  const homeSrc = read('app/(public)/page.tsx');

  it('imports isStaffDraftPreview from previewGuard', () => {
    expect(homeSrc).toContain("from '@/lib/cms/previewGuard'");
    expect(homeSrc).toContain('isStaffDraftPreview');
  });

  it('does not define a local isStaffDraftPreview', () => {
    expect(homeSrc).not.toContain('async function isStaffDraftPreview');
  });

  it('does not import draftMode or getCurrentUser directly', () => {
    expect(homeSrc).not.toContain("from 'next/headers'");
    expect(homeSrc).not.toContain('getCurrentUser');
  });

  it('still uses getDraftSections and getPublishedSections', () => {
    expect(homeSrc).toContain('getDraftSections');
    expect(homeSrc).toContain('getPublishedSections');
  });

  it('generateMetadata does not reference draft mode', () => {
    const metaFn = homeSrc.slice(
      homeSrc.indexOf('export async function generateMetadata'),
      homeSrc.indexOf('export default'),
    );
    expect(metaFn).not.toContain('draftMode');
    expect(metaFn).not.toContain('getDraftSections');
    expect(metaFn).not.toContain('isStaffDraftPreview');
  });
});

describe('Phase F — Section Landing draft support', () => {
  const resolverSrc = read('lib/cms/sectionLandingData.ts');

  it('resolver imports getDraftSections', () => {
    expect(resolverSrc).toContain('getDraftSections');
  });

  it('resolver accepts options parameter with draft flag', () => {
    expect(resolverSrc).toContain('options?: { draft?: boolean }');
  });

  it('resolver conditionally uses getDraftSections or getPublishedSections', () => {
    expect(resolverSrc).toContain('options?.draft ? getDraftSections : getPublishedSections');
  });

  it('generic section route imports and calls isStaffDraftPreview', () => {
    const src = read('app/(public)/[section]/page.tsx');
    expect(src).toContain("from '@/lib/cms/previewGuard'");
    expect(src).toContain('isStaffDraftPreview');
    expect(src).toContain('draft={draft}');
  });

  it('generic section route generateMetadata does not reference draft mode', () => {
    const src = read('app/(public)/[section]/page.tsx');
    const metaFn = src.slice(
      src.indexOf('export async function generateMetadata'),
      src.indexOf('export default'),
    );
    expect(metaFn).not.toContain('draftMode');
    expect(metaFn).not.toContain('getDraftSections');
    expect(metaFn).not.toContain('isStaffDraftPreview');
  });

  it('dedicated rodeo-events route imports and calls isStaffDraftPreview', () => {
    const src = read('app/(public)/rodeo-events/page.tsx');
    expect(src).toContain("from '@/lib/cms/previewGuard'");
    expect(src).toContain('isStaffDraftPreview');
    expect(src).toContain('draft={draft}');
  });

  it('dedicated rodeo-events route generateMetadata does not reference draft mode', () => {
    const src = read('app/(public)/rodeo-events/page.tsx');
    const metaFn = src.slice(
      src.indexOf('export async function generateMetadata'),
      src.indexOf('export default'),
    );
    expect(metaFn).not.toContain('draftMode');
    expect(metaFn).not.toContain('getDraftSections');
    expect(metaFn).not.toContain('isStaffDraftPreview');
  });

  it('SectionLandingView accepts draft prop', () => {
    const src = read('views/SectionLandingView.tsx');
    expect(src).toContain('draft');
    expect(src).toContain('resolveSectionLandingSlots(sectionKey, { draft })');
  });
});

describe('Phase F — Directory draft support', () => {
  const resolverSrc = read('lib/cms/directoryData.ts');

  it('resolver imports getDraftSections', () => {
    expect(resolverSrc).toContain('getDraftSections');
  });

  it('resolver accepts a draft option [structural]', () => {
    /**
     * Stage 07 Task F widened the directory resolver's options from an inline
     * `{ draft?: boolean }` to a named `ResolveDirectoryOptions` interface, so it
     * could also carry the route's listing data. The draft capability is
     * unchanged; only the type's spelling moved. Draft/published ISOLATION is
     * proven behaviourally against a real stored layout in
     * tests/stage07-renderer-consolidation.test.ts and
     * tests/stage07-directory-template.test.ts.
     */
    expect(resolverSrc).toContain('ResolveDirectoryOptions');
    expect(resolverSrc).toContain('draft?: boolean');
  });

  it('resolver conditionally uses getDraftSections or getPublishedSections', () => {
    expect(resolverSrc).toContain('options?.draft ? getDraftSections : getPublishedSections');
  });

  it('competitors route imports and calls isStaffDraftPreview', () => {
    const src = read('app/(public)/competitors/page.tsx');
    expect(src).toContain("from '@/lib/cms/previewGuard'");
    expect(src).toContain('isStaffDraftPreview');
    // Stage 07: the route now passes `draft` inside the resolver's options
    // object rather than as a bare shorthand property.
    expect(src).toContain('draft,');
  });

  it('competitors generateMetadata does not reference draft mode', () => {
    const src = read('app/(public)/competitors/page.tsx');
    const metaFn = src.slice(
      src.indexOf('export async function generateMetadata'),
      src.indexOf('export default'),
    );
    expect(metaFn).not.toContain('draftMode');
    expect(metaFn).not.toContain('getDraftSections');
    expect(metaFn).not.toContain('isStaffDraftPreview');
  });

  it('venues route imports and calls isStaffDraftPreview', () => {
    const src = read('app/(public)/venues/page.tsx');
    expect(src).toContain("from '@/lib/cms/previewGuard'");
    expect(src).toContain('isStaffDraftPreview');
    expect(src).toContain('draft,');
  });

  it('venues generateMetadata does not reference draft mode', () => {
    const src = read('app/(public)/venues/page.tsx');
    const metaFn = src.slice(
      src.indexOf('export async function generateMetadata'),
      src.indexOf('export default'),
    );
    expect(metaFn).not.toContain('draftMode');
    expect(metaFn).not.toContain('getDraftSections');
    expect(metaFn).not.toContain('isStaffDraftPreview');
  });
});

describe('Phase G — Article Detail draft support', () => {
  it('detailTemplateData imports getDraftSections', () => {
    const src = read('lib/cms/detailTemplateData.ts');
    expect(src).toContain('getDraftSections');
  });

  it('detailTemplateData accepts options parameter with draft flag', () => {
    const src = read('lib/cms/detailTemplateData.ts');
    expect(src).toContain('options?: { draft?: boolean }');
  });

  it('detailTemplateData conditionally uses getDraftSections or getPublishedSections', () => {
    const src = read('lib/cms/detailTemplateData.ts');
    expect(src).toContain('options?.draft ? getDraftSections : getPublishedSections');
  });

  it('ArticleView accepts draft prop and forwards to resolver', () => {
    const src = read('views/ArticleView.tsx');
    expect(src).toContain('draft');
    expect(src).toContain('{ draft }');
  });


/**
 * The article page is TWO files since the flat subcategory route landed.
 *
 * An article is served from `/articles/<slug>/` when it has no subcategory and
 * from `/<subcategory>/<slug>/` when it has one, so the shared body lives in
 * `views/ArticlePageBody.tsx` and both routes render it. These checks are about
 * what the PAGE does, not which file a line sits in, so they read the route and
 * its body together — a capability genuinely deleted from both still fails.
 */
function readArticlePage(): string {
  return [read('app/(public)/articles/[slug]/page.tsx'), read('views/ArticlePageBody.tsx')].join(String.fromCharCode(10));
}

  it('article route imports and calls isStaffDraftPreview', () => {
    const src = readArticlePage();
    expect(src).toContain("from '@/lib/cms/previewGuard'");
    expect(src).toContain('isStaffDraftPreview');
  });

  it('article route generateMetadata does not reference draft mode', () => {
    const src = read('app/(public)/articles/[slug]/page.tsx');
    const metaFn = src.slice(
      src.indexOf('export async function generateMetadata'),
      src.indexOf('export default'),
    );
    expect(metaFn).not.toContain('draftMode');
    expect(metaFn).not.toContain('getDraftSections');
    expect(metaFn).not.toContain('isStaffDraftPreview');
  });

  it('preview route maps template:article to a published article slug', () => {
    const src = read('app/admin/(dashboard)/website/preview/route.ts');
    expect(src).toContain("'template:article'");
    expect(src).toContain('/articles/');
    expect(src).toContain('latest.slug');
  });

  it('preview route does not return 501 for template:article', () => {
    const src = read('app/admin/(dashboard)/website/preview/route.ts');
    expect(src).not.toContain('501');
    expect(src).not.toContain('not yet supported');
  });
});

describe('Phase F — Preview route security', () => {
  const src = read('app/admin/(dashboard)/website/preview/route.ts');

  it('requires authenticated user', () => {
    expect(src).toContain('requireUser');
  });

  it('requires system.config permission', () => {
    expect(src).toContain("'system.config'");
    expect(src).toContain('roleHasPermission');
  });

  it('retains noindex response headers', () => {
    expect(src).toContain("'X-Robots-Tag': 'noindex'");
    expect(src).toContain('noindex, nofollow');
  });

  it('retains no-store cache headers', () => {
    expect(src).toContain('no-store');
    expect(src).toContain('must-revalidate');
  });

  it('validates page key against ADMIN_VISIBLE_PAGE_KEYS (excludes dead keys)', () => {
    expect(src).toContain('ADMIN_VISIBLE_PAGE_KEYS');
    expect(src).not.toMatch(/\bKNOWN_PAGE_KEYS\b/);
  });
});

describe('Phase F — Backward compatibility', () => {
  it('Batch A registry entries intact', () => {
    const src = read('components/blocks/registry.tsx');
    const batchA = [
      'editorial-hero', 'latest-coverage', 'quick-access', 'competition',
      'plan-and-watch', 'entertainment', 'events-shopping', 'more-rodeo', 'learning',
      'rich-text-block', 'image-text-block', 'stats-banner', 'cta-banner', 'faq-block', 'newsletter-signup',
      'landing-hero', 'landing-featured', 'landing-empty', 'landing-grid', 'landing-competition-disciplines',
    ];
    for (const type of batchA) {
      expect(src, `missing Batch A entry: ${type}`).toContain(`'${type}'`);
    }
  });

  it('Phase B entries intact', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).toContain("'detail-related'");
    expect(src).toContain("'detail-cta'");
  });

  it('Phase E entry intact', () => {
    const src = read('components/blocks/registry.tsx');
    expect(src).toContain("'directory-cta'");
  });
});
