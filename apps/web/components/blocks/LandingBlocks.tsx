import React from 'react';
import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { SectionLandingHero } from '@/components/editorial/SectionLandingHero';
import { EditorialArticleGrid } from '@/components/editorial/EditorialArticleGrid';
import { ContentEmptyState } from '@/components/editorial/ContentEmptyState';
import { ImageWithCredit } from '@/components/ImageWithCredit';
import type { BlockProps } from './blockProps';
import { slotStr } from './blockProps';
import type { Article, Discipline } from '@/types';

interface LandingData {
  featuredStory?: Article | null;
  secondaryStories?: Article[];
  disciplines?: Discipline[];
  sectionMeta?: { name: string; tagline: string; description: string; path: string };
  sectionKey?: string;
  totalArticleCount?: number;
}

function ld(data: Record<string, unknown>): LandingData {
  return data as unknown as LandingData;
}

export function LandingHeroBlock({ slot, data }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const d = ld(data);
  const meta = d.sectionMeta;
  if (!meta) return null;

  const pillsSlotVisible = (data.pillsVisible as boolean) !== false;

  return (
    <SectionLandingHero
      sectionTitle={p('title') || meta.name}
      tagline={meta.tagline}
      description={p('description') || meta.description}
      kicker={p('kicker', 'Primary Department')}
      // Stage 04 Task D: previously declared in the registry and dropped here.
      backgroundImageUrl={p('heroImageUrl')}
      breadcrumbs={[{ label: meta.name }]}
      statPills={pillsSlotVisible ? [
        { label: 'Published articles', value: String(d.totalArticleCount ?? 0) },
        { label: 'Publisher', value: 'Independent' },
      ] : undefined}
    />
  );
}

export function LandingFeaturedBlock({ slot, data }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const d = ld(data);
  const featuredStory = d.featuredStory;
  if (!featuredStory) return null;

  const featuredCtaText = p('ctaText', 'Read Full Story');

  return (
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
  );
}

export function LandingEmptyState({ data }: BlockProps) {
  const d = ld(data);
  const meta = d.sectionMeta;
  if ((d.totalArticleCount ?? 0) > 0) return null;
  return (
    <ContentEmptyState
      title={`No ${meta?.name ?? 'section'} articles yet`}
      description="Nothing has been published in this section yet. Check back soon."
      actionText="Return to homepage"
    />
  );
}

export function LandingGridBlock({ slot, data }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const d = ld(data);
  const secondaryStories = d.secondaryStories ?? [];
  if (secondaryStories.length === 0) return null;

  const gridCtaText = p('ctaText', 'View Category Archive');
  const sectionKey = d.sectionKey ?? '';
  const sectionName = d.sectionMeta?.name ?? '';

  return (
    <section className="pt-8 border-t border-stone-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-serif font-bold text-[#0F1115]">
          More {sectionName} Stories &amp; Dispatches
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
  );
}

/**
 * Discipline guides grid (Stage 07 Task E).
 *
 * The kicker and heading were hardcoded here — "Championship Disciplines" and
 * "NFR Discipline Guides" — on a block that had no registry definition, so no
 * administrator could reach either string. They now come from the slot's props,
 * with the previous literals as the registry defaults, so an unconfigured page
 * renders exactly what it rendered before and a configured one actually changes.
 *
 * The discipline records themselves stay with the CMS: the resolver supplies
 * them from `getAllDisciplines()` and nothing about them is stored in the slot.
 */
export function CompetitionDisciplinesBlock({ slot, data }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const d = ld(data);
  const disciplines = d.disciplines ?? [];
  if (disciplines.length === 0) return null;

  const kicker = p('kicker', 'Championship Disciplines');
  const heading = p('title', 'NFR Discipline Guides');
  const description = p('description');

  return (
    <section>
      <div className="flex items-center justify-between mb-6 pb-2 border-b border-stone-200">
        <div>
          {kicker && (
            <span className="text-xs uppercase tracking-widest font-sans font-bold text-[#8B5E3C] block mb-1">
              {kicker}
            </span>
          )}
          <h3 className="text-2xl font-serif font-bold text-[#0F1115]">
            {heading}
          </h3>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-stone-600 font-sans">{description}</p>
          )}
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
  );
}
