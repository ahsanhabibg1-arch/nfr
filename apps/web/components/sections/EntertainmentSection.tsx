import React from 'react';
import { Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { HomeArticleFeed } from './HomeArticleFeed';
import { ROUTES } from '../../config/routes';
import { type SectionCopy, copyOr } from './sectionCopy';

interface EntertainmentSectionProps {
  /** Published NFR Entertainment articles (database). */
  articles: Article[];
  /** Page Builder copy overrides. */
  copy?: SectionCopy;
}

export const EntertainmentSection: React.FC<EntertainmentSectionProps> = ({ articles, copy = {} }) => {
  return (
    <section id="entertainment" className="w-full bg-[#1E293B] text-white py-16 border-b border-white/10">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          dark
          kicker={copyOr(copy.kicker, 'Entertainment')}
          title={copyOr(copy.title, 'NFR Entertainment & Fan Experiences')}
          description={copyOr(copy.description, 'Coverage of concerts, watch parties, awards and other fan experiences around the NFR.')}
          actionLabel={copy.ctaText?.trim() || undefined}
          actionHref={copy.ctaText?.trim() ? copyOr(copy.ctaUrl, ROUTES.ENTERTAINMENT) : undefined}
        />
        <HomeArticleFeed articles={articles} theme="dark" sectionPath={ROUTES.ENTERTAINMENT} sectionName="NFR Entertainment" />
      </div>
    </section>
  );
};
