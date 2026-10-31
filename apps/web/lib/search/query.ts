/**
 * Pure search query helpers (Batch 07 §4/§5). No database, no `server-only`, so the
 * normalization + highlighting logic is unit-testable on its own.
 */
import { normalizeQuery, highlightTokens, MAX_QUERY_LEN } from '../analytics/privacy';

export { normalizeQuery, highlightTokens, MAX_QUERY_LEN };

export interface HighlightSegment {
  text: string;
  match: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split `text` into segments, marking the parts that match a search token. This
 * produces DATA (segments), never HTML — the UI renders matched segments as a
 * `<mark>` React node, so there is no `dangerouslySetInnerHTML` and no XSS surface
 * from the query (§5). Tokens are alphanumeric-only (see `highlightTokens`), so the
 * constructed RegExp cannot be injected; `escapeRegExp` is defence in depth.
 */
export function highlightSegments(text: string, tokens: string[], maxLen = 240): HighlightSegment[] {
  const safe = (tokens ?? []).filter((t) => /^[\p{L}\p{N}]+$/u.test(t));
  let clipped = text ?? '';
  if (clipped.length > maxLen) clipped = clipped.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  if (safe.length === 0 || clipped === '') return [{ text: clipped, match: false }];
  const re = new RegExp(`(${safe.map(escapeRegExp).join('|')})`, 'giu');
  const lower = new Set(safe.map((t) => t.toLowerCase()));
  return clipped
    .split(re)
    .filter((p) => p !== '')
    .map((p) => ({ text: p, match: lower.has(p.toLowerCase()) }));
}

/** Build a short plain-text excerpt around the first token hit, else the head. */
export function buildExcerpt(source: string, tokens: string[], maxLen = 220): string {
  const text = (source ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen || tokens.length === 0) return text.slice(0, maxLen);
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  const start = Math.max(0, at - 60);
  const slice = text.slice(start, start + maxLen);
  return (start > 0 ? '…' : '') + slice.replace(/\s+\S*$/, '') + '…';
}
