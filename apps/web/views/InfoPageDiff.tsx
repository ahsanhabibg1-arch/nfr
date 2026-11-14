import React from 'react';

/**
 * Live vs draft comparison (PM-06 B).
 *
 * A FIELD-LEVEL comparison rather than a character diff of the HTML. What an
 * approver needs to answer is "what changes if I publish this" — and a word
 * diff of serialised markup answers a different question badly, drowning a
 * changed heading in attribute noise. So each field reports whether it changed
 * and shows both values; the body, which is the one field too large to read
 * side by side in full, reports its own before/after as plain text.
 *
 * Desktop lays the two columns side by side. On a narrow screen they stack —
 * `grid-cols-1 md:grid-cols-2` — so the comparison stays readable rather than
 * becoming a horizontally scrolling table.
 */

export interface DiffField {
  label: string;
  live: string | null;
  draft: string | null;
  /** Rendered as a code block rather than a sentence. */
  long?: boolean;
}

/** Visible text from stored HTML, for comparing bodies without markup noise. */
export function plainText(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMPTY = '— not set —';

function Value({ value, long }: { value: string | null; long?: boolean }) {
  if (!value) return <span className="text-stone-400 italic">{EMPTY}</span>;
  return long
    ? <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-stone-800 m-0">{value}</pre>
    : <span className="text-stone-800 break-words">{value}</span>;
}

export function InfoPageDiff({ fields, hasLive }: { fields: DiffField[]; hasLive: boolean }) {
  const changed = fields.filter((f) => (f.live ?? '') !== (f.draft ?? ''));

  return (
    <section aria-labelledby="diff-heading" className="space-y-4">
      <div>
        <h2 id="diff-heading" className="font-serif text-lg font-bold text-stone-900">
          What changes if you publish
        </h2>
        <p role="status" className="text-xs text-stone-600 mt-0.5">
          {!hasLive
            ? 'This page has never been published, so everything here would be new.'
            : changed.length === 0
              ? 'Nothing differs — the draft matches the live page.'
              : `${changed.length} field${changed.length === 1 ? '' : 's'} would change.`}
        </p>
      </div>

      <ul className="space-y-3 list-none p-0 m-0">
        {fields.map((f) => {
          const isChanged = (f.live ?? '') !== (f.draft ?? '');
          return (
            <li
              key={f.label}
              className={`border rounded-sm overflow-hidden ${isChanged ? 'border-amber-300' : 'border-stone-200'}`}
            >
              <div className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider flex items-center justify-between ${isChanged ? 'bg-amber-50 text-amber-900' : 'bg-stone-50 text-stone-500'}`}>
                <span>{f.label}</span>
                <span>{isChanged ? 'changed' : 'unchanged'}</span>
              </div>
              {/* Stacks on a phone; side by side from md up. */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 text-xs">
                <div className="p-3">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mb-1">Live now</p>
                  <Value value={f.live} long={f.long} />
                </div>
                <div className={`p-3 ${isChanged ? 'bg-amber-50/40' : ''}`}>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mb-1">Draft</p>
                  <Value value={f.draft} long={f.long} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default InfoPageDiff;
