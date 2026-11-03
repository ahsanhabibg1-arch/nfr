import React from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { HomeArticleFeed } from './HomeArticleFeed';
import { ROUTES } from '../../config/routes';

interface EntertainmentSectionProps {
  /** Published NFR Entertainment articles (database). */
  articles: Article[];
}

export const EntertainmentSection: React.FC<EntertainmentSectionProps> = ({ articles }) => {
  return (
    <section id="entertainment" className="w-full bg-[#1E293B] text-white py-16 border-b border-white/10">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          dark
          kicker="Entertainment"
          title="NFR Entertainment &amp; Fan Experiences"
          description="Coverage of concerts, watch parties, awards and other fan experiences around the NFR."
        />
        <HomeArticleFeed articles={articles} theme="dark" sectionPath={ROUTES.ENTERTAINMENT} sectionName="NFR Entertainment" />
      </div>
    </section>
  );
};
