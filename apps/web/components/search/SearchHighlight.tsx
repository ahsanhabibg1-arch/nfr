import React from 'react';
import { highlightSegments } from '@/lib/search/query';

/**
 * Renders text with matched search tokens wrapped in <mark>, built from DATA segments
 * (never HTML). There is no dangerouslySetInnerHTML, so the user's query can never
 * inject markup (§5). Safe to render on the server.
 */
export function SearchHighlight({ text, tokens, maxLen }: { text: string; tokens: string[]; maxLen?: number }) {
  const segments = highlightSegments(text, tokens, maxLen);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} className="bg-[#D4A757]/30 text-inherit rounded-xs px-0.5">
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </>
  );
}

export default SearchHighlight;
