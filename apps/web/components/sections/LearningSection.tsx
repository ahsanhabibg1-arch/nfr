import React from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { HomeArticleFeed } from './HomeArticleFeed';
import { ROUTES } from '../../config/routes';

interface LearningSectionProps {
  /** Published evergreen articles (rules, history, general information) from the database. */
  articles: Article[];
}

/** Evergreen learning module (§3.1). Hidden entirely when no evergreen article is published. */
export const LearningSection: React.FC<LearningSectionProps> = ({ articles }) => {
  if (articles.length === 0) return null;
  return (
    <section id="learning" className="w-full bg-[#FFFFFF] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Rodeo 101"
          title="Rules, Formats &amp; Rodeo History"
          description="Evergreen explainers on how rodeo competition works."
        />
        <HomeArticleFeed articles={articles} sectionPath={ROUTES.COMPETITION} sectionName="NFR Competition" />
      </div>
    </section>
  );
};
