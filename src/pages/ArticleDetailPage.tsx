import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getArticleBySlug, getRelatedArticles, ALL_ARTICLES } from '../data/mockEditorialData';
import { articleStore } from '../data/articleStore';
import { ArticleHeader } from '../components/editorial/ArticleHeader';
import { ArticleBody } from '../components/editorial/ArticleBody';
import { TableOfContents, TOCItem } from '../components/editorial/TableOfContents';
import { AuthorBio } from '../components/editorial/AuthorBio';
import { SourceList } from '../components/editorial/SourceList';
import { RelatedArticles } from '../components/editorial/RelatedArticles';
import { DisclosureBanner } from '../components/editorial/DisclosureBanner';
import { useSEO } from '../utils/seo';
import { ROUTES } from '../config/routes';

import { isArticlePubliclyEligible, evaluateArticleEligibility } from '../utils/contentEligibility';

export const ArticleDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const article = useMemo(() => {
    return slug ? (articleStore.getArticleBySlug(slug) || getArticleBySlug(slug)) : undefined;
  }, [slug]);

  const eligibility = useMemo(() => {
    return evaluateArticleEligibility(article);
  }, [article]);

  // Extract headings for Table of Contents
  const tocItems: TOCItem[] = useMemo(() => {
    if (!article?.structuredBody || !eligibility.isEligible) return [];
    return article.structuredBody
      .filter((block): block is { type: 'heading'; level: 2 | 3; text: string; id?: string } => block.type === 'heading')
      .map((block) => ({
        id: block.id || block.text.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        text: block.text,
        level: block.level,
      }));
  }, [article, eligibility.isEligible]);

  const related = useMemo(() => {
    if (!article || !eligibility.isEligible) return [];
    return getRelatedArticles(article.id, 3);
  }, [article, eligibility.isEligible]);

  // SEO Schema.org JSON-LD structured data for article (only for published articles)
  const jsonLd = useMemo(() => {
    if (!article || !eligibility.isEligible) return undefined;
    return {
      '@context': 'https://schema.org',
      '@type': article.articleType === 'news' ? 'NewsArticle' : 'Article',
      headline: article.title,
      description: article.deck || article.excerpt,
      image: article.heroImage,
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
        url: 'https://nfrguide.com',
      },
      articleSection: article.category,
    };
  }, [article, eligibility.isEligible]);

  useSEO({
    title: article && eligibility.isEligible ? `${article.title} — NFRGuide` : (article ? 'Dispatch Unavailable — NFRGuide' : 'Article Not Found — NFRGuide'),
    description: article && eligibility.isEligible ? (article.deck || 'Independent rodeo journalism and championship analysis from NFRGuide.') : 'The requested editorial dispatch is currently unavailable.',
    canonicalPath: article && eligibility.isEligible ? ROUTES.ARTICLE(article.slug) : undefined,
    ogType: 'article',
    ogImage: eligibility.isEligible ? article?.heroImage : undefined,
    publishedTime: eligibility.isEligible ? article?.publishedAt : undefined,
    authorName: eligibility.isEligible ? article?.author.name : undefined,
    jsonLd,
  });

  if (!article) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-serif font-bold text-stone-900 mb-2">
          Editorial Dispatch Not Found
        </h1>
        <p className="text-sm text-stone-600 font-sans mb-6">
          The requested article slug &ldquo;{slug}&rdquo; does not exist in the Phase 0 demonstration catalog.
        </p>
        <Link
          to="/"
          className="inline-flex px-5 py-2.5 bg-[#0F1115] text-[#D4A757] font-semibold text-xs uppercase tracking-wider rounded-sm hover:bg-stone-800 transition"
        >
          Return to Homepage
        </Link>
      </div>
    );
  }

  // If article exists but is in draft/review/approved/scheduled/archived state
  if (!eligibility.isEligible) {
    return (
      <div className="max-w-[760px] mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-serif font-bold text-stone-900 mb-3">
          Dispatch Unavailable
        </h1>
        <p className="text-base text-stone-600 font-sans max-w-md mx-auto mb-8 leading-relaxed">
          The requested editorial dispatch is currently unavailable or has not been published to the public catalog.
        </p>
        <Link
          to="/"
          className="inline-flex px-5 py-2.5 bg-[#0F1115] text-[#D4A757] font-semibold text-xs uppercase tracking-wider rounded-sm hover:bg-stone-800 transition shadow-xs"
        >
          Return to Homepage
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115] py-8 sm:py-12">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Prototype Header Notice */}
        <div className="mb-6 p-3 bg-white border border-stone-200 rounded-sm flex items-center justify-between text-xs font-sans text-stone-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D4A757]" aria-hidden="true" />
            <strong className="text-stone-900">Dedicated Article View:</strong>
            <span>You are viewing the dedicated long-form editorial template for NFRGuide.</span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400">
            Phase 0 Route
          </span>
        </div>

        {/* Main Article Grid: Desktop Asymmetric Reading Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-start">
          {/* Main Reading Column (Col 1-8 / 720px wide standard reading measure) */}
          <article className="lg:col-span-8 max-w-[740px]">
            {/* Header Lockup */}
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

          {/* Desktop Sidebar Rail (Col 9-12) */}
          <aside className="hidden lg:block lg:col-span-4 space-y-6">
            {/* Sticky Table of Contents */}
            {tocItems.length > 0 && (
              <TableOfContents items={tocItems} isSticky />
            )}

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
                to={ROUTES.CATEGORY(article.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}
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
};
