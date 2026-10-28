import React, { useState, useMemo } from 'react';
import { Article, PrimarySection } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';

interface LatestCoverageProps {
  articles: Article[];
  onSelectArticle: (article: Article) => void;
}

const CATEGORIES: ('All' | PrimarySection)[] = [
  'All',
  'NFR Competition',
  'NFR Entertainment',
  'NFR Events & Shopping',
  'NFR Plan & Watch',
  'More Rodeo',
];

export const LatestCoverage: React.FC<LatestCoverageProps> = ({
  articles,
  onSelectArticle,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | PrimarySection>('All');

  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'All') return articles;
    return articles.filter((a) => a.category === selectedCategory);
  }, [articles, selectedCategory]);

  const featuredStory = filteredArticles[0] || articles[0];
  const standardStories = filteredArticles.slice(1);

  return (
    <section id="latest-coverage" className="w-full bg-[#F7F3EA] text-[#0F1115] py-14 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Championship Dispatches"
          title="Latest NFR Coverage &amp; Analysis"
          description="In-depth event dispatches, competitor profiles, venue logistics, and analytical breakdowns from our independent correspondents."
          actionLabel="View All Coverage"
          onActionClick={() => setSelectedCategory('All')}
        />

        {/* Category Filter Tabs (Interactive Filter Control - Compliant with Design Rules) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-4 mb-8 scrollbar-none border-b border-stone-200">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#0F1115] text-[#D4A757]'
                  : 'bg-white/80 text-stone-600 hover:text-stone-900 hover:bg-white border border-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Magazine Grid: Featured Hero Story + 2-Column Standard Card List */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Featured Editorial Card (Col 1-7) */}
          {featuredStory && (
            <article 
              onClick={() => onSelectArticle(featuredStory)}
              className="lg:col-span-7 bg-white p-6 sm:p-8 border border-stone-300 rounded-sm shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
            >
              <div className="mb-4 overflow-hidden rounded-sm">
                <ImageWithCredit
                  src={featuredStory.heroImage}
                  alt={featuredStory.title}
                  credit={featuredStory.imageCredit}
                  aspectRatioClass="aspect-[16/10]"
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-sans text-stone-500 mb-2">
                <span className="font-semibold text-[#8B5E3C] uppercase tracking-wider">
                  {featuredStory.category}
                </span>
                <span aria-hidden="true">&middot;</span>
                <span>{featuredStory.readTime}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{featuredStory.publishedAt}</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                {featuredStory.title}
              </h3>

              <p className="mt-3 text-sm sm:text-base text-stone-700 font-sans leading-relaxed">
                {featuredStory.deck}
              </p>

              <div className="mt-6 pt-4 border-t border-stone-200 flex items-center justify-between text-xs font-sans">
                <span className="font-semibold text-stone-900">By {featuredStory.author.name}</span>
                <span className="text-[#8B5E3C] font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                  Read Full Story &rarr;
                </span>
              </div>
            </article>
          )}

          {/* Standard Article Cards (Col 8-12) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {standardStories.map((story) => (
              <article
                key={story.id}
                onClick={() => onSelectArticle(story)}
                className="bg-white p-5 border border-stone-300 rounded-sm hover:border-[#8B5E3C] transition-colors cursor-pointer group flex flex-col sm:flex-row lg:flex-col gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[11px] font-sans text-stone-500 mb-1.5">
                    <span className="font-semibold text-[#8B5E3C] uppercase tracking-wider">
                      {story.category}
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{story.readTime}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{story.publishedAt}</span>
                  </div>

                  <h4 className="text-base font-serif font-semibold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                    {story.title}
                  </h4>

                  <p className="mt-1.5 text-xs text-stone-600 font-sans line-clamp-2 leading-relaxed">
                    {story.deck}
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] font-sans text-stone-500">
                  <span>{story.author.name}</span>
                  <span className="text-[#8B5E3C] font-medium group-hover:translate-x-1 transition-transform">
                    Read &rarr;
                  </span>
                </div>
              </article>
            ))}

            {standardStories.length === 0 && (
              <div className="p-8 bg-white border border-stone-300 text-center text-xs text-stone-500 font-sans">
                Showing single featured dispatch for {selectedCategory}.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
