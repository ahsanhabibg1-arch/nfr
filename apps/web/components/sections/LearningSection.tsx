import React from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { HomeArticleFeed } from './HomeArticleFeed';
import { ROUTES } from '../../config/routes';
import { type SectionCopy, copyOr } from './sectionCopy';

interface LearningSectionProps {
  /** Published evergreen articles (rules, history, general information) from the database. */
  articles: Article[];
  /** Page Builder copy overrides. */
  copy?: SectionCopy;
}

/** Evergreen learning module (§3.1). Hidden entirely when no evergreen article is published. */
export const LearningSection: React.FC<LearningSectionProps> = ({ articles, copy = {} }) => {
  if (articles.length === 0) return null;
  return (
    <section id="learning" className="w-full bg-[#FFFFFF] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker={copyOr(copy.kicker, 'Rodeo 101')}
          title={copyOr(copy.title, 'Rules, Formats & Rodeo History')}
          description={copyOr(copy.description, 'Evergreen explainers on how rodeo competition works.')}
          actionLabel={copy.ctaText?.trim() || undefined}
          actionHref={copy.ctaText?.trim() ? copyOr(copy.ctaUrl, ROUTES.COMPETITION) : undefined}
        />
        <HomeArticleFeed articles={articles} sectionPath={ROUTES.COMPETITION} sectionName="NFR Competition" />
      </div>
    </section>
  );
};
