import 'server-only';
import { getPublishedSections, getDraftSections } from './pageLayoutService';
import type { SectionSlot } from './sectionRegistry';

export interface DirectorySlotData {
  heroTitle?: string;
  heroDescription?: string;
  heroImageUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  [key: string]: unknown;
}

export interface ResolvedDirectorySlot {
  slot: SectionSlot;
  data: DirectorySlotData;
}

export async function resolveDirectorySlots(
  pageKey: string,
  options?: { draft?: boolean },
): Promise<ResolvedDirectorySlot[]> {
  const fetchSections = options?.draft ? getDraftSections : getPublishedSections;
  const layoutSections = await fetchSections(pageKey);
  const visible = layoutSections
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  const out: ResolvedDirectorySlot[] = [];

  for (const slot of visible) {
    const t = slot.sectionType;

    if (t === 'directory-hero') {
      const heroTitle = typeof slot.props.title === 'string' ? slot.props.title : '';
      const heroDescription = typeof slot.props.description === 'string' ? slot.props.description : '';
      const heroImageUrl = typeof slot.props.heroImageUrl === 'string' ? slot.props.heroImageUrl : '';
      out.push({ slot, data: { heroTitle, heroDescription, heroImageUrl } });
    } else if (t === 'directory-cta') {
      const ctaText = typeof slot.props.ctaText === 'string' ? slot.props.ctaText : '';
      const ctaUrl = typeof slot.props.ctaUrl === 'string' ? slot.props.ctaUrl : '/';
      out.push({ slot, data: { ctaText, ctaUrl } });
    }
  }

  return out;
}
