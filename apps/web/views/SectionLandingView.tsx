import React from 'react';
import Link from 'next/link';
import { ROUTES } from '../config/routes';
import { getSectionMeta, getPublishedArticlesBySection, getAllDisciplines } from '../lib/content';
import { SectionLandingHero } from '../components/editorial/SectionLandingHero';
import { EditorialArticleGrid } from '../components/editorial/EditorialArticleGrid';
import { ContentEmptyState } from '../components/editorial/ContentEmptyState';
import { ImageWithCredit } from '../components/ImageWithCredit';
import { getPublishedSections } from '../lib/cms/pageLayoutService';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

function getSlot(sections: SectionSlot[], type: string): SectionSlot | undefined {
  return sections.find((s) => s.sectionType === type);
}

function slotProp(slot: SectionSlot | undefined, key: string, fallback: string): string {
  if (!slot) return fallback;
  const v = slot.props[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

export async function SectionLandingView({ sectionKey }: { sectionKey: string }) {
  const sectionMeta = (await getSectionMeta(sectionKey))!;
  const layoutSections = await getPublishedSections(`section:${sectionKey}`);

  const sectionArticles = await getPublishedArticlesBySection(sectionMeta.categoryKey);
  const disciplines = await getAllDisciplines();
  const featuredStory = sectionArticles[0];
  const secondaryStories = sectionArticles.slice(1);

  const heroSlot = getSlot(layoutSections, 'landing-hero');
  const featuredSlot = getSlot(layoutSections, 'landing-featured');
  const gridSlot = getSlot(layoutSections, 'landing-grid');
  const pillsSlot = getSlot(layoutSections, 'landing-stat-pills');

  const heroVisible = heroSlot?.visible !== false;
  const featuredVisible = featuredSlot?.visible !== false;
  const gridVisible = gridSlot?.visible !== false;
  const pillsVisible = pillsSlot?.visible !== false;

  const heroKicker = slotProp(heroSlot, 'kicker', 'Primary Department');
  const heroTitle = slotProp(heroSlot, 'title', sectionMeta.name);
  const heroDescription = slotProp(heroSlot, 'description', sectionMeta.description);

  const featuredCtaText = slotProp(featuredSlot, 'ctaText', 'Read Full Story');
  const gridCtaText = slotProp(gridSlot, 'ctaText', 'View Category Archive');

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115]">
      {heroVisible && (
        <SectionLandingHero
          sectionTitle={heroTitle}
          tagline={sectionMeta.tagline}
          description={heroDescription}
          kicker={heroKicker}
          breadcrumbs={[{ label: sectionMeta.name }]}
          statPills={pillsVisible ? [
            { label: 'Published articles', value: String(sectionArticles.length) },
            { label: 'Publisher', value: 'Independent' },
          ] : undefined}
        />
      )}

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">
        {/* Lead Featured Story */}
        {featuredVisible && featuredStory && (
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
                    {featuredCtaText} &rarr;
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
        {gridVisible && secondaryStories.length > 0 && (
          <section className="pt-8 border-t border-stone-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-serif font-bold text-[#0F1115]">
                More {sectionMeta.name} Stories &amp; Dispatches
              </h3>
              <Link
                href={ROUTES.CATEGORY(sectionKey)}
                className="text-xs font-semibold uppercase tracking-wider text-[#8B5E3C] hover:text-stone-950 font-sans"
              >
                {gridCtaText} &rarr;
              </Link>
            </div>
            <EditorialArticleGrid articles={secondaryStories} columns={3} />
          </section>
        )}
      </div>
    </div>
  );
}
