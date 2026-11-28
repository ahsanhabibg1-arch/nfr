/**
 * Redirect path normalisation, safety validation and status-code policy.
 *
 * PURE, AND DELIBERATELY SO. Nothing here touches the database or `server-only`
 * modules, so the rules can be unit-tested directly and imported by both the
 * article and rodeo resolvers without dragging a Prisma client behind them.
 * This is the module that makes D-3 possible: one definition of "is this path
 * safe", instead of one per entity family.
 *
 * EVERY STORED PATH IS UNTRUSTED. Rows in `ArticleRedirect` are written by
 * internal services today, but the Stage 04 admin UI will let an operator type
 * one, a CSV import will paste one, and a seed can get one wrong. Validating
 * only at write time means the first row that slips past the writer becomes a
 * live open redirect. So the rules here are applied on READ as well, and the
 * resolver treats the database as hostile input.
 */

/* ── Status codes ──────────────────────────────────────────────────────── */

/**
 * The four codes the engine understands.
 *
 * 301/308 are permanent, 302/307 temporary. The pairs differ in whether the
 * request method survives the hop: 307 and 308 preserve it, 301 and 302 allow a
 * client to turn POST into GET. Automatic CMS redirects use 308.
 */
export const REDIRECT_STATUS_CODES = [301, 302, 307, 308] as const;
export type RedirectStatusCode = (typeof REDIRECT_STATUS_CODES)[number];

export function isSupportedRedirectStatus(code: number): code is RedirectStatusCode {
  return (REDIRECT_STATUS_CODES as readonly number[]).includes(code);
}

/** 301 and 308 are permanent; 302 and 307 are not. */
export function isPermanentStatus(code: number): boolean {
  return code === 301 || code === 308;
}

/* ── Reserved paths ────────────────────────────────────────────────────── */

/**
 * Path prefixes a redirect may never use as a source or a destination.
 *
 * A redirect whose SOURCE is `/admin/` would shadow the real admin route; one
 * whose DESTINATION is `/api/` would point readers at an endpoint rather than a
 * page. Both are refused rather than sanitised, because there is no legitimate
 * reading of either.
 *
 * This complements `RESERVED_SLUGS` in `lib/cms/slugRules.ts`, which guards the
 * depth-1 namespace that subcategories share with the sections. That list stops
 * an entity from CLAIMING a reserved name; this one stops a redirect row from
 * pointing at or from infrastructure.
 */
export const RESERVED_PATH_PREFIXES: readonly string[] = Object.freeze([
  '/admin',
  '/api',
  '/_next',
  '/login',
  '/register',
  '/account',
  '/forgot-password',
  '/reset-password',
]);

/** Exact paths that are infrastructure rather than content. */
export const RESERVED_EXACT_PATHS: readonly string[] = Object.freeze([
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/manifest.json',
]);

/**
 * Drop ONE trailing slash, so a path and its trailing-slashed form compare equal.
 *
 * `/` itself is left alone: it is the root, not a slashed `""`.
 */
function withoutTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * True when `path` belongs to infrastructure rather than public content.
 *
 * BOTH SIDES ARE COMPARED IN THE SAME SHAPE. This is the fix for APP-01/SEO-03.
 * `normalizeRedirectPath()` always appends a trailing slash, so every value the
 * redirect engine actually evaluates arrives here as `/robots.txt/`, while
 * `RESERVED_EXACT_PATHS` stores the un-slashed `/robots.txt`. The old check
 * compared the two directly, so the exact list never matched and
 * `validateRedirectSource('/robots.txt')` returned ok — admitting robots.txt,
 * the sitemap, the favicon and the manifest as redirect sources AND
 * destinations. The prefix rules were unaffected, because they already tested
 * the slashed form explicitly; only the exact list was reachable.
 *
 * Normalising both sides rather than adding slashed duplicates to the list
 * keeps one definition of each reserved path and cannot drift again: a new
 * entry is protected in both spellings the moment it is added.
 *
 * Compared segment-wise, not as a bare string prefix, so a genuine public route
 * such as `/administration/` or `/apiary/` is not caught by `/admin` or `/api`.
 * No decoding happens here — `normalizeRedirectPath()` has already refused
 * percent-encoded separators, backslashes and traversal, and decoding at this
 * layer would hand an attacker a second interpretation of the path.
 */
export function isReservedPath(path: string): boolean {
  const lower = path.toLowerCase();
  const bare = withoutTrailingSlash(lower);
  if (RESERVED_EXACT_PATHS.some((p) => withoutTrailingSlash(p) === bare)) return true;
  return RESERVED_PATH_PREFIXES.some((p) => bare === withoutTrailingSlash(p) || bare.startsWith(`${withoutTrailingSlash(p)}/`));
}

/* ── Normalisation ─────────────────────────────────────────────────────── */

/** Characters that must never appear in a stored path. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Percent-encoded separators and control bytes.
 *
 * `%2F` decodes to `/` and `%5C` to `\`. A value carrying either means the
 * stored path and the path a browser resolves are different strings, which is
 * the classic encoded-separator bypass: the validator sees one segment and the
 * server sees two. Refused rather than decoded, because decoding would hand the
 * attacker the second interpretation.
 */
const ENCODED_SEPARATOR = /%(?:2f|5c|00|0d|0a|09)/i;

/**
 * Normalise a stored or requested redirect path, or return `null` if it cannot
 * be trusted.
 *
 * The result is always a rooted, single-slashed, trailing-slashed path with no
 * query or fragment — the shape every route in this project serves and every
 * row in the table stores. Returning `null` rather than a cleaned-up string for
 * anything suspicious is deliberate: a redirect that "mostly" parsed is how an
 * open redirect gets shipped.
 */
export function normalizeRedirectPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '') return null;

  // Control characters and encoded separators: refuse outright.
  if (CONTROL_CHARS.test(value)) return null;
  if (ENCODED_SEPARATOR.test(value)) return null;

  // Backslashes. Browsers treat `\` as `/` in URLs, so `/\evil.com` and
  // `\\evil.com` are off-site despite looking rooted.
  if (value.includes('\\')) return null;

  // Protocol-relative (`//host`) and absolute (`https://host`, `javascript:`).
  if (value.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;

  // A redirect path is a path. Query and fragment are handled by policy at the
  // response boundary, never stored as part of the rule.
  if (value.includes('?') || value.includes('#')) return null;

  if (!value.startsWith('/')) return null;

  // Reject traversal and empty segments before collapsing, so that `/a/../b/`
  // can never normalise into something that passed validation as `/a/`.
  const segments = value.split('/').filter((s) => s !== '');
  if (segments.some((s) => s === '.' || s === '..')) return null;
  if (segments.length === 0) return '/';

  return `/${segments.join('/')}/`;
}

/**
 * True when two paths address the same resource.
 *
 * Used for self-redirect and immediate-loop detection, where a trailing-slash
 * difference must not be allowed to hide a cycle.
 */
export function samePath(a: string | null, b: string | null): boolean {
  const na = normalizeRedirectPath(a);
  const nb = normalizeRedirectPath(b);
  return na !== null && nb !== null && na === nb;
}

/* ── Source / destination shape rules ──────────────────────────────────── */

export type PathRejection =
  | 'malformed'
  | 'reserved'
  | 'self'
  | 'unsupported-shape'
  | 'not-live'
  | 'bad-status';

export interface PathCheck {
  ok: boolean;
  path?: string;
  reason?: PathRejection;
}

/** A redirect SOURCE must be a well-formed, non-reserved public path. */
/**
 * Stage 06-R FC-02C — paths reserved as a redirect SOURCE only.
 *
 * Source protection and destination eligibility are different questions, and
 * `RESERVED_EXACT_PATHS` answers both at once. `/coverage/` needs opposite
 * answers to each: the application serves that page itself, so a redirect row
 * must never be able to shadow it — but redirecting OLD urls TO the archive is
 * exactly what an editor should be able to do. Listing it here, rather than in
 * `RESERVED_EXACT_PATHS`, gives it precisely that asymmetry.
 *
 * Why shadowing is possible at all: `proxy.ts` resolves managed redirects at
 * the request boundary, BEFORE Next.js matches a route. A 308 issued there wins
 * over the real page, so the guard has to live in validation, not in routing.
 *
 * Deliberately NOT the whole static route table. Other app-served routes
 * (`/search/`, `/competitors/`, `/venues/`, the legal pages…) share this
 * exposure; widening the rule would change behaviour for existing stored
 * redirects, which is outside this closure's scope. Recorded for Stage 10.
 */
export const SOURCE_ONLY_RESERVED_PATHS: readonly string[] = Object.freeze(['/coverage']);

/** True when a path may not be used as a redirect SOURCE (a superset of `isReservedPath`). */
export function isReservedRedirectSource(path: string): boolean {
  if (isReservedPath(path)) return true;
  const bare = withoutTrailingSlash(path.toLowerCase());
  return SOURCE_ONLY_RESERVED_PATHS.some((p) => withoutTrailingSlash(p) === bare);
}

export function validateRedirectSource(raw: string | null | undefined): PathCheck {
  const path = normalizeRedirectPath(raw);
  if (!path) return { ok: false, reason: 'malformed' };
  // Source-only reservations included: this one function is the choke point for
  // create, update, CSV import AND the runtime boundary resolver.
  if (isReservedRedirectSource(path)) return { ok: false, reason: 'reserved' };
  return { ok: true, path };
}

/**
 * A redirect DESTINATION must be well-formed, non-reserved, and not the source.
 *
 * This is the shape-only half. Proving the destination actually exists and is
 * publicly reachable needs the database and lives in `resolve.ts`, because the
 * answer differs per entity family — an archived rodeo entity still serves its
 * URL, while an unpublished article does not.
 */
export function validateRedirectDestinationShape(
  raw: string | null | undefined,
  source?: string | null,
): PathCheck {
  const path = normalizeRedirectPath(raw);
  if (!path) return { ok: false, reason: 'malformed' };
  if (isReservedPath(path)) return { ok: false, reason: 'reserved' };
  if (source && samePath(path, source)) return { ok: false, reason: 'self' };
  return { ok: true, path };
}
