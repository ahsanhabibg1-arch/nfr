import React from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useSEO } from '../utils/seo';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  useSEO({
    title: 'NFRGuide — Independent Rodeo Editorial & Championship Coverage',
    description: 'Independent rodeo editorial publication covering the National Finals Rodeo, championship competition, entertainment, and spectator guides.',
    canonicalPath: '/',
    ogImage: HERO_ARTICLE.heroImage,
  });

  const handleSelectArticle = (article: Article) => {
    navigate(ROUTES.ARTICLE(article.slug));
  };

  const handleSelectDiscipline = (discipline: Discipline) => {
    navigate(ROUTES.DISCIPLINE(discipline.slug));
  };

  const handleSelectArticleBySlug = (slug: string) => {
    navigate(ROUTES.ARTICLE(slug));
  };

  const handleOpenGenericStory = (title: string) => {
    // Navigate to a dedicated article or entertainment section
    if (title.toLowerCase().includes('residency') || title.toLowerCase().includes('concert')) {
      navigate(ROUTES.ARTICLE('country-music-residencies-after-parties-roundup'));
    } else if (title.toLowerCase().includes('cowboy christmas')) {
      navigate(ROUTES.ARTICLE('cowboy-christmas-2026-buyers-handcrafted-curation'));
    } else if (title.toLowerCase().includes('calgary') || title.toLowerCase().includes('cheyenne')) {
      navigate(ROUTES.ARTICLE('calgary-stampede-to-las-vegas-the-qualifying-pipeline'));
    } else {
      navigate(ROUTES.ARTICLE('inside-the-chutes-nfr-roughstock-intensity'));
    }
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
        onOpenArticle={handleOpenGenericStory}
      />

      {/* SECTION G — Events & Shopping */}
      <EventsShoppingSection
        events={SHOPPING_EVENTS}
        onOpenArticle={handleOpenGenericStory}
      />

      {/* SECTION H — More Rodeo */}
      <MoreRodeoSection
        hubs={RODEO_HUBS}
        recurringEvents={RECURRING_RODEO_EVENTS}
        onOpenArticle={handleOpenGenericStory}
      />

      {/* SECTION I — Evergreen Learning Resources */}
      <LearningSection
        resources={LEARNING_RESOURCES}
      />
    </div>
  );
};
