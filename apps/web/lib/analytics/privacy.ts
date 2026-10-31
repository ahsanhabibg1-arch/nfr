/**
 * Query normalization, minimization and redaction (Batch 07 §6/§8).
 *
 * Pure + dependency-free so it runs in unit tests without a database. Used by both
 * the public search engine (to bound and normalize the query) and the analytics
 * logger (to redact a query before it is ever persisted). We NEVER store a raw
 * query verbatim when redaction is enabled: emails and long digit runs (phone
 * numbers, ids, card-like sequences) are masked, control characters stripped, and
 * length bounded.
 */

export const MAX_QUERY_LEN = 160;
export const MIN_TOKEN_LEN = 2;
export const MAX_HIGHLIGHT_TOKENS = 12;

// Extremely common words that add noise to highlighting / term reports.
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'are', 'was', 'you', 'from', 'this', 'that']);

export interface NormalizedQuery {
  /** Whitespace-collapsed, trimmed, length-bounded query used for search + display. */
  text: string;
  /** Length of the ORIGINAL raw query (an abuse/quality signal, not stored verbatim). */
  originalLength: number;
}

export function normalizeQuery(raw: string | null | undefined): NormalizedQuery {
  const original = typeof raw === 'string' ? raw : '';
  const collapsed = original.replace(/\s+/g, ' ').trim();
  return { text: collapsed.slice(0, MAX_QUERY_LEN), originalLength: original.length };
}

/**
 * Redact a normalized query for durable storage. Idempotent and safe to run on an
 * already-normalized string.
 */
export function redactForStorage(normalized: string): string {
  return normalized
    .toLowerCase()
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]') // email addresses
    .replace(/\b\d[\d\s-]{4,}\d\b/g, '[number]') // 6+ char digit runs: phones, ids, cards
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '') // control characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LEN);
}

/**
 * Alphanumeric highlight/report tokens derived from a normalized query. Tokens are
 * strictly `[\p{L}\p{N}]+`, so they are safe to use when constructing a RegExp or a
 * highlight matcher (no regex-injection surface). Stopwords and 1-char tokens are
 * dropped; the set is de-duplicated and capped.
 */
export function highlightTokens(normalized: string): string[] {
  const matches = normalized.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of matches) {
    if (t.length < MIN_TOKEN_LEN || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_HIGHLIGHT_TOKENS) break;
  }
  return out;
}
