import 'server-only';
import { getPublishedSections, getDraftSections } from './pageLayoutService';
import { getKnownSectionTypes, getPageFamily, type SectionSlot } from './sectionRegistry';
import { selectRenderableSlots } from './slotSelection';
import type { DirectoryListingData } from '@/components/blocks/DirectoryBlocks';

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

/**
 * What the ROUTE supplies for the listing block (Stage 07 Task F).
 *
 * The database query stays in the route. It depends on `searchParams`, it is
 * already bounded (`take: PAGE_SIZE`) and page-clamped, and it is the
 * authoritative read for competitor and venue records. The resolver only
 * attaches the result to the `directory-grid` slot, so there is exactly one
 * query per request and no entity data is ever copied into layout JSON.
 */
export interface DirectoryListingInput extends DirectoryListingData {
  /** Heading used when the operator has not set `directory-hero.title`. */
  defaultHeroTitle: string;
  /** Description used when the operator has not set `directory-hero.description`. */
  defaultHeroDescription: string;
}

export interface ResolveDirectoryOptions {
  draft?: boolean;
  listing?: DirectoryListingInput;
}

function str(props: Record<string, unknown>, key: string): string {
  const v = props[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Resolve the slots of a directory page.
 *
 * REGISTRY-DRIVEN SINCE STAGE 07 TASK F. It previously emitted exactly two
 * types — `directory-hero` and `directory-cta` — and dropped everything else,
 * so a visible, saved, schema-valid block simply vanished from the page with no
 * error anywhere. That is the defect the approved Stage 02 architecture names in
 * §3.4: "The registry, not the resolver, must decide what a family can render."
 *
 * Now every slot whose type the family recognises is emitted. Types that need
 * data get it; the rest pass through with empty data and are rendered from their
 * own props, which is how `rich-text-block` works on a directory page.
 */
export async function resolveDirectorySlots(
  pageKey: string,
  options?: ResolveDirectoryOptions,
): Promise<ResolvedDirectorySlot[]> {
  const fetchSections = options?.draft ? getDraftSections : getPublishedSections;
  const layoutSections = await fetchSections(pageKey);
  // Stage 07 Task A: one shared selection, not a fifth hand-written copy.
  const visible = selectRenderableSlots(layoutSections);

  const known = getKnownSectionTypes(getPageFamily(pageKey));
  const listing = options?.listing;
  const out: ResolvedDirectorySlot[] = [];

  for (const slot of visible) {
    const t = slot.sectionType;
    // A type the family does not recognise is left to PageRenderer, which logs
    // it once and shows the operator a notice in the canvas. Emitting it here
    // rather than dropping it is what makes a retired or unknown slot visible
    // to the person who has to remove it.
    if (!known.has(t)) {
      out.push({ slot, data: {} });
      continue;
    }

    if (t === 'directory-hero') {
      const title = str(slot.props, 'title').trim();
      const description = str(slot.props, 'description').trim();
      out.push({
        slot,
        data: {
          // The route's default is applied HERE rather than in the block, so the
          // block has one source of truth for its heading and the public page
          // keeps the exact text it had before Stage 07.
          heroTitle: title || listing?.defaultHeroTitle || '',
          heroDescription: description || listing?.defaultHeroDescription || '',
          heroImageUrl: str(slot.props, 'heroImageUrl'),
        },
      });
    } else if (t === 'directory-grid') {
      // No listing input means no route supplied one — the Builder canvas
      // renders the page through the real route, so in practice this is only
      // the case for a caller that has not been updated. Empty data renders the
      // search form and an honest empty state rather than throwing.
      out.push({ slot, data: { ...(listing ?? {}) } });
    } else if (t === 'directory-cta') {
      out.push({
        slot,
        data: {
          ctaText: str(slot.props, 'ctaText'),
          ctaUrl: str(slot.props, 'ctaUrl') || '/',
        },
      });
    } else {
      // Prop-driven presentation blocks (e.g. rich-text-block) need no data.
      out.push({ slot, data: {} });
    }
  }

  return out;
}
