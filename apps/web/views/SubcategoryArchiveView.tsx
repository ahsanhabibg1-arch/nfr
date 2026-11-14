import React from 'react';
import Link from 'next/link';
import { EditorialArticleGrid } from '../components/editorial/EditorialArticleGrid';
import { Breadcrumbs } from '../components/editorial/Breadcrumbs';
import type { PublicSubcategory } from '../lib/cms/subcategoryContent';

/**
 * The reader-facing subcategory archive.
 *
 * Deliberately the same shape as a discipline guide — hero, summary, guide
 * prose, then the coverage — because the owner's requirement was that a
 * subcategory page carry everything a discipline page carries. A bare list of
 * headlines would have been easier and would also have been the thin page the
 * indexing threshold exists to keep out of search results.
 *
 * The parent SECTION is not in the URL, so it is shown here instead: in the
 * breadcrumb and as the kicker. Without it a reader landing from search has no
 * way to tell which part of the site they are in.
 */
export function SubcategoryArchiveView({ sub }: { sub: PublicSubcategory }) {
  const guideParagraphs = Array.isArray(sub.guide)
    ? (sub.guide as unknown[]).filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];

  return (
    <>
      <header className="bg-[#0F1115] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <Breadcrumbs
            items={[
              { label: sub.section.name, path: sub.section.path },
              { label: sub.name },
            ]}
            tone="dark"
            className="mb-4"
          />
          <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#D4A757] block mb-2">
            {sub.section.name}
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold leading-[1.15] tracking-tight text-balance">
            {sub.name}
          </h1>
          {(sub.summary || sub.description) && (
            <p className="mt-4 max-w-2xl text-sm sm:text-base font-sans leading-relaxed text-stone-300">
              {sub.summary || sub.description}
            </p>
          )}
          <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center gap-x-10 gap-y-3 text-xs font-sans">
            <span>
              <span className="block text-[10px] uppercase tracking-widest text-stone-400">Published articles</span>
              <span className="text-[#D4A757] font-bold">{sub.articles.length}</span>
            </span>
            {sub.imageCredit && (
              <span>
                <span className="block text-[10px] uppercase tracking-widest text-stone-400">Image</span>
                <span className="text-stone-300">{sub.imageCredit}</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {guideParagraphs.length > 0 && (
          <section className="max-w-3xl mb-10 space-y-4">
            {guideParagraphs.map((p, i) => (
              <p key={i} className="font-sans text-[15px] leading-relaxed text-stone-700">{p}</p>
            ))}
          </section>
        )}

        <h2 className="text-2xl font-serif font-bold text-[#0F1115] mb-6 pb-2 border-b border-stone-200">
          Coverage
        </h2>
        {sub.articles.length > 0 ? (
          <EditorialArticleGrid articles={sub.articles} columns={3} />
        ) : (
          /*
            An empty archive still renders rather than 404ing. The URL may
            already be linked from a section card, and a reader who followed one
            deserves a sentence and a way back, not a dead end. It is `noindex`
            at this point, so no search engine is being shown this.
          */
          <div className="py-10 text-center">
            <p className="font-sans text-sm text-stone-600">
              No published articles in this subcategory yet.
            </p>
            <Link
              href={sub.section.path}
              className="mt-3 inline-block font-sans text-sm font-semibold text-[#8B5E3C] hover:underline"
            >
              Browse all {sub.section.name} coverage &rarr;
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
