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
import { numProp, idListProp, pickedThenAuto, createSelectionContext } from './slotUtils';
import type { Article, Discipline } from '../../types';
import type { QuickAccessLink } from './navTypes';
import type { SectionSlot } from './sectionRegistry';
import { selectRenderableSlots } from './slotSelection';

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
export { numProp, idListProp, pickedThenAuto, createSelectionContext } from './slotUtils';

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
  // Stage 07 Task A: the ONE authoritative selection (lib/cms/slotSelection.ts).
  // Applied here so no content query is issued for a hidden slot and the
  // deduplication context claims articles in render order. `PageRenderer`
  // applies the same function as the final authority; it is idempotent.
  const visible = selectRenderableSlots(slots);
  const has = (type: string) => visible.some((s) => s.sectionType === type);

  const [disciplines, quickAccessLinks, hubs, recurringEvents] = await Promise.all([
    has('competition') ? getAllDisciplines() : Promise.resolve([] as Discipline[]),
    has('quick-access') ? getQuickAccessLinks() : Promise.resolve([] as QuickAccessLink[]),
    has('more-rodeo') ? listPublicHubs() : Promise.resolve([]),
    has('more-rodeo') ? listPublicEvents() : Promise.resolve([]),
  ]);

  /**
   * One selection context for the whole page (Stage 05 — fixes KD-01).
   *
   * Previously a one-way `shownInHero` array was passed to `latest-coverage`
   * alone and never extended, so the category sections and `learning` could not
   * deduplicate against the hero or against each other. The live homepage
   * rendered one article three times and five others twice.
   */
  const ctx = createSelectionContext();
  const out: ResolvedHomeSlot[] = [];

  /**
   * The hero resolves first and claims first, regardless of where an admin has
   * placed it. The lead story is the page's headline act: if it also qualifies
   * for a category feed, the hero keeps it and the feed moves on. Resolving it
   * ahead of the loop is what makes that priority deterministic.
   */
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
    // Guard against the hero itself repeating its lead among the secondaries.
    const uniqueSecondary = secondary.filter((a) => a.id !== lead?.id);
    ctx.claim([lead?.id, ...uniqueSecondary.map((a) => a.id)]);
    heroData = { lead, secondary: uniqueSecondary };
  }

  for (const slot of visible) {
    const t = slot.sectionType;
    const count = numProp(slot.props, 'articleCount', DEFAULT_COUNTS[t] ?? 4, 0, 12);
    let data: HomeSlotData = {};

    if (t === 'editorial-hero') data = heroData ?? {};
    else if (t === 'latest-coverage') {
      data.articles = await pickedThenAuto(slot.props, count, (need, ex) => getLatestArticles(need, ex), ctx);
    } else if (SECTION_CATEGORY[t]) {
      // Category relevance is preserved: the filter is unchanged, only the
      // exclude list now carries everything already placed on the page.
      const categoryKey = PRIMARY_SECTIONS[SECTION_CATEGORY[t]].categoryKey;
      data.articles = await pickedThenAuto(slot.props, count, (need, ex) => getPublishedArticlesBySection(categoryKey, { limit: need, excludeIds: ex }), ctx);
    } else if (t === 'learning') {
      data.articles = await pickedThenAuto(slot.props, count, async (need, ex) => (await getEvergreenArticles(need + ex.length)).filter((a) => !ex.includes(a.id)).slice(0, need), ctx);
    } else if (t === 'competition') data.disciplines = disciplines;
    else if (t === 'quick-access') data.quickAccessLinks = quickAccessLinks;
    else if (t === 'more-rodeo') { data.hubs = hubs; data.recurringEvents = recurringEvents; }

    out.push({ slot, data });
  }
  return out;
}
