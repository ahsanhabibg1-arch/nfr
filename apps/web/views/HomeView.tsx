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

import { Article, Discipline } from '../types';
import type { QuickAccessLink } from '../lib/cms/navTypes';
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
  quickAccessLinks: QuickAccessLink[];
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
  quickAccessLinks,
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

      <QuickAccess items={quickAccessLinks.map((qa) => ({ id: qa.id, title: qa.label, description: qa.description, category: '', targetSectionId: '', targetRoute: qa.url }))} onNavigateSection={handleNavigateSection} />

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
