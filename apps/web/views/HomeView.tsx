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

import {
  HERO_ARTICLE,
  SECONDARY_HERO_STORIES,
  LATEST_COVERAGE_ARTICLES,
  QUICK_ACCESS_ITEMS,
  SEVEN_DISCIPLINES,
  PLAN_AND_WATCH_GUIDES,
  ENTERTAINMENT_FEATURES,
  SHOPPING_EVENTS,
  RODEO_HUBS,
  RECURRING_RODEO_EVENTS,
  LEARNING_RESOURCES,
} from '../data/mockEditorialData';
import { Article, Discipline } from '../types';
import { ROUTES } from '../config/routes';

export const HomeView: React.FC = () => {
  const router = useRouter();

  const handleSelectArticle = (article: Article) => {
    router.push(ROUTES.ARTICLE(article.slug));
  };

  const handleSelectDiscipline = (discipline: Discipline) => {
    router.push(ROUTES.DISCIPLINE(discipline.slug));
  };

  const handleSelectArticleBySlug = (slug: string) => {
    router.push(ROUTES.ARTICLE(slug));
  };

  // Batch 01 bug fix (§14): navigate using the card's real article slug when one
  // exists; otherwise fall back to the relevant section landing page instead of
  // guessing an article from the title (the removed Phase 0 behaviour).
  const goToArticleOrSection = (slug: string | undefined, sectionPath: string) => {
    router.push(slug ? ROUTES.ARTICLE(slug) : sectionPath);
  };

  const handleNavigateSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="w-full flex flex-col">
      {/* SECTION A — Cinematic Editorial Hero */}
      <EditorialHero
        leadArticle={HERO_ARTICLE}
        secondaryStories={SECONDARY_HERO_STORIES}
        onSelectArticle={handleSelectArticle}
      />

      {/* SECTION B — Latest NFR Coverage */}
      <LatestCoverage
        articles={LATEST_COVERAGE_ARTICLES}
        onSelectArticle={handleSelectArticle}
      />

      {/* SECTION C — NFR Quick Access */}
      <QuickAccess
        items={QUICK_ACCESS_ITEMS}
        onNavigateSection={handleNavigateSection}
      />

      {/* SECTION D — NFR Competition (Seven Disciplines) */}
      <CompetitionSection
        disciplines={SEVEN_DISCIPLINES}
        onSelectDiscipline={handleSelectDiscipline}
      />

      {/* SECTION E — Plan & Watch */}
      <PlanAndWatchSection
        guides={PLAN_AND_WATCH_GUIDES}
        onSelectArticleBySlug={handleSelectArticleBySlug}
      />

      {/* SECTION F — Entertainment & Fan Experiences */}
      <EntertainmentSection
        features={ENTERTAINMENT_FEATURES}
        onOpenArticle={(slug) => goToArticleOrSection(slug, ROUTES.ENTERTAINMENT)}
      />

      {/* SECTION G — Events & Shopping */}
      <EventsShoppingSection
        events={SHOPPING_EVENTS}
        onOpenArticle={(slug) => goToArticleOrSection(slug, ROUTES.EVENTS_SHOPPING)}
      />

      {/* SECTION H — More Rodeo */}
      <MoreRodeoSection
        hubs={RODEO_HUBS}
        recurringEvents={RECURRING_RODEO_EVENTS}
        onOpenArticle={() => router.push(ROUTES.MORE_RODEO)}
      />

      {/* SECTION I — Evergreen Learning Resources */}
      <LearningSection
        resources={LEARNING_RESOURCES}
      />
    </div>
  );
};

export default HomeView;
