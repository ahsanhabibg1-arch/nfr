import 'server-only';
import { getSectionMeta, getPublishedArticlesBySection, getAllDisciplines } from '../content';
import { getPublishedSections, getDraftSections } from './pageLayoutService';
import { idListProp, limitList, pickedThenAuto } from './slotUtils';
import type { SectionSlot } from './sectionRegistry';
import { selectRenderableSlots, orderAfter } from './slotSelection';
import type { Article, Discipline } from '../../types';
import { getSubcategoryCardsForSection, type SubcategoryCard } from './subcategoryContent';

export interface LandingSlotData {
  featuredStory?: Article | null;
  secondaryStories?: Article[];
  disciplines?: Discipline[];
  sectionMeta?: { name: string; tagline: string; description: string; path: string };
  sectionKey?: string;
  totalArticleCount?: number;
  pillsVisible?: boolean;
  /**
   * Stage 02 (H-04) — the administrator's `SectionConfig.heroImage`, offered to
   * the hero block as a FALLBACK only. The Visual Builder remains the owner of
   * the section hero: when `landing-hero.heroImageUrl` is set it wins, and this
   * value is never applied over it.
   */
  sectionHeroImage?: string | null;
  /**
   * The section's active subcategories, with their published article counts.
   *
   * Supplied to EVERY section landing, not placed by an operator: a subcategory
   * archive has no other entry point, so if the hero did not list them the
   * pages would exist with nothing linking to them.
   */
  subcategories?: SubcategoryCard[];
}

export interface ResolvedLandingSlot {
  slot: SectionSlot;
  data: LandingSlotData;
}

export async function resolveSectionLandingSlots(
  sectionKey: string,
  options?: { draft?: boolean },
): Promise<ResolvedLandingSlot[]> {
  const sectionMeta = (await getSectionMeta(sectionKey))!;
  // Stage 02 (H-04): read alongside the meta, from the same row `getSectionMeta`
  // already consults, so this adds one query per section-landing render and no
  // per-slot work.
  const { getSectionConfig } = await import('./sectionConfigService');
  const sectionHeroImage = (await getSectionConfig(sectionKey))?.heroImage ?? null;
  const subcategories = await getSubcategoryCardsForSection(sectionMeta.categoryKey);
  const fetchSections = options?.draft ? getDraftSections : getPublishedSections;
  const layoutSections = await fetchSections(`section:${sectionKey}`);
  const visible = selectRenderableSlots(layoutSections);

  const sectionArticles = await getPublishedArticlesBySection(sectionMeta.categoryKey);

  const featuredSlot = visible.find((s) => s.sectionType === 'landing-featured');
  const hasPicked = featuredSlot ? idListProp(featuredSlot.props, 'featuredIds').length > 0 : false;
  let featuredStory: Article | null;
  let secondaryStories: Article[];
  if (hasPicked && featuredSlot) {
    const picked = await pickedThenAuto(featuredSlot.props, 1, async (need, ex) => {
      const eligible = sectionArticles.filter((a) => !ex.includes(a.id));
      return eligible.slice(0, need);
    });
    featuredStory = picked[0] ?? null;
    secondaryStories = sectionArticles.filter((a) => a.id !== featuredStory?.id);
  } else {
    featuredStory = sectionArticles[0] ?? null;
    secondaryStories = sectionArticles.slice(1);
  }

  /**
   * Discipline data (Stage 07 Task E).
   *
   * Fetched when the section HAS disciplines (Competition) or when an operator
   * has placed a `landing-competition-disciplines` block, so a stored slot is
   * never rendered empty merely because the resolver did not look. One source —
   * the existing `getAllDisciplines()` — and no second competition data path.
   */
  const storedDisciplineSlot = visible.find((s) => s.sectionType === 'landing-competition-disciplines');
  const needsDisciplines = sectionKey === 'competition';
  const disciplines = needsDisciplines || storedDisciplineSlot ? await getAllDisciplines() : [];

  const pillsSlot = visible.find((s) => s.sectionType === 'landing-stat-pills');
  const pillsVisible = pillsSlot?.visible !== false;

  const metaObj = { name: sectionMeta.name, tagline: sectionMeta.tagline, description: sectionMeta.description, path: sectionMeta.path };

  const out: ResolvedLandingSlot[] = [];

  for (const slot of visible) {
    const t = slot.sectionType;

    if (t === 'landing-stat-pills') continue;

    const base: LandingSlotData = { sectionMeta: metaObj, sectionKey, totalArticleCount: sectionArticles.length, subcategories };

    if (t === 'landing-hero') {
      out.push({ slot, data: { ...base, pillsVisible, sectionHeroImage, subcategories } });
    } else if (t === 'landing-competition-disciplines') {
      // An operator-placed block gets the same data the injected one gets, so
      // the two paths cannot diverge (Stage 07 Task E).
      out.push({ slot, data: { ...base, disciplines } });
    } else if (t === 'landing-featured') {
      out.push({ slot, data: { ...base, featuredStory } });
    } else if (t === 'landing-grid') {
      // Stage 04 Task D: `landing-grid.articleCount` was declared but ignored —
      // the full secondary list was passed through unsliced. Declared max is 20;
      // an unset or zero value keeps the previous "show all" behaviour, so
      // layouts stored before the fix render exactly as before.
      const limited = limitList(secondaryStories, slot.props, 'articleCount', 20);
      out.push({ slot, data: { ...base, secondaryStories: limited } });
    } else {
      out.push({ slot, data: base });
    }
  }

  /**
   * Injected system slots (Stage 07 Task A).
   *
   * These two are spliced at a POSITIONAL index, so their `order` must agree
   * with that position. They previously carried the placeholder `order: -1`,
   * which made the array order and the order fields contradict each other: any
   * sort by `order` hoisted both blocks to the top of the page, putting the
   * discipline guides and the empty state above the section hero. That
   * contradiction is precisely why Stage 06 could not safely move sorting into
   * `PageRenderer`.
   *
   * `orderAfter` derives a real fractional order from the anchor slot, so the
   * composed position survives the renderer's authoritative sort. `lastOrder`
   * keeps an unanchored injection at the end, as the previous `out.length`
   * fallback did.
   */
  const lastOrder = out.length > 0 ? Math.max(...out.map((r) => r.slot.order)) + 1 : 0;

  /**
   * Inject the discipline guides ONLY when the operator has not placed the
   * block themselves (Stage 07 Task E).
   *
   * Without this guard the Competition page would render the grid twice the
   * moment an administrator added the now-registered block: once from their
   * stored slot and once from this injection. The injection remains as the
   * backward-compatible default, so the live page is unchanged until someone
   * takes deliberate control of it.
   */
  if (needsDisciplines && disciplines.length > 0 && !storedDisciplineSlot) {
    const heroIdx = out.findIndex((r) => r.slot.sectionType === 'landing-hero');
    const featuredIdx = out.findIndex((r) => r.slot.sectionType === 'landing-featured');
    const anchorIdx = featuredIdx >= 0 ? featuredIdx : heroIdx;
    const insertIdx = anchorIdx >= 0 ? anchorIdx + 1 : out.length;

    out.splice(insertIdx, 0, {
      slot: {
        id: 'landing-competition-disciplines',
        sectionType: 'landing-competition-disciplines',
        visible: true,
        order: orderAfter(anchorIdx >= 0 ? out[anchorIdx].slot : undefined, lastOrder),
        props: {},
      },
      data: { ...out[0]?.data ?? {}, disciplines },
    });
  }

  if (sectionArticles.length === 0) {
    const emptyAnchorIdx = out.findIndex((r) => r.slot.sectionType === 'landing-featured');
    const insertAt = emptyAnchorIdx >= 0 ? emptyAnchorIdx + 1 : out.length;
    out.splice(insertAt, 0, {
      slot: {
        id: 'landing-empty',
        sectionType: 'landing-empty',
        visible: true,
        order: orderAfter(emptyAnchorIdx >= 0 ? out[emptyAnchorIdx].slot : undefined, lastOrder),
        props: {},
      },
      data: { sectionMeta: metaObj, sectionKey, totalArticleCount: 0 },
    });
  }

  return out;
}
