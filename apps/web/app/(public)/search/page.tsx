import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { runPublicSearch, getSearchFacets } from '@/lib/search/publicSearch';
import type { PublicSearchResult } from '@/lib/search/types';
import { SearchControls } from '@/components/search/SearchControls';
import { SearchHighlight } from '@/components/search/SearchHighlight';
import { TrackedResultLink } from '@/components/analytics/TrackedResultLink';
import { SearchTelemetry } from '@/components/analytics/SearchTelemetry';

/**
 * Public internal search (Batch 07 §3). Server-rendered for SSR + shareable URLs.
 * `noindex, follow` so search result pages are never indexed and do not create
 * duplicate indexable URLs (§3/§5). Visibility is enforced in the engine
 * (published-only); highlighting is data-driven and XSS-safe.
 */
export const metadata: Metadata = {
  title: 'Search · NFRGuide',
  description: 'Search NFRGuide editorial coverage, discipline guides and sections.',
  robots: { index: false, follow: true },
};

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

function ResultCard({ r, query, tokens, position }: { r: PublicSearchResult; query: string; tokens: string[]; position: number }) {
  return (
    <li className="group">
      <TrackedResultLink
        href={r.url}
        query={query}
        entityType={r.analyticsEntityType}
        entityId={r.id}
        position={position}
        className="block p-4 bg-white border border-stone-200 rounded-sm hover:border-[#D4A757] transition-colors"
      >
        <div className="flex items-center gap-2 text-[11px] font-sans text-stone-500">
          <span className="font-semibold text-[#8B5E3C] uppercase tracking-wider">{r.contentType}</span>
          {r.category && (
            <>
              <span>&middot;</span>
              <span>{r.category}</span>
            </>
          )}
          {r.date && (
            <>
              <span>&middot;</span>
              <time dateTime={r.date}>{new Date(r.date).toISOString().slice(0, 10)}</time>
            </>
          )}
        </div>
        <h3 className="text-base font-serif font-semibold text-stone-900 mt-1 group-hover:text-[#8B5E3C]">
          <SearchHighlight text={r.title} tokens={tokens} maxLen={140} />
        </h3>
        {r.excerpt && (
          <p className="text-sm text-stone-600 mt-1 font-sans line-clamp-2">
            <SearchHighlight text={r.excerpt} tokens={tokens} maxLen={240} />
          </p>
        )}
      </TrackedResultLink>
    </li>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const result = await runPublicSearch({
    q: str(sp.q),
    type: str(sp.type) as never,
    category: str(sp.category) || null,
    discipline: str(sp.discipline) || null,
    sort: str(sp.sort) as never,
    page: Number(str(sp.page)) || 1,
  });
  const facets = await getSearchFacets();
  const { filters } = result;

  function pageHref(page: number): string {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.category) params.set('category', filters.category);
    if (filters.discipline) params.set('discipline', filters.discipline);
    if (filters.sort !== 'relevance') params.set('sort', filters.sort);
    if (page > 1) params.set('page', String(page));
    return `/search/${params.toString() ? `?${params.toString()}` : ''}`;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-stone-900">Search</h1>
        <p className="text-sm text-stone-500 font-sans mt-1">
          Published editorial coverage, discipline guides and sections.
        </p>
      </div>

      <SearchControls
        initialQuery={result.query}
        type={filters.type}
        category={filters.category ?? ''}
        discipline={filters.discipline ?? ''}
        sort={filters.sort}
        categories={facets.categories}
        disciplines={facets.disciplines}
      />

      <div className="mt-8">
        {result.emptyQuery ? (
          <div className="text-center py-14 text-stone-500 font-sans">
            <p className="text-sm">Enter a search term above to explore NFRGuide coverage.</p>
            <p className="text-xs text-stone-400 mt-1">Try &ldquo;bull riding&rdquo;, &ldquo;streaming&rdquo;, or &ldquo;tickets&rdquo;.</p>
          </div>
        ) : result.zeroResult ? (
          <>
            <SearchTelemetry query={result.normalizedQuery} resultCount={0} zeroResult contentType={filters.type} />
            <div className="text-center py-14 text-stone-500 font-sans">
              <p className="text-sm">
                No results for &ldquo;<span className="font-semibold text-stone-700">{result.query}</span>&rdquo;.
              </p>
              <p className="text-xs text-stone-400 mt-1">Check spelling or try a broader term.</p>
            </div>
          </>
        ) : (
          <>
            <SearchTelemetry
              query={result.normalizedQuery}
              resultCount={result.totalResults}
              zeroResult={false}
              contentType={filters.type}
            />
            <p className="text-xs font-mono text-stone-500 mb-4">
              {result.totalResults} result{result.totalResults === 1 ? '' : 's'} for &ldquo;{result.query}&rdquo;
            </p>

            {result.sections.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">Sections</h2>
                <ul className="flex flex-wrap gap-2">
                  {result.sections.map((s, i) => (
                    <li key={s.id}>
                      <TrackedResultLink
                        href={s.url}
                        query={result.normalizedQuery}
                        entityType="SECTION"
                        entityId={s.id}
                        position={i + 1}
                        className="inline-block px-3 py-1.5 bg-[#EDE6D6]/60 border border-stone-300 rounded-sm text-sm font-sans text-stone-800 hover:border-[#D4A757]"
                      >
                        {s.title}
                      </TrackedResultLink>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.disciplines.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">Discipline Guides</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.disciplines.map((d, i) => (
                    <ResultCard key={d.id} r={d} query={result.normalizedQuery} tokens={result.tokens} position={i + 1} />
                  ))}
                </ul>
              </section>
            )}

            {result.rodeo.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">Rodeo Hubs, Events &amp; Editions</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.rodeo.map((r, i) => (
                    <ResultCard key={r.id} r={r} query={result.normalizedQuery} tokens={result.tokens} position={i + 1} />
                  ))}
                </ul>
              </section>
            )}

            {result.articles.rows.length > 0 && (
              <section>
                {(result.sections.length > 0 || result.disciplines.length > 0) && (
                  <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">Articles</h2>
                )}
                <ul className="space-y-3">
                  {result.articles.rows.map((r, i) => (
                    <ResultCard key={r.id} r={r} query={result.normalizedQuery} tokens={result.tokens} position={(filters.page - 1) * filters.pageSize + i + 1} />
                  ))}
                </ul>

                {result.articles.totalPages > 1 && (
                  <nav className="flex items-center justify-between mt-6 text-xs font-mono" aria-label="Search results pages">
                    {filters.page > 1 ? (
                      <Link href={pageHref(filters.page - 1)} className="px-3 py-1.5 border border-stone-300 rounded-xs bg-white hover:border-[#D4A757]">
                        ← Prev
                      </Link>
                    ) : (
                      <span className="px-3 py-1.5 border border-stone-200 rounded-xs text-stone-300">← Prev</span>
                    )}
                    <span className="text-stone-500">
                      Page {filters.page} of {result.articles.totalPages}
                    </span>
                    {filters.page < result.articles.totalPages ? (
                      <Link href={pageHref(filters.page + 1)} className="px-3 py-1.5 border border-stone-300 rounded-xs bg-white hover:border-[#D4A757]">
                        Next →
                      </Link>
                    ) : (
                      <span className="px-3 py-1.5 border border-stone-200 rounded-xs text-stone-300">Next →</span>
                    )}
                  </nav>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
