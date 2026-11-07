import React from 'react';
import Link from 'next/link';
import { ROUTES } from '../config/routes';
import { getSectionMeta, getPublishedArticlesBySection, getAllDisciplines } from '../lib/content';
import { SectionLandingHero } from '../components/editorial/SectionLandingHero';
import { EditorialArticleGrid } from '../components/editorial/EditorialArticleGrid';
import { ContentEmptyState } from '../components/editorial/ContentEmptyState';
import { ImageWithCredit } from '../components/ImageWithCredit';

export async function SectionLandingView({ sectionKey }: { sectionKey: string }) {
  const sectionMeta = (await getSectionMeta(sectionKey))!;

  const sectionArticles = await getPublishedArticlesBySection(sectionMeta.categoryKey);
  const disciplines = await getAllDisciplines();
  const featuredStory = sectionArticles[0];
  const secondaryStories = sectionArticles.slice(1);

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115]">
      {/* Editorial Section Hero */}
      <SectionLandingHero
        sectionTitle={sectionMeta.name}
        tagline={sectionMeta.tagline}
        description={sectionMeta.description}
        kicker="Primary Department"
        breadcrumbs={[{ label: sectionMeta.name }]}
        statPills={[
          { label: 'Published articles', value: String(sectionArticles.length) },
          { label: 'Publisher', value: 'Independent' },
        ]}
      />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
        {/* Lead Featured Story */}
        {featuredStory && (
          <section className="bg-white border border-stone-200 rounded-sm overflow-hidden shadow-xs">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-7">
                <Link href={ROUTES.ARTICLE(featuredStory.slug)}>
                  <ImageWithCredit
                    src={featuredStory.heroImage}
                    alt={featuredStory.title}
                    credit={featuredStory.imageCredit}
                    aspectRatioClass="aspect-[16/10]"
                  />
                </Link>
              </div>
              <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-sans text-ink-muted mb-2">
                    <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
                      Department Feature
                    </span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{featuredStory.readTime}</span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#0F1115] hover:text-[#8B5E3C] transition-colors leading-tight">
                    <Link href={ROUTES.ARTICLE(featuredStory.slug)}>
                      {featuredStory.title}
                    </Link>
                  </h2>

                  <p className="mt-3 text-sm text-stone-600 font-sans leading-relaxed">
                    {featuredStory.deck}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs font-sans">
                  <span className="text-ink-muted">By {featuredStory.author.name}</span>
                  <Link
                    href={ROUTES.ARTICLE(featuredStory.slug)}
                    className="text-[#8B5E3C] font-semibold hover:text-stone-900 transition-colors inline-flex items-center gap-1"
                  >
                    Read Full Story &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Section-Specific Custom Hubs */}
        {sectionKey === 'competition' && (
          <section>
            <div className="flex items-center justify-between mb-6 pb-2 border-b border-stone-200">
              <div>
                <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
                  Championship Disciplines
                </span>
                <h3 className="text-2xl font-serif font-bold text-[#0F1115]">
                  NFR Discipline Guides
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {disciplines.map((d) => (
                <Link
                  key={d.id}
                  href={ROUTES.DISCIPLINE(d.slug)}
                  className="p-5 bg-white border border-stone-200 hover:border-[#8B5E3C] hover:shadow-xs rounded-sm transition-all flex flex-col justify-between group"
                >
                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold text-ink-muted block mb-1">
                      {d.category}
                    </span>
                    <h4 className="text-lg font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors">
                      {d.name}
                    </h4>
                    <p className="text-xs text-stone-600 line-clamp-2 mt-1 font-sans">
                      {d.tagline}
                    </p>
                  </div>
                  <span className="mt-4 text-xs font-semibold text-[#8B5E3C] inline-flex items-center gap-1">
                    Explore Guide &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {sectionArticles.length === 0 && (
          <ContentEmptyState
            title={`No ${sectionMeta.name} articles yet`}
            description="Nothing has been published in this section yet. Check back soon."
            actionText="Return to homepage"
          />
        )}

        {/* Remaining Secondary Stories Grid */}
        {secondaryStories.length > 0 && (
          <section className="pt-8 border-t border-stone-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-serif font-bold text-[#0F1115]">
                More {sectionMeta.name} Stories &amp; Dispatches
              </h3>
              <Link
                href={ROUTES.CATEGORY(sectionKey)}
                className="text-xs font-semibold uppercase tracking-wider text-[#8B5E3C] hover:text-stone-950 font-sans"
              >
                View Category Archive &rarr;
              </Link>
            </div>
            <EditorialArticleGrid articles={secondaryStories} columns={3} />
          </section>
        )}
      </div>
    </div>
  );
}
