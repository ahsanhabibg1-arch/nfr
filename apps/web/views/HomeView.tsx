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

// Every module is fed from the database by the server page (published articles and
// the rodeo directory). Quick-access is plain navigation. No static mock content.
import { QUICK_ACCESS_LINKS } from '../config/quickAccess';
import { Article, Discipline } from '../types';
import { ROUTES } from '../config/routes';

export interface HomeViewProps {
  heroArticle: Article;
  secondaryStories: Article[];
  latestArticles: Article[];
  disciplines: Discipline[];
  planWatchArticles: Article[];
  entertainmentArticles: Article[];
  eventsShoppingArticles: Article[];
  evergreenArticles: Article[];
  hubs: MoreRodeoHubCard[];
  recurringEvents: MoreRodeoEventCard[];
}

export const HomeView: React.FC<HomeViewProps> = ({
  heroArticle,
  secondaryStories,
  latestArticles,
  disciplines,
  planWatchArticles,
  entertainmentArticles,
  eventsShoppingArticles,
  evergreenArticles,
  hubs,
  recurringEvents,
}) => {
  const router = useRouter();

  const handleSelectArticle = (article: Article) => router.push(ROUTES.ARTICLE(article.slug));
  const handleSelectDiscipline = (discipline: Discipline) => router.push(ROUTES.DISCIPLINE(discipline.slug));
  const handleNavigateSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="w-full flex flex-col">
      <EditorialHero
        leadArticle={heroArticle}
        secondaryStories={secondaryStories}
        onSelectArticle={handleSelectArticle}
      />

      <LatestCoverage articles={latestArticles} onSelectArticle={handleSelectArticle} />

      <QuickAccess items={QUICK_ACCESS_LINKS} onNavigateSection={handleNavigateSection} />

      <CompetitionSection disciplines={disciplines} onSelectDiscipline={handleSelectDiscipline} />

      <PlanAndWatchSection articles={planWatchArticles} />

      <EntertainmentSection articles={entertainmentArticles} />

      <EventsShoppingSection articles={eventsShoppingArticles} />

      <MoreRodeoSection hubs={hubs} recurringEvents={recurringEvents} />

      <LearningSection articles={evergreenArticles} />
    </div>
  );
};

export default HomeView;
