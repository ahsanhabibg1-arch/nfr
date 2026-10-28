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
import { MoreRodeoSection } from '../components/sections/MoreRodeoSection';
import { LearningSection } from '../components/sections/LearningSection';

// Non-article decorative modules remain Phase 0 static content (documented
// boundary, Batch 02 §9 / KNOWN_LIMITATIONS.md). Article feeds + disciplines
// arrive as props from the server page, sourced from the database.
import {
  QUICK_ACCESS_ITEMS,
  PLAN_AND_WATCH_GUIDES,
  ENTERTAINMENT_FEATURES,
  SHOPPING_EVENTS,
  RODEO_HUBS,
  RECURRING_RODEO_EVENTS,
  LEARNING_RESOURCES,
} from '../data/mockEditorialData';
import { Article, Discipline } from '../types';
import { ROUTES } from '../config/routes';

export interface HomeViewProps {
  heroArticle: Article;
  secondaryStories: Article[];
  latestArticles: Article[];
  disciplines: Discipline[];
}

export const HomeView: React.FC<HomeViewProps> = ({
  heroArticle,
  secondaryStories,
  latestArticles,
  disciplines,
}) => {
  const router = useRouter();

  const handleSelectArticle = (article: Article) => router.push(ROUTES.ARTICLE(article.slug));
  const handleSelectDiscipline = (discipline: Discipline) => router.push(ROUTES.DISCIPLINE(discipline.slug));
  const handleSelectArticleBySlug = (slug: string) => router.push(ROUTES.ARTICLE(slug));
  const goToArticleOrSection = (slug: string | undefined, sectionPath: string) =>
    router.push(slug ? ROUTES.ARTICLE(slug) : sectionPath);
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

      <QuickAccess items={QUICK_ACCESS_ITEMS} onNavigateSection={handleNavigateSection} />

      <CompetitionSection disciplines={disciplines} onSelectDiscipline={handleSelectDiscipline} />

      <PlanAndWatchSection guides={PLAN_AND_WATCH_GUIDES} onSelectArticleBySlug={handleSelectArticleBySlug} />

      <EntertainmentSection
        features={ENTERTAINMENT_FEATURES}
        onOpenArticle={(slug) => goToArticleOrSection(slug, ROUTES.ENTERTAINMENT)}
      />

      <EventsShoppingSection
        events={SHOPPING_EVENTS}
        onOpenArticle={(slug) => goToArticleOrSection(slug, ROUTES.EVENTS_SHOPPING)}
      />

      <MoreRodeoSection
        hubs={RODEO_HUBS}
        recurringEvents={RECURRING_RODEO_EVENTS}
        onOpenArticle={() => router.push(ROUTES.MORE_RODEO)}
      />

      <LearningSection resources={LEARNING_RESOURCES} />
    </div>
  );
};

export default HomeView;
