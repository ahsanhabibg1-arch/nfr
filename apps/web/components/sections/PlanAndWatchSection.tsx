import React from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { HomeArticleFeed } from './HomeArticleFeed';
import { ROUTES } from '../../config/routes';

interface PlanAndWatchSectionProps {
  /** Published NFR Plan & Watch articles (database). */
  articles: Article[];
}

export const PlanAndWatchSection: React.FC<PlanAndWatchSectionProps> = ({ articles }) => {
  return (
    <section id="plan-watch" className="w-full bg-[#F7F3EA] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Plan &amp; Watch"
          title="NFR Plan &amp; Watch"
          description="Guides to authorized TV and streaming options, tickets, hotels, travel and the venue. Confirm time-sensitive details with official sources."
        />
        <HomeArticleFeed articles={articles} sectionPath={ROUTES.PLAN_WATCH} sectionName="NFR Plan & Watch" columns={4} />
      </div>
    </section>
  );
};
