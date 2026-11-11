'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import type { BlockProps } from './blockProps';
import { slotStr } from './blockProps';
import { copyFromProps } from '@/components/sections/sectionCopy';
import { ROUTES } from '@/config/routes';
import type { Article, Discipline } from '@/types';
import type { HomeSlotData } from '@/lib/cms/homepageData';

import { EditorialHero } from '@/components/sections/EditorialHero';
import { LatestCoverage } from '@/components/sections/LatestCoverage';
import { QuickAccess } from '@/components/sections/QuickAccess';
import { CompetitionSection } from '@/components/sections/CompetitionSection';
import { PlanAndWatchSection } from '@/components/sections/PlanAndWatchSection';
import { EntertainmentSection } from '@/components/sections/EntertainmentSection';
import { EventsShoppingSection } from '@/components/sections/EventsShoppingSection';
import { MoreRodeoSection, type MoreRodeoHubCard, type MoreRodeoEventCard } from '@/components/sections/MoreRodeoSection';
import { LearningSection } from '@/components/sections/LearningSection';

import { RichTextBlock, ImageTextBlock, StatsBanner, CtaBanner, FaqBlock } from './PremiumBlocks';
import { LandingHeroBlock, LandingFeaturedBlock, LandingEmptyState, LandingGridBlock, CompetitionDisciplinesBlock } from './LandingBlocks';
import { DetailRelatedBlock, DetailCtaBlock } from './DetailBlocks';
import { DirectoryHeroBlock, DirectoryGridBlock, DirectoryCtaBlock } from './DirectoryBlocks';

type BlockComponent = React.FC<BlockProps>;

function hd(data: Record<string, unknown>): HomeSlotData {
  return data as unknown as HomeSlotData;
}

/**
 * Stage 08 Task H: no `useRouter` here any more. `EditorialHero` now renders
 * real `next/link` anchors, so the click handler that existed only to call
 * `router.push` is gone — along with one of the four `useRouter` dependencies
 * Stage 07 measured when it declined the server-component conversion.
 */
function EditorialHeroBlock({ slot, data }: BlockProps) {
  const copy = copyFromProps(slot.props);
  const d = hd(data);
  if (!d.lead) return null;
  return (
    <EditorialHero
      leadArticle={d.lead}
      secondaryStories={d.secondary ?? []}
      heroImageUrl={slotStr(slot, 'heroImageUrl')}
      heroImageAlt={slotStr(slot, 'heroImageAlt')}
      kicker={copy.kicker}
      ctaText={copy.ctaText}
    />
  );
}

function LatestCoverageBlock({ slot, data }: BlockProps) {
  const router = useRouter();
  const copy = copyFromProps(slot.props);
  const d = hd(data);
  if (!d.articles?.length) return null;
  return (
    <LatestCoverage
      articles={d.articles}
      onSelectArticle={(a: Article) => router.push(ROUTES.ARTICLE(a.slug))}
      copy={copy}
      anchorId={`latest-coverage-${slot.id}`}
    />
  );
}

function QuickAccessBlock({ slot, data }: BlockProps) {
  const copy = copyFromProps(slot.props);
  const d = hd(data);
  return (
    <QuickAccess
      copy={copy}
      items={(d.quickAccessLinks ?? []).map((qa) => ({
        id: qa.id,
        title: qa.label,
        description: qa.description,
        category: '',
        targetSectionId: '',
        targetRoute: qa.url,
      }))}
      onNavigateSection={(sectionId: string) => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }}
    />
  );
}

function CompetitionBlock({ slot, data }: BlockProps) {
  const router = useRouter();
  const copy = copyFromProps(slot.props);
  const d = hd(data);
  return (
    <CompetitionSection
      disciplines={d.disciplines ?? []}
      onSelectDiscipline={(disc: Discipline) => router.push(ROUTES.DISCIPLINE(disc.slug))}
      copy={copy}
    />
  );
}

function PlanAndWatchBlock({ slot, data }: BlockProps) {
  const copy = copyFromProps(slot.props);
  return <PlanAndWatchSection articles={hd(data).articles ?? []} copy={copy} />;
}

function EntertainmentBlock({ slot, data }: BlockProps) {
  const copy = copyFromProps(slot.props);
  return <EntertainmentSection articles={hd(data).articles ?? []} copy={copy} />;
}

function EventsShoppingBlock({ slot, data }: BlockProps) {
  const copy = copyFromProps(slot.props);
  return <EventsShoppingSection articles={hd(data).articles ?? []} copy={copy} />;
}

function MoreRodeoBlock({ slot, data }: BlockProps) {
  const copy = copyFromProps(slot.props);
  const d = hd(data);
  return (
    <MoreRodeoSection
      hubs={(d.hubs ?? []) as MoreRodeoHubCard[]}
      recurringEvents={(d.recurringEvents ?? []) as MoreRodeoEventCard[]}
      copy={copy}
    />
  );
}

function LearningBlock({ slot, data }: BlockProps) {
  const copy = copyFromProps(slot.props);
  return <LearningSection articles={hd(data).articles ?? []} copy={copy} />;
}

export const blockRegistry: Record<string, BlockComponent> = {
  'editorial-hero': EditorialHeroBlock,
  'latest-coverage': LatestCoverageBlock,
  'quick-access': QuickAccessBlock,
  'competition': CompetitionBlock,
  'plan-and-watch': PlanAndWatchBlock,
  'entertainment': EntertainmentBlock,
  'events-shopping': EventsShoppingBlock,
  'more-rodeo': MoreRodeoBlock,
  'learning': LearningBlock,

  'rich-text-block': RichTextBlock,
  'image-text-block': ImageTextBlock,
  'stats-banner': StatsBanner,
  'cta-banner': CtaBanner,
  'faq-block': FaqBlock,
  // 'newsletter-signup' is RETIRED (Stage 05, owner decision D-11). With no
  // registry entry, PageRenderer skips a legacy slot: no form is rendered, no
  // input is presented, and no visitor data can be collected. The definition
  // remains in sectionRegistry marked `retired` so a layout stored before the
  // retirement stays valid and editable.

  'landing-hero': LandingHeroBlock,
  'landing-featured': LandingFeaturedBlock,
  'landing-empty': LandingEmptyState,
  'landing-grid': LandingGridBlock,
  'landing-competition-disciplines': CompetitionDisciplinesBlock,

  'detail-related': DetailRelatedBlock,
  'detail-cta': DetailCtaBlock,

  /**
   * Stage 07 Task F gave the directory hero and listing real renderers.
   *
   * `directory-hero` previously had its text read straight out of the resolved
   * slot by each route, so it produced no element and could not be selected on
   * the canvas, and its `heroImageUrl` was dropped. `directory-grid` was
   * `required: true` with no renderer at all — unremovable and invisible.
   * Both now render, which is what makes the Admin's "Editable" label true.
   */
  'directory-hero': DirectoryHeroBlock,
  'directory-grid': DirectoryGridBlock,
  'directory-cta': DirectoryCtaBlock,
};
