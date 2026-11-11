import React from 'react';
import Link from 'next/link';
import { ImageWithCredit } from '@/components/ImageWithCredit';
import type { BlockProps } from './blockProps';
import { slotStr } from './blockProps';
import { numProp } from '@/lib/cms/slotProps';

/**
 * Directory blocks (Stage 07 Task F).
 *
 * WHAT CHANGED AND WHY
 *
 * A directory page used to be built entirely inside its route: the header, the
 * search form, the result count, the grid, the empty state and the pagination
 * were all literal JSX in `app/(public)/competitors/page.tsx` and
 * `.../venues/page.tsx`. The Builder's three directory slots sat alongside that
 * markup, and only one of them (`directory-cta`) actually rendered. So the
 * Builder claimed to manage a page whose entire body it did not touch.
 *
 * The markup now lives here, as two real blocks the renderer places in slot
 * order. Nothing about the DATA changed: the entries still come from the
 * route's `listPublicCompetitors` / `listPublicVenues` query and are passed in
 * through the resolver as `data`. No competitor or venue record is stored in
 * layout JSON — the Stage 02 non-duplication rule (§2.2) is intact, and the
 * query stays in the route where its bounded `take` and pagination clamp live.
 */

/* ── Shapes the route passes through the resolver ─────────────────── */

export interface DirectoryFilterOption {
  value: string;
  label: string;
}

export interface DirectoryListingItem {
  slug: string;
  href: string;
  title: string;
  /** Italicised secondary name, e.g. a competitor's "known as". */
  subtitle?: string | null;
  /** Plain line under the title, e.g. a hometown or a venue location. */
  meta?: string | null;
  /** Monospaced tag line, e.g. the disciplines a competitor rides. */
  tags?: string | null;
  /** Small uppercase badge, e.g. a competitor's status or a venue's capacity. */
  badge?: string | null;
}

export interface DirectoryListingData {
  items?: DirectoryListingItem[];
  total?: number;
  page?: number;
  totalPages?: number;
  /** Noun for counts and the empty state, e.g. "competitor". */
  entityLabel?: string;
  entityLabelPlural?: string;
  /** Current free-text query, echoed into the input and the count line. */
  query?: string;
  searchPlaceholder?: string;
  /** The one optional select filter a directory may expose. */
  filterName?: string;
  filterLabel?: string;
  filterAllLabel?: string;
  filterValue?: string;
  filterOptions?: DirectoryFilterOption[];
  /** Absolute path of this directory, used for Reset and pagination links. */
  basePath?: string;
  /** Prebuilt hrefs from the route, so no query string is reconstructed here. */
  prevHref?: string | null;
  nextHref?: string | null;
  resetHref?: string | null;
}

interface DirectoryHeroData {
  heroTitle?: string;
  heroDescription?: string;
  heroImageUrl?: string;
  heroKicker?: string;
}

interface DirectoryCtaData {
  ctaText?: string;
  ctaUrl?: string;
}

function hero(data: Record<string, unknown>): DirectoryHeroData {
  return data as unknown as DirectoryHeroData;
}

function listing(data: Record<string, unknown>): DirectoryListingData {
  return data as unknown as DirectoryListingData;
}

/* ── directory-hero ───────────────────────────────────────────────── */

/**
 * The listing page header, now a real block.
 *
 * Previously the two routes read `heroTitle` / `heroDescription` out of the
 * resolved slot and rendered them in their own markup, while `heroImageUrl` was
 * resolved and dropped. Rendering it here means the image works, the block gets
 * a `data-slot-id` and so becomes clickable on the Stage 06 canvas, and there is
 * one implementation instead of two near-identical copies.
 *
 * The `<h1>` stays here and nowhere else: the routes no longer emit one, so the
 * page still has exactly one top-level heading.
 */
export function DirectoryHeroBlock({ slot, data }: BlockProps) {
  const d = hero(data);
  // The resolver supplies the route's default when the operator left the field
  // empty, so a directory is never headed by a blank <h1>.
  const title = d.heroTitle?.trim();
  if (!title) return null;

  const kicker = slotStr(slot, 'kicker', 'Directory') || d.heroKicker || '';
  const description = d.heroDescription?.trim();
  const imageUrl = d.heroImageUrl?.trim();

  return (
    <header className="mb-6">
      {imageUrl && (
        <div className="mb-5 overflow-hidden rounded-xs border border-stone-200">
          <ImageWithCredit src={imageUrl} alt={title} aspectRatioClass="aspect-[21/9]" />
        </div>
      )}
      {kicker && (
        <p className="text-[11px] font-mono uppercase tracking-wider text-stone-500">{kicker}</p>
      )}
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 mt-1">{title}</h1>
      {description && <p className="text-stone-600 mt-2 max-w-2xl">{description}</p>}
    </header>
  );
}

/* ── directory-grid ───────────────────────────────────────────────── */

const COLUMN_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * The search form, the entries and the pagination.
 *
 * `required: true` in the registry is now truthful — this block renders the
 * functionality a listing page cannot do without, so an operator must not be
 * able to delete it. `systemContent: true` records the other half: the Builder
 * decides where this sits and how many columns it uses, and nothing else.
 *
 * `columns` was declared in the registry and ignored for three stages. It is
 * read through the shared `numProp`, so an out-of-range stored value is clamped
 * to the declared 1–4 rather than producing an undefined Tailwind class.
 *
 * The form is a plain GET form and the pagination is plain links, exactly as the
 * routes had them. Nothing here needs JavaScript, so search, filtering and
 * paging keep working identically and stay crawlable.
 */
export function DirectoryGridBlock({ slot, data }: BlockProps) {
  const d = listing(data);
  const items = d.items ?? [];
  const label = d.entityLabel ?? 'entry';
  const labelPlural = d.entityLabelPlural ?? `${label}s`;
  const total = d.total ?? items.length;
  const page = d.page ?? 1;
  const totalPages = d.totalPages ?? 1;
  const columns = numProp(slot.props, 'columns', 3, 1, 4);

  const activeFilter = d.filterOptions?.find((o) => o.value === d.filterValue);
  const hasFilterInput = !!d.filterName && (d.filterOptions?.length ?? 0) > 0;

  return (
    <section>
      <form method="get" className="flex flex-wrap items-end gap-3 mb-6 bg-white border border-stone-200 rounded-xs p-3">
        <div className="grow min-w-[200px]">
          <label htmlFor="directory-q" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">
            Search
          </label>
          <input
            id="directory-q"
            name="q"
            defaultValue={d.query ?? ''}
            placeholder={d.searchPlaceholder ?? 'Search…'}
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xs focus:outline-none focus:border-[#D4A757]"
          />
        </div>
        {hasFilterInput && (
          <div>
            <label htmlFor="directory-filter" className="block text-[10px] font-mono uppercase text-stone-500 mb-1">
              {d.filterLabel ?? 'Filter'}
            </label>
            <select
              id="directory-filter"
              name={d.filterName}
              defaultValue={d.filterValue ?? ''}
              className="px-3 py-2 text-sm border border-stone-300 rounded-xs bg-white"
            >
              <option value="">{d.filterAllLabel ?? 'All'}</option>
              {d.filterOptions!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">
          Apply
        </button>
        {(d.query || d.filterValue) && d.resetHref && (
          <Link href={d.resetHref} className="px-3 py-2 text-xs text-stone-500 underline">
            Reset
          </Link>
        )}
      </form>

      <p className="text-xs text-stone-500 mb-3">
        {total} {total === 1 ? label : labelPlural}
        {d.query ? ` matching "${d.query}"` : ''}
        {activeFilter ? ` in ${activeFilter.label}` : ''}.
      </p>

      {items.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xs p-10 text-center text-stone-500 text-sm">
          No {labelPlural} match your search yet.
        </div>
      ) : (
        <ul className={`grid ${COLUMN_CLASS[columns] ?? COLUMN_CLASS[3]} gap-4`}>
          {items.map((item) => (
            <li key={item.slug}>
              <Link
                href={item.href}
                className="block h-full bg-white border border-stone-200 rounded-xs p-4 hover:border-[#D4A757] transition-colors"
              >
                <p className="font-serif text-lg font-bold text-stone-900">{item.title}</p>
                {item.subtitle && <p className="text-xs text-stone-500 italic">&quot;{item.subtitle}&quot;</p>}
                {item.meta && <p className="text-xs text-stone-600 mt-1">{item.meta}</p>}
                {item.tags && <p className="text-[11px] font-mono text-stone-500 mt-2">{item.tags}</p>}
                {item.badge && (
                  <span className="inline-block mt-2 text-[10px] font-mono uppercase text-stone-400">{item.badge}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between mt-8 text-sm" aria-label="Pagination">
          {d.prevHref ? (
            <Link href={d.prevHref} className="text-[#8B5E3C] underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-stone-500 text-xs">
            Page {page} of {totalPages}
          </span>
          {d.nextHref ? (
            <Link href={d.nextHref} className="text-[#8B5E3C] underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

/* ── directory-cta ────────────────────────────────────────────────── */

export function DirectoryCtaBlock({ data }: BlockProps) {
  const d = data as unknown as DirectoryCtaData;
  if (!d.ctaText) return null;
  return (
    <div className="mt-10 py-8 border-t border-stone-200 text-center">
      <Link
        href={d.ctaUrl || '/'}
        className="inline-block px-6 py-3 bg-[#0F1115] text-[#D4A757] font-semibold text-sm rounded-xs hover:bg-stone-800 transition-colors"
      >
        {d.ctaText}
      </Link>
    </div>
  );
}
