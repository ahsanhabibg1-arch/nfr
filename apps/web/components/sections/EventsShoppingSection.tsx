import React from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { HomeArticleFeed } from './HomeArticleFeed';
import { ROUTES } from '../../config/routes';
import { type SectionCopy, copyOr } from './sectionCopy';

interface EventsShoppingSectionProps {
  /** Published NFR Events & Shopping articles (database). */
  articles: Article[];
  /** Page Builder copy overrides. */
  copy?: SectionCopy;
}

export const EventsShoppingSection: React.FC<EventsShoppingSectionProps> = ({ articles, copy = {} }) => {
  return (
    <section id="events-shopping" className="w-full bg-[#FFFFFF] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker={copyOr(copy.kicker, 'Events & Shopping')}
          title={copyOr(copy.title, 'NFR Events & Cowboy Christmas')}
          description={copyOr(copy.description, 'Guides to Cowboy Christmas, Junior NFR, Miss Rodeo America and other events and exhibitions.')}
          actionLabel={copy.ctaText?.trim() || undefined}
          actionHref={copy.ctaText?.trim() ? copyOr(copy.ctaUrl, ROUTES.EVENTS_SHOPPING) : undefined}
        />
        <HomeArticleFeed articles={articles} sectionPath={ROUTES.EVENTS_SHOPPING} sectionName="NFR Events & Shopping" />
      </div>
    </section>
  );
};
