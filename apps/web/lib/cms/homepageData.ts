import 'server-only';
import {
  getHeroArticle,
  getSecondaryHeroStories,
  getLatestArticles,
  getAllDisciplines,
  getPublishedArticlesBySection,
  getPublishedArticlesByIds,
  getEvergreenArticles,
  resolveSectionCategoryResult,
  toCardArticle,
  toCardArticles,
  toCardArticlesWithLead,
} from '../content';
import { listPublicHubs, listPublicEvents } from '../rodeoContent';
import { getQuickAccessLinks } from './navigationService';
import { PRIMARY_SECTIONS } from '../../config/routes';
import { numProp, idListProp, pickedThenAuto, createSelectionContext } from './slotUtils';
import { stringProp, enumProp } from './slotProps';
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

/**
 * Stage 06-R (R-02) — how a category section may draw on content another
 * section has already taken.
 *
 * `strict` is the default and the pre-existing behaviour, so no stored layout
 * changes meaning when this ships.
 */
export const SELECTION_POLICIES = ['strict', 'smart-fallback', 'independent'] as const;
export type SelectionPolicy = (typeof SELECTION_POLICIES)[number];

/** Why a section ended up with nothing to show (R-02 §6.5). */
export type EmptyReason =
  | 'no-eligible-content'
  | 'allocated-elsewhere'
  | 'limited-by-configuration'
  /** FC-01: an explicit categoryId is configured but no longer resolves. */
  | 'invalid-source';

export interface HomeSlotData {
  /** Articles for article-driven sections (latest, plan & watch, entertainment, ...). */
  articles?: Article[];
  /**
   * Set when the section is empty, so the view can tell the visitor the truth.
   * "No articles have been published yet" is false — and damaging — when the
   * articles exist but are shown further up the same page.
   */
  emptyReason?: EmptyReason;
  /** True when Smart Fallback had to re-show content allocated elsewhere. */
  reusedAllocation?: boolean;
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

  /**
   * Stage 06 (UI-02) — slots RESOLVE by specificity, and RENDER in the admin's
   * order. Those are two different orders, and conflating them starved the
   * category sections.
   *
   * Claims are first-come (see `createSelectionContext`), and the loop used to
   * claim in page order. `latest-coverage` sits above the category sections on
   * the homepage and draws from EVERY category, so it took the newest articles
   * site-wide and the category sections below it resolved against whatever
   * happened to be left. A section whose articles were simply the most recent
   * ones on the site could be emptied by a generic feed that had no particular
   * need for them.
   *
   * Specificity order fixes that without weakening deduplication:
   *   1. the editorial hero (resolved above — the lead is the page's headline
   *      act and keeps that privilege wherever an admin places it),
   *   2. category-scoped sections, which can ONLY be filled from their own
   *      category,
   *   3. generic feeds (`latest-coverage`, `learning`), which can be filled
   *      from anything and so should take what is left, not take first.
   *
   * Nothing about relevance, limits, manual picks or ordering changes, and no
   * article can still appear twice. `out` is rebuilt in `visible` order below,
   * so the rendered page is exactly the layout the admin configured.
   */
  /**
   * Stage 09 (PERF) — drop the article BODY before it crosses into the client.
   *
   * MEASURED: the homepage HTML was 238 KB, of which 165 KB (69%) was React's
   * serialized flight payload, and inside it sat the full `structuredBody` and
   * `content` prose of all 16 articles — complete articles shipped to the
   * browser so that cards could show a title, a deck and a thumbnail.
   *
   * `components/blocks/registry.tsx` is a CLIENT component, so everything in
   * `HomeSlotData` is serialized across that boundary. No card reads the body
   * (verified across every section component), so emptying those two arrays
   * here removes the payload without changing a single rendered pixel or any
   * component's props.
   *
   * It is applied at this ONE choke point, immediately before the data is
   * handed over, so no caller has to remember to do it. Article DETAIL pages
   * are unaffected: they render the body from their own query, not from here.
   */
  const CARD_SAFE = toCardArticle;
  const cardSafe = (list: Article[] | undefined) => (list ? toCardArticles(list) : list);

  /**
   * One slot opts back in to a BOUNDED opening of the body: `latest-coverage`.
   *
   * Its featured card is stretched to the height of the card column beside it,
   * and that height is editorial — it follows however many articles the Builder
   * selected. `deck` and `excerpt` together run about five lines, several short
   * of a five-card column, and the remainder showed as a blank band under the
   * byline. No clamp can close it: a clamp limits text, it cannot produce any.
   *
   * So this slot keeps `CARD_LEAD_MAX_CHARS` of running text and nothing more.
   * The ceiling is what preserves the fix above: the body that mattered was the
   * UNBOUNDED one — sixteen complete articles, 165 KB of flight payload — and a
   * bounded opening costs single-digit kilobytes against it. `structuredBody`
   * stays stripped here as everywhere; it is the larger field and nothing on a
   * card reads it.
   *
   * Every other slot is untouched and still ships no body at all. The lead is
   * applied to the whole list rather than only the first article because the
   * block's category tabs re-pick the featured story on the client, so any of
   * them can become the card that needs the text.
   */
  const SLOTS_WITH_BODY_LEAD: ReadonlySet<SectionSlot['sectionType']> = new Set(['latest-coverage']);
  const cardSafeForSlot = (slot: SectionSlot, list: Article[] | undefined) => {
    if (!list) return list;
    return SLOTS_WITH_BODY_LEAD.has(slot.sectionType) ? toCardArticlesWithLead(list) : toCardArticles(list);
  };

  const resolved = new Map<SectionSlot, HomeSlotData>();

  const resolveArticleSlot = async (slot: SectionSlot): Promise<void> => {
    const t = slot.sectionType;
    const count = numProp(slot.props, 'articleCount', DEFAULT_COUNTS[t] ?? 4, 0, 12);
    const data: HomeSlotData = {};

    if (t === 'latest-coverage') {
      data.articles = await pickedThenAuto(slot.props, count, (need, ex) => getLatestArticles(need, ex), ctx);
    } else if (SECTION_CATEGORY[t]) {
      const categoryKey = PRIMARY_SECTIONS[SECTION_CATEGORY[t]].categoryKey;
      // R-01: the Builder's stored `categoryId` is the stable link; the
      // compiled-in key stays as the legacy fallback.
      const ref = { categoryId: stringProp(slot.props, 'categoryId'), token: categoryKey };
      const policy = enumProp(slot.props, 'selectionPolicy', SELECTION_POLICIES, 'strict');

      if (policy === 'independent') {
        /**
         * Section Independent — resolve from this section's own eligible
         * articles, ignoring what other sections took, and DO NOT claim. Not
         * claiming is the point: a section that permits cross-section reuse has
         * no business starving the sections after it. Within-section
         * deduplication is still mandatory, and `pickedThenAuto` enforces it
         * even with no context.
         */
        data.articles = await pickedThenAuto(slot.props, count, (need, ex) =>
          getPublishedArticlesBySection(ref, { limit: need, excludeIds: ex }),
        );
      } else {
        const unique = await pickedThenAuto(slot.props, count, (need, ex) =>
          getPublishedArticlesBySection(ref, { limit: need, excludeIds: ex }), ctx);
        data.articles = unique;

        if (policy === 'smart-fallback' && unique.length === 0) {
          /**
           * Smart Fallback — unique content first, reuse only to avoid a
           * MISLEADING empty state.
           *
           * This runs only when the unique pass returned nothing at all, which
           * is the starvation case: on the live homepage the editorial hero's
           * lead plus two secondaries were all three eligible Events & Shopping
           * articles, so the section below rendered "no articles published yet"
           * while three published articles sat on the same page.
           *
           * It borrows the minimum — `fallbackMinimum`, default 1 — never more
           * than the configured count, never from outside this section's own
           * category, and never the same article twice. The borrowed articles
           * are deliberately NOT claimed: they already belong to the slot that
           * took them first, and claiming again would move the starvation to
           * the next section rather than remove it.
           */
          const want = Math.min(numProp(slot.props, 'fallbackMinimum', 1, 1, 4), count);
          if (want > 0) {
            const borrowed = await getPublishedArticlesBySection(ref, { limit: want });
            const seen = new Set<string>();
            data.articles = borrowed.filter((a) => !seen.has(a.id) && seen.add(a.id)).slice(0, want);
            data.reusedAllocation = data.articles.length > 0;
          }
        }
      }

      // R-02 §6.5 / FC-01 — tell the section WHY it is empty, so it cannot claim
      // "nothing published" when the truth is "all of it is elsewhere", and so a
      // broken configuration is never mistaken for an empty category.
      if ((data.articles?.length ?? 0) === 0) {
        const resolution = await resolveSectionCategoryResult(ref);
        if (!resolution.ok && resolution.reason === 'invalid-id') data.emptyReason = 'invalid-source';
        else if (count === 0) data.emptyReason = 'limited-by-configuration';
        else {
          const anyEligible = await getPublishedArticlesBySection(ref, { limit: 1 });
          data.emptyReason = anyEligible.length > 0 ? 'allocated-elsewhere' : 'no-eligible-content';
        }
      }
    } else if (t === 'learning') {
      data.articles = await pickedThenAuto(slot.props, count, async (need, ex) => (await getEvergreenArticles(need + ex.length)).filter((a) => !ex.includes(a.id)).slice(0, need), ctx);
    }
    resolved.set(slot, data);
  };

  const isCategorySlot = (s: SectionSlot) => Boolean(SECTION_CATEGORY[s.sectionType]);
  const isGenericFeed = (s: SectionSlot) => s.sectionType === 'latest-coverage' || s.sectionType === 'learning';

  // Pass 1 — the narrow feeds claim before the broad ones. Sequential, because
  // each claim must be visible to the next slot's exclude list.
  for (const slot of visible.filter(isCategorySlot)) await resolveArticleSlot(slot);
  // Pass 2 — generic feeds fill from whatever remains.
  for (const slot of visible.filter(isGenericFeed)) await resolveArticleSlot(slot);

  for (const slot of visible) {
    const t = slot.sectionType;
    let data: HomeSlotData = resolved.get(slot) ?? {};

    if (t === 'editorial-hero') data = heroData ?? {};
    else if (t === 'competition') data.disciplines = disciplines;
    else if (t === 'quick-access') data.quickAccessLinks = quickAccessLinks;
    else if (t === 'more-rodeo') { data.hubs = hubs; data.recurringEvents = recurringEvents; }

    // Everything below this line is serialized into the client payload.
    out.push({
      slot,
      data: {
        ...data,
        ...(data.articles ? { articles: cardSafeForSlot(slot, data.articles) } : {}),
        ...(data.lead ? { lead: CARD_SAFE(data.lead) } : {}),
        ...(data.secondary ? { secondary: cardSafe(data.secondary) } : {}),
      },
    });
  }
  return out;
}
