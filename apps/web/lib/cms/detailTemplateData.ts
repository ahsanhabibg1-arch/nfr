import 'server-only';
import { getRelatedPublishedArticles, getPublishedArticlesBySection, getPublishedArticlesByCategory } from '../content';
import { getPublishedSections, getDraftSections } from './pageLayoutService';
import type { SectionSlot } from './sectionRegistry';

export interface DetailSlotData {
  relatedArticles?: unknown[];
  ctaText?: string;
  ctaUrl?: string;
  [key: string]: unknown;
}

export interface ResolvedDetailSlot {
  slot: SectionSlot;
  data: DetailSlotData;
}

export async function resolveArticleTemplateSlots(
  articleId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const fetchSections = options?.draft ? getDraftSections : getPublishedSections;
  const layoutSections = await fetchSections('template:article');
  const visible = layoutSections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  const out: ResolvedDetailSlot[] = [];

  for (const slot of visible) {
    const t = slot.sectionType;

    if (t === 'detail-related') {
      const count = Number(slot.props.articleCount) || 3;
      const relatedArticles = await getRelatedPublishedArticles(articleId, count);
      out.push({ slot, data: { relatedArticles } });
    } else if (t === 'detail-cta') {
      const ctaText = typeof slot.props.ctaText === 'string' ? slot.props.ctaText : '';
      const ctaUrl = typeof slot.props.ctaUrl === 'string' ? slot.props.ctaUrl : '/';
      out.push({ slot, data: { ctaText, ctaUrl } });
    }
  }

  return out;
}

/* ── Shared helper: resolve visible appendage slots for any template key ── */

function resolveAppendageSlots(
  visible: SectionSlot[],
  getRelated: (count: number) => Promise<unknown[]>,
): Promise<ResolvedDetailSlot[]> {
  const out: ResolvedDetailSlot[] = [];
  const tasks: Promise<void>[] = [];

  for (const slot of visible) {
    const t = slot.sectionType;
    if (t === 'detail-related') {
      const count = Number(slot.props.articleCount) || 3;
      const idx = out.length;
      out.push({ slot, data: {} });
      tasks.push(getRelated(count).then((relatedArticles) => { out[idx].data = { relatedArticles }; }));
    } else if (t === 'detail-cta') {
      const ctaText = typeof slot.props.ctaText === 'string' ? slot.props.ctaText : '';
      const ctaUrl = typeof slot.props.ctaUrl === 'string' ? slot.props.ctaUrl : '/';
      out.push({ slot, data: { ctaText, ctaUrl } });
    }
  }

  return Promise.all(tasks).then(() => out);
}

async function fetchVisibleSlots(pageKey: string, options?: { draft?: boolean }): Promise<SectionSlot[]> {
  const fetchSections = options?.draft ? getDraftSections : getPublishedSections;
  const layoutSections = await fetchSections(pageKey);
  return layoutSections.filter((s) => s.visible).sort((a, b) => a.order - b.order);
}

/* ── Rodeo Hub / Event template ────────────────────────────────────────── */

export async function resolveRodeoHubTemplateSlots(
  _entityId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:rodeo-hub', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}

/* ── Rodeo Edition template ────────────────────────────────────────────── */

export async function resolveRodeoEditionTemplateSlots(
  _editionId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:rodeo-edition', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}

/* ── Discipline template ───────────────────────────────────────────────── */

export async function resolveDisciplineTemplateSlots(
  _disciplineId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:discipline', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('competition', { limit: count }),
  );
}

/* ── Category template ─────────────────────────────────────────────────── */

export async function resolveCategoryTemplateSlots(
  categorySlug: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:category', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesByCategory(categorySlug).then((a) => a.slice(0, count)),
  );
}

/* ── Competitor template ───────────────────────────────────────────────── */

export async function resolveCompetitorTemplateSlots(
  _competitorId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:competitor', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}

/* ── Venue template ────────────────────────────────────────────────────── */

export async function resolveVenueTemplateSlots(
  _venueId: string,
  options?: { draft?: boolean },
): Promise<ResolvedDetailSlot[]> {
  const visible = await fetchVisibleSlots('template:venue', options);
  return resolveAppendageSlots(visible, (count) =>
    getPublishedArticlesBySection('rodeo-events', { limit: count }),
  );
}
