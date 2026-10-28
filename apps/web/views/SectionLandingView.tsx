import React from 'react';
import Link from 'next/link';
import {
  PRIMARY_SECTIONS,
  ROUTES
} from '../config/routes';
import {
  PLAN_AND_WATCH_GUIDES,
  ENTERTAINMENT_FEATURES,
  SHOPPING_EVENTS,
  RODEO_HUBS,
  RECURRING_RODEO_EVENTS
} from '../data/mockEditorialData';
import { getPublishedArticlesBySection, getAllDisciplines } from '../lib/content';
import { SectionLandingHero } from '../components/editorial/SectionLandingHero';
import { EditorialArticleGrid } from '../components/editorial/EditorialArticleGrid';
import { ImageWithCredit } from '../components/ImageWithCredit';
import { AdSlot } from '../components/AdSlot';

// Async server component (Batch 02 §9): the section article feed and the
// discipline grid come from the database; section-specific decorative modules
// (plan/watch guides, entertainment, shopping, hubs, events) remain Phase 0
// static content (documented boundary).
export async function SectionLandingView({ sectionKey }: { sectionKey: string }) {
  const sectionMeta = PRIMARY_SECTIONS[sectionKey];

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
          { label: 'Published Dispatches', value: `${sectionArticles.length} Editorial Guides` },
          { label: 'Championship Status', value: '2026 Season Coverage' },
          { label: 'Integrity', value: '100% Independent' },
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
                  <div className="flex items-center gap-2 text-xs font-sans text-stone-500 mb-2">
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
                  <span className="text-stone-500">By {featuredStory.author.name}</span>
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
                  Official NFR Discipline Guides
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
                    <span className="text-[10px] uppercase font-mono font-bold text-stone-400 block mb-1">
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

        {sectionKey === 'entertainment' && (
          <section>
            <div className="mb-6 pb-2 border-b border-stone-200">
              <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
                Nightly Highlights
              </span>
              <h3 className="text-2xl font-serif font-bold text-[#0F1115]">
                Concerts, Buckle Presentations &amp; Watch Parties
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ENTERTAINMENT_FEATURES.map((ent) => (
                <div key={ent.id} className="p-5 bg-white border border-stone-200 rounded-sm">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#D4A757] block mb-1">
                    {ent.type} &middot; {ent.venue}
                  </span>
                  <h4 className="text-base font-serif font-bold text-stone-900">{ent.title}</h4>
                  <p className="mt-2 text-xs text-stone-600 font-sans leading-relaxed">{ent.summary}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {sectionKey === 'events-shopping' && (
          <section>
            <div className="mb-6 pb-2 border-b border-stone-200">
              <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
                Convention &amp; Culture
              </span>
              <h3 className="text-2xl font-serif font-bold text-[#0F1115]">
                Cowboy Christmas, Junior NFR &amp; Heritage Artisans
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {SHOPPING_EVENTS.map((shop) => (
                <div key={shop.id} className="p-5 bg-white border border-stone-200 rounded-sm">
                  <span className="text-[10px] uppercase font-mono font-bold text-[#8B5E3C] block mb-1">
                    {shop.type} &middot; {shop.venue}
                  </span>
                  <h4 className="text-base font-serif font-bold text-stone-900">{shop.title}</h4>
                  <p className="mt-2 text-xs text-stone-600 font-sans leading-relaxed">{shop.summary}</p>
                </div>
              ))}
            </div>
            <AdSlot label="Western Lifestyle Showcase &amp; Exhibitor Guide" />
          </section>
        )}

        {sectionKey === 'plan-watch' && (
          <section>
            <div className="mb-6 pb-2 border-b border-stone-200">
              <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
                Visitor Logistics
              </span>
              <h3 className="text-2xl font-serif font-bold text-[#0F1115]">
                Broadcast, Tickets, Hotels &amp; Transportation
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PLAN_AND_WATCH_GUIDES.map((pw) => (
                <Link
                  key={pw.id}
                  href={ROUTES.ARTICLE(pw.articleSlug)}
                  className="p-5 bg-white border border-stone-200 hover:border-[#8B5E3C] rounded-sm transition-all group flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold text-stone-400 block mb-1">
                      {pw.subtopic}
                    </span>
                    <h4 className="text-sm font-serif font-bold text-stone-900 group-hover:text-[#8B5E3C] transition-colors">
                      {pw.title}
                    </h4>
                    <p className="text-xs text-stone-600 line-clamp-2 mt-1 font-sans">{pw.summary}</p>
                  </div>
                  <span className="mt-3 text-xs font-semibold text-[#8B5E3C] inline-flex items-center gap-1">
                    Read Guide &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {sectionKey === 'rodeo-events' && (
          <section className="space-y-8">
            <div>
              <div className="mb-4 pb-2 border-b border-stone-200">
                <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
                  Global Circuits
                </span>
                <h3 className="text-2xl font-serif font-bold text-[#0F1115]">
                  Regional Rodeo Hubs &amp; Major Recurring Events
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {RODEO_HUBS.map((hub) => (
                  <div key={hub.id} className="p-5 bg-white border border-stone-200 rounded-sm">
                    <span className="text-[10px] uppercase font-mono font-bold text-[#8B5E3C] block mb-1">
                      {hub.circuitType}
                    </span>
                    <h4 className="text-lg font-serif font-bold text-stone-900">{hub.title}</h4>
                    <p className="text-xs text-stone-500 font-sans mt-0.5">{hub.region}</p>
                    <p className="mt-2 text-xs text-stone-600 font-sans leading-relaxed">{hub.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-4 pb-2 border-b border-stone-200">
                <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
                  Crown Jewels
                </span>
                <h3 className="text-xl font-serif font-bold text-[#0F1115]">
                  Historic Invitational &amp; Tour Stops
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {RECURRING_RODEO_EVENTS.map((rec) => (
                  <div key={rec.id} className="p-5 bg-white border border-stone-200 rounded-sm">
                    <span className="text-[10px] uppercase font-mono font-bold text-stone-400 block mb-1">
                      {rec.status} &middot; {rec.location}
                    </span>
                    <h4 className="text-lg font-serif font-bold text-stone-900">{rec.name}</h4>
                    <p className="mt-2 text-xs text-stone-600 font-sans leading-relaxed">{rec.description}</p>
                    <div className="mt-3 p-2.5 bg-[#F7F3EA] border border-stone-200 text-xs font-sans rounded-xs">
                      <strong>Upcoming:</strong> {rec.currentEdition.dates} ({rec.currentEdition.purseBenchmark})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
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
