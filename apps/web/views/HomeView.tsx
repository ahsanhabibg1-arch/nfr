'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { EditorialHero } from '../components/sections/EditorialHero';
import { LatestCoverage } from '../components/sections/LatestCoverage';
import { QuickAccess } from '../components/sections/QuickAccess';
import { CompetitionSection } from '../components/sections/CompetitionSection';
import { PlanAndWatchSection } from '../components/sections/PlanAndWatchSection';
import { EntertainmentSection } from '../components/sections/EntertainmentSection';
import { EventsShoppingSection } from '../components/sections/EventsShoppingSection';
import { MoreRodeoSection, MoreRodeoHubCard, MoreRodeoEventCard } from '../components/sections/MoreRodeoSection';
import { LearningSection } from '../components/sections/LearningSection';
import { AnnouncementBanner, type PublicAnnouncement } from '../components/public/AnnouncementBanner';
import { GlobalBlockRenderer, type PublicGlobalBlock } from '../components/public/GlobalBlockRenderer';
import { IntroBanner } from '../components/public/IntroBanner';
import type { AppearanceConfig } from '../lib/cms/siteConfigService';

import { Article, Discipline } from '../types';
import type { SectionSlot } from '../lib/cms/sectionRegistry';
import type { ResolvedHomeSlot } from '../lib/cms/homepageData';
import { copyFromProps } from '../components/sections/sectionCopy';
import { ROUTES } from '../config/routes';

export interface HomeViewProps {
  /** Visible Page Builder slots, in order, each with the data its props asked for. */
  slots: ResolvedHomeSlot[];
  announcements?: PublicAnnouncement[];
  topBlocks?: PublicGlobalBlock[];
  bottomBlocks?: PublicGlobalBlock[];
  appearance?: AppearanceConfig;
  /** True when rendering the staff-only draft preview. */
  isDraftPreview?: boolean;
}

export type { MoreRodeoHubCard, MoreRodeoEventCard };

export const HomeView: React.FC<HomeViewProps> = ({
  slots,
  announcements = [],
  topBlocks = [],
  bottomBlocks = [],
  appearance,
  isDraftPreview = false,
}) => {
  const router = useRouter();

  const handleSelectArticle = (article: Article) => router.push(ROUTES.ARTICLE(article.slug));
  const handleSelectDiscipline = (discipline: Discipline) => router.push(ROUTES.DISCIPLINE(discipline.slug));
  const handleNavigateSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  /** Core editorial sections — every one now reads its own slot props. */
  const renderCore = ({ slot, data }: ResolvedHomeSlot): React.ReactNode | undefined => {
    const copy = copyFromProps(slot.props);
    switch (slot.sectionType) {
      case 'editorial-hero':
        if (!data.lead) return null;
        return (
          <EditorialHero
            leadArticle={data.lead}
            secondaryStories={data.secondary ?? []}
            onSelectArticle={handleSelectArticle}
            heroImageUrl={p(slot, 'heroImageUrl')}
            heroImageAlt={p(slot, 'heroImageAlt')}
            kicker={copy.kicker}
            ctaText={copy.ctaText}
          />
        );
      case 'latest-coverage':
        if (!data.articles?.length) return null;
        return <LatestCoverage articles={data.articles} onSelectArticle={handleSelectArticle} copy={copy} anchorId={`latest-coverage-${slot.id}`} />;
      case 'quick-access':
        return (
          <QuickAccess
            copy={copy}
            items={(data.quickAccessLinks ?? []).map((qa) => ({ id: qa.id, title: qa.label, description: qa.description, category: '', targetSectionId: '', targetRoute: qa.url }))}
            onNavigateSection={handleNavigateSection}
          />
        );
      case 'competition':
        return <CompetitionSection disciplines={data.disciplines ?? []} onSelectDiscipline={handleSelectDiscipline} copy={copy} />;
      case 'plan-and-watch':
        return <PlanAndWatchSection articles={data.articles ?? []} copy={copy} />;
      case 'entertainment':
        return <EntertainmentSection articles={data.articles ?? []} copy={copy} />;
      case 'events-shopping':
        return <EventsShoppingSection articles={data.articles ?? []} copy={copy} />;
      case 'more-rodeo':
        return <MoreRodeoSection hubs={(data.hubs ?? []) as MoreRodeoHubCard[]} recurringEvents={(data.recurringEvents ?? []) as MoreRodeoEventCard[]} copy={copy} />;
      case 'learning':
        return <LearningSection articles={data.articles ?? []} copy={copy} />;
      default:
        return undefined; // not a core section — try premium blocks
    }
  };

  const p = (slot: SectionSlot, key: string, fallback = '') => {
    const v = slot.props[key];
    return typeof v === 'string' ? v : fallback;
  };

  const renderPremiumBlock = (slot: SectionSlot): React.ReactNode => {
    switch (slot.sectionType) {
      case 'rich-text-block': {
        const align = p(slot, 'alignment', 'left');
        return (
          <section className="w-full max-w-screen-xl mx-auto px-4 py-12">
            <div style={{ textAlign: align as 'left' | 'center' | 'right' }}>
              {p(slot, 'title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-4">{p(slot, 'title')}</h2>}
              {p(slot, 'body') && <div className="text-stone-700 leading-relaxed whitespace-pre-line">{p(slot, 'body')}</div>}
            </div>
          </section>
        );
      }
      case 'image-text-block': {
        const imgPos = p(slot, 'imagePosition', 'left');
        return (
          <section className="w-full max-w-screen-xl mx-auto px-4 py-12">
            <div className={`flex flex-col md:flex-row gap-8 items-center ${imgPos === 'right' ? 'md:flex-row-reverse' : ''}`}>
              {p(slot, 'imageUrl') && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p(slot, 'imageUrl')} alt={p(slot, 'imageAlt', '')} className="w-full md:w-1/2 rounded-lg object-cover max-h-80" />
              )}
              <div className="flex-1">
                {p(slot, 'title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-3">{p(slot, 'title')}</h2>}
                {p(slot, 'body') && <p className="text-stone-700 leading-relaxed">{p(slot, 'body')}</p>}
                {p(slot, 'ctaText') && p(slot, 'ctaUrl') && (
                  <a href={p(slot, 'ctaUrl')} className="inline-block mt-4 px-5 py-2 bg-[#0F1115] text-[#D4A757] rounded font-semibold text-sm">{p(slot, 'ctaText')}</a>
                )}
              </div>
            </div>
          </section>
        );
      }
      case 'stats-banner': {
        const stats = [1, 2, 3, 4].map((n) => ({ label: p(slot, `stat${n}Label`), value: p(slot, `stat${n}Value`) })).filter((s) => s.label && s.value);
        if (stats.length === 0) return null;
        return (
          <section className="w-full bg-[#0F1115] py-10">
            <div className="max-w-screen-xl mx-auto px-4">
              {p(slot, 'title') && <h2 className="text-lg font-bold text-[#D4A757] text-center mb-6">{p(slot, 'title')}</h2>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                {stats.map((s) => (
                  <div key={s.label}>
                    <div className="text-3xl font-bold text-white">{s.value}</div>
                    <div className="text-sm text-stone-400 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      }
      case 'cta-banner': {
        const bg = p(slot, 'bgColor', 'dark');
        const bgClass = bg === 'gold' ? 'bg-[#D4A757]' : bg === 'light' ? 'bg-stone-100' : 'bg-[#0F1115]';
        const textClass = bg === 'light' ? 'text-[#0F1115]' : 'text-white';
        return (
          <section className={`w-full ${bgClass} py-12`}>
            <div className="max-w-screen-xl mx-auto px-4 text-center">
              {p(slot, 'kicker') && <div className={`text-xs uppercase tracking-wider mb-2 ${bg === 'light' ? 'text-stone-500' : 'text-[#D4A757]'}`}>{p(slot, 'kicker')}</div>}
              {p(slot, 'title') && <h2 className={`text-2xl font-bold mb-3 ${textClass}`}>{p(slot, 'title')}</h2>}
              {p(slot, 'description') && <p className={`mb-6 max-w-2xl mx-auto ${bg === 'light' ? 'text-stone-600' : 'text-stone-300'}`}>{p(slot, 'description')}</p>}
              {p(slot, 'ctaText') && p(slot, 'ctaUrl') && (
                <a href={p(slot, 'ctaUrl')} className={`inline-block px-6 py-2.5 rounded font-semibold text-sm ${bg === 'gold' ? 'bg-[#0F1115] text-[#D4A757]' : 'bg-[#D4A757] text-[#0F1115]'}`}>{p(slot, 'ctaText')}</a>
              )}
            </div>
          </section>
        );
      }
      case 'faq-block': {
        const faqs = [1, 2, 3, 4, 5].map((n) => ({ q: p(slot, `q${n}`), a: p(slot, `a${n}`) })).filter((f) => f.q && f.a);
        if (faqs.length === 0) return null;
        return (
          <section className="w-full max-w-screen-xl mx-auto px-4 py-12">
            {p(slot, 'title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-6 text-center">{p(slot, 'title')}</h2>}
            <div className="max-w-3xl mx-auto divide-y divide-stone-200">
              {faqs.map((f) => (
                <details key={f.q} className="py-4 group">
                  <summary className="font-semibold text-stone-900 cursor-pointer list-none flex items-center justify-between">
                    {f.q}
                    <span className="text-stone-400 group-open:rotate-180 transition-transform">&#x25BC;</span>
                  </summary>
                  <p className="mt-3 text-stone-600 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        );
      }
      case 'newsletter-signup':
        return (
          <section className="w-full bg-stone-50 py-12">
            <div className="max-w-screen-xl mx-auto px-4 text-center">
              {p(slot, 'title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-3">{p(slot, 'title')}</h2>}
              {p(slot, 'description') && <p className="text-stone-600 mb-6 max-w-xl mx-auto">{p(slot, 'description')}</p>}
              <div className="flex justify-center gap-2 max-w-md mx-auto">
                <input type="email" placeholder={p(slot, 'placeholderText', 'Enter your email')} className="flex-1 px-4 py-2.5 border border-stone-300 rounded text-sm" readOnly />
                <button className="px-5 py-2.5 bg-[#0F1115] text-[#D4A757] rounded font-semibold text-sm">{p(slot, 'ctaText', 'Subscribe')}</button>
              </div>
            </div>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full flex flex-col">
      {isDraftPreview && (
        <div className="w-full bg-[#D4A757] text-[#0F1115] text-xs font-semibold text-center py-1.5" role="status">
          DRAFT PREVIEW — you are seeing unpublished Page Builder changes. Visitors still see the published homepage.
        </div>
      )}
      {announcements.length > 0 && <AnnouncementBanner announcements={announcements} />}
      {topBlocks.length > 0 && <GlobalBlockRenderer blocks={topBlocks} />}
      {appearance?.introBannerStyle && appearance.introBannerHeadline && <IntroBanner config={appearance} />}
      {slots.map((resolved) => {
        const { slot } = resolved;
        const key = slot.id || `${slot.sectionType}-${slot.order}`;
        const core = renderCore(resolved);
        if (core !== undefined) return core ? <React.Fragment key={key}>{core}</React.Fragment> : null;
        const premium = renderPremiumBlock(slot);
        return premium ? <React.Fragment key={key}>{premium}</React.Fragment> : null;
      })}
      {bottomBlocks.length > 0 && <GlobalBlockRenderer blocks={bottomBlocks} />}
    </div>
  );
};

export default HomeView;
