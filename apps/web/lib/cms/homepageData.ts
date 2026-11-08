import 'server-only';
import {
  getHeroArticle,
  getSecondaryHeroStories,
  getLatestArticles,
  getAllDisciplines,
  getPublishedArticlesBySection,
  getPublishedArticlesByIds,
  getEvergreenArticles,
} from '../content';
import { listPublicHubs, listPublicEvents } from '../rodeoContent';
import { getQuickAccessLinks } from './navigationService';
import { PRIMARY_SECTIONS } from '../../config/routes';
import { numProp, idListProp, pickedThenAuto } from './slotUtils';
import type { Article, Discipline } from '../../types';
import type { QuickAccessLink } from './navTypes';
import type { SectionSlot } from './sectionRegistry';

/**
 * Homepage data resolver — turns each page-builder slot into the data that slot needs,
 * driven by the slot's own props (article count, hand-picked articles, hero image...).
 *
 * Before this existed the homepage fetched one fixed data set and every section ignored
 * its props, so edits made in the Page Builder never reached the public site.
 */

export interface HomeSlotData {
  /** Articles for article-driven sections (latest, plan & watch, entertainment, ...). */
  articles?: Article[];
  /** Editorial hero: lead + secondary stories. */
  lead?: Article | null;
  secondary?: Article[];
  disciplines?: Discipline[];
  quickAccessLinks?: QuickAccessLink[];
  hubs?: Awaited<ReturnType<typeof listPublicHubs>>;
  recurringEvents?: Awaited<ReturnType<typeof listPublicEvents>>;
}

export interface ResolvedHomeSlot {
  slot: SectionSlot;
  data: HomeSlotData;
}

/* ── re-export shared helpers for existing external consumers ───── */
export { numProp, idListProp, pickedThenAuto } from './slotUtils';

const SECTION_CATEGORY: Record<string, string> = {
  'plan-and-watch': 'plan-watch',
  entertainment: 'entertainment',
  'events-shopping': 'events-shopping',
};

const DEFAULT_COUNTS: Record<string, number> = {
  'latest-coverage': 6,
  'plan-and-watch': 4,
  entertainment: 3,
  'events-shopping': 3,
  learning: 4,
};

/**
 * Resolve data for every visible slot. Shared datasets (disciplines, hubs, quick links)
 * are fetched once and only when a slot that needs them is on the page.
 */
export async function resolveHomepageSlots(slots: SectionSlot[]): Promise<ResolvedHomeSlot[]> {
  const visible = slots.filter((s) => s.visible).sort((a, b) => a.order - b.order);
  const has = (type: string) => visible.some((s) => s.sectionType === type);

  const [disciplines, quickAccessLinks, hubs, recurringEvents] = await Promise.all([
    has('competition') ? getAllDisciplines() : Promise.resolve([] as Discipline[]),
    has('quick-access') ? getQuickAccessLinks() : Promise.resolve([] as QuickAccessLink[]),
    has('more-rodeo') ? listPublicHubs() : Promise.resolve([]),
    has('more-rodeo') ? listPublicEvents() : Promise.resolve([]),
  ]);

  // Articles shown in the hero are not repeated in "Latest" sections.
  const shownInHero: string[] = [];
  const out: ResolvedHomeSlot[] = [];

  // Hero first so its articles can be excluded from later "latest" feeds.
  const heroSlot = visible.find((s) => s.sectionType === 'editorial-hero');
  let heroData: HomeSlotData | null = null;
  if (heroSlot) {
    const pickedLead = (await getPublishedArticlesByIds(idListProp(heroSlot.props, 'featuredIds')))[0];
    const lead = pickedLead ?? (await getHeroArticle());
    const secondaryCount = numProp(heroSlot.props, 'secondaryCount', 2, 0, 4);
    const secondary = secondaryCount > 0 ? await getSecondaryHeroStories(secondaryCount, lead?.id) : [];
    if (secondary.length < secondaryCount) {
      const more = await getLatestArticles(secondaryCount - secondary.length, [lead?.id, ...secondary.map((a) => a.id)].filter(Boolean) as string[]);
      secondary.push(...more);
    }
    shownInHero.push(...[lead?.id, ...secondary.map((a) => a.id)].filter(Boolean) as string[]);
    heroData = { lead, secondary };
  }

  for (const slot of visible) {
    const t = slot.sectionType;
    const count = numProp(slot.props, 'articleCount', DEFAULT_COUNTS[t] ?? 4, 0, 12);
    let data: HomeSlotData = {};

    if (t === 'editorial-hero') data = heroData ?? {};
    else if (t === 'latest-coverage') {
      data.articles = await pickedThenAuto(slot.props, count, (need, ex) => getLatestArticles(need, [...shownInHero, ...ex]));
    } else if (SECTION_CATEGORY[t]) {
      const categoryKey = PRIMARY_SECTIONS[SECTION_CATEGORY[t]].categoryKey;
      data.articles = await pickedThenAuto(slot.props, count, (need, ex) => getPublishedArticlesBySection(categoryKey, { limit: need, excludeIds: ex }));
    } else if (t === 'learning') {
      data.articles = await pickedThenAuto(slot.props, count, async (need, ex) => (await getEvergreenArticles(need + ex.length)).filter((a) => !ex.includes(a.id)).slice(0, need));
    } else if (t === 'competition') data.disciplines = disciplines;
    else if (t === 'quick-access') data.quickAccessLinks = quickAccessLinks;
    else if (t === 'more-rodeo') { data.hubs = hubs; data.recurringEvents = recurringEvents; }

    out.push({ slot, data });
  }
  return out;
}
