import 'server-only';
import { getSectionMeta, getPublishedArticlesBySection, getAllDisciplines } from '../content';
import { getPublishedSections, getDraftSections } from './pageLayoutService';
import { idListProp, pickedThenAuto } from './slotUtils';
import type { SectionSlot } from './sectionRegistry';
import type { Article, Discipline } from '../../types';

export interface LandingSlotData {
  featuredStory?: Article | null;
  secondaryStories?: Article[];
  disciplines?: Discipline[];
  sectionMeta?: { name: string; tagline: string; description: string; path: string };
  sectionKey?: string;
  totalArticleCount?: number;
  pillsVisible?: boolean;
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
  const fetchSections = options?.draft ? getDraftSections : getPublishedSections;
  const layoutSections = await fetchSections(`section:${sectionKey}`);
  const visible = layoutSections.filter((s) => s.visible).sort((a, b) => a.order - b.order);

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

  const needsDisciplines = sectionKey === 'competition';
  const disciplines = needsDisciplines ? await getAllDisciplines() : [];

  const pillsSlot = visible.find((s) => s.sectionType === 'landing-stat-pills');
  const pillsVisible = pillsSlot?.visible !== false;

  const metaObj = { name: sectionMeta.name, tagline: sectionMeta.tagline, description: sectionMeta.description, path: sectionMeta.path };

  const out: ResolvedLandingSlot[] = [];

  for (const slot of visible) {
    const t = slot.sectionType;

    if (t === 'landing-stat-pills') continue;

    const base: LandingSlotData = { sectionMeta: metaObj, sectionKey, totalArticleCount: sectionArticles.length };

    if (t === 'landing-hero') {
      out.push({ slot, data: { ...base, pillsVisible } });
    } else if (t === 'landing-featured') {
      out.push({ slot, data: { ...base, featuredStory } });
    } else if (t === 'landing-grid') {
      out.push({ slot, data: { ...base, secondaryStories } });
    } else {
      out.push({ slot, data: base });
    }
  }

  if (needsDisciplines && disciplines.length > 0) {
    const heroIdx = out.findIndex((r) => r.slot.sectionType === 'landing-hero');
    const featuredIdx = out.findIndex((r) => r.slot.sectionType === 'landing-featured');
    const insertIdx = featuredIdx >= 0 ? featuredIdx + 1 : heroIdx >= 0 ? heroIdx + 1 : out.length;

    out.splice(insertIdx, 0, {
      slot: { id: 'landing-competition-disciplines', sectionType: 'landing-competition-disciplines', visible: true, order: -1, props: {} },
      data: { ...out[0]?.data ?? {}, disciplines },
    });
  }

  const emptyIdx = out.findIndex((r) => r.slot.sectionType === 'landing-featured');
  if (sectionArticles.length === 0) {
    const insertAt = emptyIdx >= 0 ? emptyIdx + 1 : out.length;
    out.splice(insertAt, 0, {
      slot: { id: 'landing-empty', sectionType: 'landing-empty', visible: true, order: -1, props: {} },
      data: { sectionMeta: metaObj, sectionKey, totalArticleCount: 0 },
    });
  }

  return out;
}
