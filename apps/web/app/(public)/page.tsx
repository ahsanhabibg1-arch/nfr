import type { Metadata } from 'next';
import { HomeView } from '@/views/HomeView';
import { buildMetadata } from '@/lib/seo';
import {
  getHeroArticle,
  getSecondaryHeroStories,
  getLatestArticles,
  getAllDisciplines,
  getPublishedArticlesBySection,
  getEvergreenArticles,
} from '@/lib/content';
import { listPublicHubs, listPublicEvents } from '@/lib/rodeoContent';
import { getQuickAccessLinks } from '@/lib/cms/navigationService';
import { getPublishedSections } from '@/lib/cms/pageLayoutService';
import { getActiveAnnouncements } from '@/lib/cms/announcementService';
import { getActiveBlocksForPlacement } from '@/lib/cms/globalBlockService';
import { getPublished } from '@/lib/cms/siteConfigService';
import type { AppearanceConfig } from '@/lib/cms/siteConfigService';
import { PRIMARY_SECTIONS } from '@/config/routes';

export const revalidate = 60; // ISR: re-render homepage feeds at most once a minute.

export async function generateMetadata(): Promise<Metadata> {
  const hero = await getHeroArticle();
  return buildMetadata({
    title: 'NFRGuide — Independent Rodeo Editorial & Championship Coverage',
    description:
      'Independent rodeo editorial publication covering the National Finals Rodeo, championship competition, entertainment, and spectator guides.',
    path: '/',
    image: hero?.heroImage,
  });
}

export default async function HomePage() {
  const hero = await getHeroArticle();
  const secondary = await getSecondaryHeroStories(2, hero?.id);
  const exclude = [hero?.id, ...secondary.map((a) => a.id)].filter(Boolean) as string[];
  const latest = await getLatestArticles(6, exclude);
  const disciplines = await getAllDisciplines();
  const section = async (key: string, n: number) =>
    (await getPublishedArticlesBySection(PRIMARY_SECTIONS[key].categoryKey)).slice(0, n);
  const [planWatch, entertainment, eventsShopping, evergreen, hubs, events, quickAccess, layoutSections, announcements, topBlocks, bottomBlocks, appearance] = await Promise.all([
    section('plan-watch', 4),
    section('entertainment', 3),
    section('events-shopping', 3),
    getEvergreenArticles(4),
    listPublicHubs(),
    listPublicEvents(),
    getQuickAccessLinks(),
    getPublishedSections('homepage'),
    getActiveAnnouncements(5),
    getActiveBlocksForPlacement('homepage-top'),
    getActiveBlocksForPlacement('homepage-bottom'),
    getPublished<AppearanceConfig>('appearance'),
  ]);

  if (!hero) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-serif font-bold text-stone-900">No published coverage yet</h1>
        <p className="mt-2 text-sm text-stone-600 font-sans">
          The editorial database has no published articles. Run the seed to load demonstration content.
        </p>
      </div>
    );
  }

  return (
    <HomeView
      heroArticle={hero}
      secondaryStories={secondary}
      latestArticles={latest}
      disciplines={disciplines}
      planWatchArticles={planWatch}
      entertainmentArticles={entertainment}
      eventsShoppingArticles={eventsShopping}
      evergreenArticles={evergreen}
      hubs={hubs}
      recurringEvents={events}
      quickAccessLinks={quickAccess}
      layoutSections={layoutSections}
      announcements={announcements}
      topBlocks={topBlocks}
      bottomBlocks={bottomBlocks}
      appearance={appearance}
    />
  );
}
