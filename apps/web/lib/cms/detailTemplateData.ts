import 'server-only';
import { getRelatedPublishedArticles } from '../content';
import { getPublishedSections } from './pageLayoutService';
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
): Promise<ResolvedDetailSlot[]> {
  const layoutSections = await getPublishedSections('template:article');
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
