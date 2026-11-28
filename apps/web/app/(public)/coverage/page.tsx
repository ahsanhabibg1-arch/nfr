import type { Metadata } from 'next';
import Link from 'next/link';
import {
  listCoverageArticles,
  listCoverageCategories,
  COVERAGE_SORTS,
  type CoverageSort,
} from '@/lib/content';
import { getPublished } from '@/lib/cms/siteConfigService';
import type { CoverageConfig } from '@/lib/cms/siteConfigService';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { HomeArticleFeed } from '@/components/sections/HomeArticleFeed';

/**
 * `/coverage/` — the site-wide editorial archive (Stage 06-R, R-04).
 *
 * WHY IT EXISTS. The homepage's "View All Coverage" call to action had nowhere
 * to go: no site-wide archive route existed, so the control rendered as a
 * `<button>` that only reset a client-side filter. This is that destination.
 *
 * SERVER-RENDERED ON PURPOSE. Filtering, search, sorting and pagination are all
 * driven by `searchParams` and rendered as ordinary `<a>` links, so the archive
 * works with JavaScript disabled, is crawlable, and never ships the whole
 * article set to the browser to filter it there. Queries are bounded in
 * `listCoverageArticles`.
 *
 * It reuses the public layout, the existing card grid (`HomeArticleFeed`), the
 * shared eligibility predicate and the shared SEO/breadcrumb helpers. It adds
 * no article storage and changes no existing URL.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const revalidate = 60;

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v ?? '').trim();

const DEFAULT_HEADING = 'NFR Coverage Archive';
const DEFAULT_INTRO =
  'Every published NFRGuide article — competition, entertainment, events, planning and rodeo history — newest first.';

async function config(): Promise<CoverageConfig> {
  try {
    return await getPublished<CoverageConfig>('coverage');
  } catch {
    // The archive must render even if its optional settings row is unavailable.
    return {};
  }
}

/**
 * SEO policy for this archive, stated once so it cannot drift:
 *
 *   - the BASE archive is self-canonical and indexable;
 *   - PAGE 2+ is self-canonical too — those pages list different articles, so
 *     canonicalising them to page 1 would ask Google to drop real content —
 *     but they are not added to the sitemap;
 *   - CATEGORY-FILTERED views are canonical to the existing `/categories/<slug>/`
 *     archive, which is the established home for that content, so this route
 *     cannot mint a competing landing page for every category;
 *   - SEARCH and SORT views are `noindex, follow`. They are an unbounded
 *     combinatorial space and exactly the duplicate-crawl-path problem the SEO
 *     brief warns about. `follow` keeps the article links crawlable.
 */
function seoFor(page: number, q: string, categorySlug: string, sort: CoverageSort, outOfRange: boolean) {
  /**
   * FILTERED VIEWS — search, sort AND category — are `noindex, follow`,
   * canonical to the base archive.
   *
   * Category was briefly canonicalised to `/categories/<slug>/`. That was
   * wrong twice over: `?category=x&page=2` is not the same content as page one
   * of the category archive, and the two listings do not even share a page
   * size, so the canonical pointed at materially different content. Treating
   * every filter the same way removes the special case — the category archive
   * stays the indexable home for that content, and `follow` keeps every
   * article link here crawlable.
   */
  if (q.length > 0 || sort !== 'newest' || categorySlug) {
    return { path: '/coverage/', noindex: true };
  }

  /**
   * OUT-OF-RANGE pages are `noindex` and canonical to the base.
   *
   * `?page=99999` serves the last page's content, so leaving it indexable with
   * a self-canonical would mint an unlimited supply of indexable duplicates of
   * that page — exactly the unbounded crawl space this policy exists to
   * prevent. Real pages keep their own page-specific canonical, because they
   * list genuinely different articles.
   */
  if (outOfRange) return { path: '/coverage/', noindex: true };

  return { path: page > 1 ? `/coverage/?page=${page}` : '/coverage/', noindex: false };
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const cfg = await config();
  const q = one(sp.q);
  const categorySlug = one(sp.category);
  const sort = (COVERAGE_SORTS as readonly string[]).includes(one(sp.sort))
    ? (one(sp.sort) as CoverageSort)
    : 'newest';
  const page = Math.max(1, Number.parseInt(one(sp.page) || '1', 10) || 1);

  /**
   * Whether the requested page actually exists. Only asked when a page beyond
   * the first is requested and no filter is active — the filtered branch is
   * `noindex` regardless, so there is nothing to decide and no query to run.
   */
  let outOfRange = false;
  if (page > 1 && !q && !categorySlug && sort === 'newest') {
    const probe = await listCoverageArticles({ page, pageSize: cfg.pageSize });
    outOfRange = page > probe.totalPages;
  }

  const { path, noindex } = seoFor(page, q, categorySlug, sort, outOfRange);

  const heading = cfg.heading?.trim() || DEFAULT_HEADING;
  const title = cfg.seoTitle?.trim() || (page > 1 ? `${heading} — Page ${page}` : heading);

  return buildMetadata({
    title,
    description: cfg.metaDescription?.trim() || cfg.intro?.trim() || DEFAULT_INTRO,
    path,
    noindex: noindex || cfg.noindex === true,
  });
}

export default async function CoveragePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const cfg = await config();

  const q = one(sp.q);
  const categorySlug = one(sp.category);
  const sortRaw = one(sp.sort);
  const sort: CoverageSort = (COVERAGE_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as CoverageSort)
    : 'newest';
  // A non-numeric or negative `page` degrades to 1 rather than erroring.
  const requestedPage = Number.parseInt(one(sp.page) || '1', 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [result, categories] = await Promise.all([
    listCoverageArticles({ q, categorySlug, sort, page, pageSize: cfg.pageSize }),
    listCoverageCategories(),
  ]);

  const heading = cfg.heading?.trim() || DEFAULT_HEADING;
  const intro = cfg.intro?.trim() || DEFAULT_INTRO;

  /** Build a link that keeps the other filters intact. */
  const href = (patch: Record<string, string | number | undefined>): string => {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      q: result.applied.q || undefined,
      category: result.applied.categorySlug || undefined,
      sort: result.applied.sort === 'newest' ? undefined : result.applied.sort,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `/coverage/?${qs}` : '/coverage/';
  };

  const activeCategory = categories.find((c) => c.slug === result.applied.categorySlug);
  const crumb = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: heading, path: '/coverage/' },
  ]);

  const chip = (active: boolean) =>
    `px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap ${
      active
        ? 'bg-[#0F1115] text-[#D4A757]'
        : 'bg-white/80 text-stone-600 hover:text-stone-900 hover:bg-white border border-stone-200'
    }`;

  return (
    <>
      <JsonLd data={crumb} />
      <section className="w-full bg-[#F7F3EA] text-[#0F1115] py-14">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-4 text-xs font-sans text-stone-600">
            <Link href="/" className="hover:text-[#8B5E3C]">Home</Link>
            <span className="mx-1.5" aria-hidden="true">/</span>
            <span aria-current="page" className="text-stone-900">{heading}</span>
          </nav>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-medium tracking-tight text-balance">
            {heading}
          </h1>
          {intro && <p className="mt-3 max-w-2xl text-sm sm:text-base font-sans text-stone-600 leading-relaxed">{intro}</p>}

          {/* Search — a real GET form, so it works without JavaScript. */}
          <form action="/coverage/" method="get" role="search" className="mt-8 flex flex-wrap gap-2 items-center">
            <label htmlFor="coverage-q" className="sr-only">Search coverage</label>
            <input
              id="coverage-q"
              type="search"
              name="q"
              defaultValue={result.applied.q}
              placeholder="Search articles…"
              className="flex-1 min-w-[12rem] max-w-sm px-3 py-2 text-sm font-sans bg-white border border-stone-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#8B5E3C]"
            />
            {/* Preserve the other filters across a search submit. */}
            {result.applied.categorySlug && <input type="hidden" name="category" value={result.applied.categorySlug} />}
            {result.applied.sort !== 'newest' && <input type="hidden" name="sort" value={result.applied.sort} />}
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-[#0F1115] text-[#D4A757] rounded-sm hover:bg-black transition-colors"
            >
              Search
            </button>
            {result.applied.q && (
              <Link href={href({ q: undefined, page: 1 })} className="text-xs font-sans text-[#8B5E3C] hover:underline">
                Clear search
              </Link>
            )}
          </form>

          {/* Category filter */}
          {categories.length > 0 && (
            <div className="mt-6">
              <h2 className="sr-only">Filter by category</h2>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-3 scrollbar-none">
                <Link href={href({ category: undefined, page: 1 })} className={chip(!result.applied.categorySlug)}>
                  All
                </Link>
                {categories.map((c) => (
                  <Link
                    key={c.slug}
                    href={href({ category: c.slug, page: 1 })}
                    className={chip(result.applied.categorySlug === c.slug)}
                    aria-current={result.applied.categorySlug === c.slug ? 'true' : undefined}
                  >
                    {c.name} ({c.count})
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Sort */}
          <div className="mt-2 flex items-center gap-2 border-b border-stone-200 pb-4 mb-8">
            <h2 className="sr-only">Sort</h2>
            <span className="text-xs font-sans text-stone-500 uppercase tracking-wider">Sort</span>
            {([
              ['newest', 'Newest'],
              ['oldest', 'Oldest'],
              ['title', 'A–Z'],
            ] as const).map(([value, label]) => (
              <Link
                key={value}
                href={href({ sort: value === 'newest' ? undefined : value, page: 1 })}
                className={chip(result.applied.sort === value)}
                aria-current={result.applied.sort === value ? 'true' : undefined}
              >
                {label}
              </Link>
            ))}
            <span className="ml-auto text-xs font-sans text-stone-500">
              {result.total} article{result.total === 1 ? '' : 's'}
              {activeCategory ? ` in ${activeCategory.name}` : ''}
            </span>
          </div>

          {result.articles.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-stone-300 bg-white rounded-sm text-sm font-sans text-stone-600">
              <p>
                {result.applied.q
                  ? `No published articles match “${result.applied.q}”.`
                  : 'No published articles match these filters yet.'}
              </p>
              <Link href="/coverage/" className="mt-3 inline-block text-xs font-semibold text-[#8B5E3C] hover:underline">
                Clear all filters &rarr;
              </Link>
            </div>
          ) : (
            <HomeArticleFeed
              articles={result.articles}
              sectionPath="/coverage/"
              sectionName="Coverage"
              columns={3}
            />
          )}

          {/* Pagination — real links, with rel hints for crawlers. */}
          {result.totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-4 text-xs font-sans">
              {result.page > 1 ? (
                <Link href={href({ page: result.page - 1 })} rel="prev" className="px-4 py-2 border border-stone-300 bg-white rounded-sm hover:border-[#8B5E3C]">
                  &larr; Previous
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
              <span className="text-stone-600">
                Page {result.page} of {result.totalPages}
              </span>
              {result.page < result.totalPages ? (
                <Link href={href({ page: result.page + 1 })} rel="next" className="px-4 py-2 border border-stone-300 bg-white rounded-sm hover:border-[#8B5E3C]">
                  Next &rarr;
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
