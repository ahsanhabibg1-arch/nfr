import React from 'react';
import Link from 'next/link';
import { Article } from '../types';
import { getRelatedPublishedArticles } from '../lib/content';
import { ArticleHeader } from '../components/editorial/ArticleHeader';
import { ArticleBody } from '../components/editorial/ArticleBody';
import { TableOfContents, TOCItem } from '../components/editorial/TableOfContents';
import { AuthorBio } from '../components/editorial/AuthorBio';
import { SourceList } from '../components/editorial/SourceList';
import { RelatedArticles } from '../components/editorial/RelatedArticles';
import { DisclosureBanner } from '../components/editorial/DisclosureBanner';
import { ROUTES } from '../config/routes';

/**
 * Server component (Batch 01 §10). Receives an already-eligibility-checked,
 * published article from the route. The Phase 0 "Phase 0 Route" prototype banner
 * has been removed (Batch 01 §14).
 */
export async function ArticleView({ article }: { article: Article }) {
  const tocItems: TOCItem[] = (article.structuredBody || [])
    .filter(
      (block): block is { type: 'heading'; level: 2 | 3; text: string; id?: string } =>
        block.type === 'heading',
    )
    .map((block) => ({
      id: block.id || block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      text: block.text,
      level: block.level,
    }));

  const related = await getRelatedPublishedArticles(article.id, 3);

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115] py-8 sm:py-12">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Article Grid: Desktop Asymmetric Reading Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-start">
          {/* Main Reading Column */}
          <article className="lg:col-span-8 max-w-[740px]">
            <ArticleHeader article={article} />

            {/* Key Takeaways Callout (if present) */}
            {article.takeaways && article.takeaways.length > 0 && (
              <div className="my-8 p-6 bg-white border border-stone-300 rounded-sm shadow-2xs">
                <h2 className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8B5E3C]" aria-hidden="true" />
                  Key Editorial Takeaways
                </h2>
                <ul className="space-y-2 text-sm text-stone-700 font-sans list-none p-0 m-0">
                  {article.takeaways.map((takeaway, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="text-[#D4A757] font-bold mt-0.5" aria-hidden="true">&bull;</span>
                      <span>{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Mobile/Tablet Inline Table of Contents */}
            {tocItems.length > 0 && (
              <div className="lg:hidden my-6">
                <TableOfContents items={tocItems} />
              </div>
            )}

            {/* Article Body (Safe Structured Blocks) */}
            <ArticleBody article={article} className="mt-8" />

            {/* Disclosure Notice */}
            <div className="mt-10">
              <DisclosureBanner
                type={article.disclosure || 'editorial-independent'}
                customNote={article.disclosureNote}
              />
            </div>

            {/* Author Biography */}
            <div className="mt-8">
              <AuthorBio author={article.author} />
            </div>

            {/* Fact-Checked Sources & References */}
            {article.sources && article.sources.length > 0 && (
              <div className="mt-8">
                <SourceList sources={article.sources} />
              </div>
            )}
          </article>

          {/* Desktop Sidebar Rail */}
          <aside className="hidden lg:block lg:col-span-4 space-y-6">
            {tocItems.length > 0 && <TableOfContents items={tocItems} isSticky />}

            {/* Quick Department Link */}
            <div className="p-5 bg-white border border-stone-200 rounded-sm">
              <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block mb-1">
                Department
              </span>
              <h3 className="text-sm font-serif font-bold text-stone-900 mb-1">
                {article.category}
              </h3>
              <p className="text-xs text-stone-600 font-sans mb-3 leading-relaxed">
                Explore complete championship analysis and reporting for this category.
              </p>
              <Link
                href={ROUTES.CATEGORY(article.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}
                className="text-xs font-semibold text-[#8B5E3C] hover:text-stone-950 transition-colors inline-flex items-center gap-1"
              >
                View Category Archive &rarr;
              </Link>
            </div>

            {/* Editorial Advisory Box */}
            <div className="p-5 bg-[#EDE6D6]/50 border border-stone-300 rounded-sm text-xs font-sans text-stone-700">
              <strong className="block text-stone-900 font-semibold mb-1">
                Independent Editorial Standards
              </strong>
              <p className="text-[11px] leading-relaxed text-stone-600">
                NFRGuide maintains full editorial control over all championship analysis, livestock evaluations, and spectator guides.
              </p>
            </div>
          </aside>
        </div>

        {/* Related Championship Articles */}
        <RelatedArticles articles={related} />
      </div>
    </div>
  );
}

export default ArticleView;
