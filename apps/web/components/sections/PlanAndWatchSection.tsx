import React from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { HomeArticleFeed } from './HomeArticleFeed';
import { ROUTES } from '../../config/routes';
import { type SectionCopy, copyOr } from './sectionCopy';

interface PlanAndWatchSectionProps {
  /** Published NFR Plan & Watch articles (database). */
  articles: Article[];
  /** Page Builder copy overrides. */
  copy?: SectionCopy;
}

export const PlanAndWatchSection: React.FC<PlanAndWatchSectionProps> = ({ articles, copy = {} }) => {
  return (
    <section id="plan-watch" className="w-full bg-[#F7F3EA] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker={copyOr(copy.kicker, 'Plan & Watch')}
          title={copyOr(copy.title, 'NFR Plan & Watch')}
          description={copyOr(copy.description, 'Guides to authorized TV and streaming options, tickets, hotels, travel and the venue. Confirm time-sensitive details with official sources.')}
          actionLabel={copy.ctaText?.trim() || undefined}
          actionHref={copy.ctaText?.trim() ? copyOr(copy.ctaUrl, ROUTES.PLAN_WATCH) : undefined}
        />
        <HomeArticleFeed articles={articles} sectionPath={ROUTES.PLAN_WATCH} sectionName="NFR Plan & Watch" columns={4} />
      </div>
    </section>
  );
};
