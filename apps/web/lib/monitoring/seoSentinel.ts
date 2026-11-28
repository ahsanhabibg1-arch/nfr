/**
 * NFRGuide — external SEO/availability sentinel (Stage 05, MON-01).
 *
 * WHY THIS EXISTS. The November robots.txt incident was noticed from Search
 * Console days later. Nothing watches the handful of responses that decide
 * whether the site is indexable at all, and the application cannot watch them
 * itself: an app that is down, or that is serving `Disallow: /`, is in no
 * position to report either. So the checks live here as PURE FUNCTIONS over
 * already-collected probe results, and the thing that does the fetching
 * (`scripts/seo-sentinel.mts`) runs OUTSIDE the app — from CI, or any host the
 * owner points at production.
 *
 * WHAT THIS FILE IS NOT. It performs no I/O, opens no socket and reads no
 * environment. That is deliberate: every rule below is unit-testable against a
 * literal, which is the only way to be confident a monitor will fire on the day
 * it matters. It also keeps the sentinel from needing the database, a secret or
 * a dependency.
 *
 * It deliberately does NOT keep the instance awake. Render's free tier spins
 * down after 15 minutes idle; polling to defeat that would be both a terms
 * problem and a way to burn the 750 free instance-hours. Checks are low
 * frequency and bounded, and a cold start is reported as latency, not failure.
 */

export type Severity = 'critical' | 'warning' | 'info';

/** One probe's outcome, as collected by the runner. No app types leak in here. */
export interface ProbeResult {
  /** Stable id for this check, used as the dedupe key's first half. */
  id: string;
  url: string;
  /** Final status after redirects; 0 when the request never completed. */
  status: number;
  /** Number of redirect hops followed to reach `status`. */
  redirects: number;
  /** Final URL after redirects. */
  finalUrl: string;
  /** Response body, only for the endpoints whose body is part of the contract. */
  body?: string;
  /** Lower-cased header names → value. */
  headers?: Record<string, string>;
  /** Whole-request duration in ms. */
  durationMs?: number;
  /** Set when the request itself failed (DNS, TLS, timeout). */
  error?: string;
  /** Days until the serving certificate expires, when the runner could read it. */
  tlsDaysRemaining?: number;
}

export interface Finding {
  id: string;
  severity: Severity;
  /** Stable across repeats of the same problem — this is what dedupe keys on. */
  dedupeKey: string;
  summary: string;
  url: string;
}

export interface SentinelPolicy {
  /** The one origin production is allowed to canonicalise to. */
  canonicalOrigin: string;
  /** Hosts that are SUPPOSED to be noindex (Render's default hostname). */
  noindexHosts: readonly string[];
  /** Warn below this many days of certificate validity. */
  tlsWarnDays: number;
  /** More hops than this is a redirect chain worth reporting. */
  maxRedirects: number;
}

export const DEFAULT_POLICY: SentinelPolicy = {
  canonicalOrigin: 'https://nfrguide.com',
  noindexHosts: ['nfr-qadd.onrender.com'],
  tlsWarnDays: 14,
  maxRedirects: 2,
};

const ROBOTS_ID = 'robots';
const SITEMAP_ID = 'sitemap';

/** `Disallow: /` with nothing after the slash — the incident's signature. */
export function blocksEntireSite(robotsBody: string): boolean {
  return robotsBody
    .split(/\r?\n/)
    .some((line) => /^\s*disallow:\s*\/\s*$/i.test(line.replace(/#.*$/, '')));
}

/**
 * Cheap XML well-formedness check for a urlset. Not a parser: it answers only
 * "did we get a sitemap, or did we get an error page with a 200 on it", which is
 * the failure that actually happens behind a CDN.
 */
export function looksLikeSitemap(body: string): boolean {
  const head = body.slice(0, 2000);
  if (!/<urlset[\s>]/i.test(head) && !/<sitemapindex[\s>]/i.test(head)) return false;
  // Balanced enough to rule out a truncated response.
  return /<\/(urlset|sitemapindex)>\s*$/i.test(body.trim()) && /<loc>/i.test(body);
}

/** Every `<loc>` host that is not the canonical origin. */
export function foreignSitemapHosts(body: string, canonicalOrigin: string): string[] {
  const hosts = new Set<string>();
  for (const m of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const u = new URL(m[1]);
      if (u.origin !== canonicalOrigin) hosts.add(u.origin);
    } catch {
      hosts.add('(unparseable)');
    }
  }
  return [...hosts].sort();
}

function headerOf(p: ProbeResult, name: string): string | undefined {
  return p.headers?.[name.toLowerCase()];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Does this response forbid indexing, by header? */
export function headerSaysNoindex(p: ProbeResult): boolean {
  return /\bnoindex\b/i.test(headerOf(p, 'x-robots-tag') ?? '');
}

/**
 * Turn probe results into findings. Pure: same input, same output, no clock and
 * no network. Ordered most severe first so a truncated alert still leads with
 * the worst thing.
 */
export function evaluate(
  probes: readonly ProbeResult[],
  policy: SentinelPolicy = DEFAULT_POLICY,
): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);

  for (const p of probes) {
    const isNoindexHost = policy.noindexHosts.includes(hostOf(p.url));

    // 1. Reachability. Everything else is meaningless if this fails.
    if (p.error || p.status === 0) {
      add({
        id: p.id,
        severity: 'critical',
        dedupeKey: `${p.id}:unreachable`,
        summary: `request failed: ${p.error || 'no response'}`,
        url: p.url,
      });
      continue;
    }

    if (p.status >= 500) {
      add({
        id: p.id,
        severity: 'critical',
        dedupeKey: `${p.id}:5xx`,
        summary: `server error ${p.status}`,
        url: p.url,
      });
      continue;
    }

    if (p.status >= 400) {
      add({
        id: p.id,
        severity: 'critical',
        dedupeKey: `${p.id}:${p.status}`,
        summary: `unexpected ${p.status}`,
        url: p.url,
      });
      continue;
    }

    // 2. Redirect chains. One hop (http->https, or www->apex) is normal; a long
    //    chain wastes crawl budget and usually means two rules fighting.
    if (p.redirects > policy.maxRedirects) {
      add({
        id: p.id,
        severity: 'warning',
        dedupeKey: `${p.id}:redirect-chain`,
        summary: `${p.redirects} redirects to reach ${p.finalUrl} (max ${policy.maxRedirects})`,
        url: p.url,
      });
    }

    // 3. Canonical host. A production page that ends up on another origin means
    //    the site is serving someone else's canonical.
    if (!isNoindexHost && p.finalUrl && !p.finalUrl.startsWith(`${policy.canonicalOrigin}/`)) {
      const sameOrigin = p.finalUrl === policy.canonicalOrigin;
      if (!sameOrigin) {
        add({
          id: p.id,
          severity: 'critical',
          dedupeKey: `${p.id}:off-origin`,
          summary: `resolved to ${p.finalUrl}, outside ${policy.canonicalOrigin}`,
          url: p.url,
        });
      }
    }

    // 4. Indexability, in both directions. Production must not be noindexed, and
    //    the Render hostname must not stop being noindexed.
    if (isNoindexHost) {
      if (!headerSaysNoindex(p)) {
        add({
          id: p.id,
          severity: 'critical',
          dedupeKey: `${p.id}:nonprod-indexable`,
          summary: 'non-production host lost its X-Robots-Tag: noindex',
          url: p.url,
        });
      }
    } else if (headerSaysNoindex(p)) {
      add({
        id: p.id,
        severity: 'critical',
        dedupeKey: `${p.id}:prod-noindex`,
        summary: `production sent X-Robots-Tag: ${headerOf(p, 'x-robots-tag')}`,
        url: p.url,
      });
    }

    // 5. TLS expiry.
    if (typeof p.tlsDaysRemaining === 'number' && p.tlsDaysRemaining <= policy.tlsWarnDays) {
      add({
        id: p.id,
        severity: p.tlsDaysRemaining <= 3 ? 'critical' : 'warning',
        dedupeKey: `${p.id}:tls-expiry`,
        summary: `certificate expires in ${p.tlsDaysRemaining} day(s)`,
        url: p.url,
      });
    }

    // 6. Body contracts, for the two endpoints whose body IS the contract.
    if (p.id === ROBOTS_ID && typeof p.body === 'string') {
      if (blocksEntireSite(p.body)) {
        add({
          id: p.id,
          severity: 'critical',
          dedupeKey: `${p.id}:disallow-all`,
          summary: 'robots.txt contains a site-wide "Disallow: /"',
          url: p.url,
        });
      }
      if (!/sitemap:/i.test(p.body)) {
        add({
          id: p.id,
          severity: 'warning',
          dedupeKey: `${p.id}:no-sitemap-directive`,
          summary: 'robots.txt no longer advertises a Sitemap:',
          url: p.url,
        });
      }
    }

    if (p.id === SITEMAP_ID && typeof p.body === 'string') {
      if (!looksLikeSitemap(p.body)) {
        add({
          id: p.id,
          severity: 'critical',
          dedupeKey: `${p.id}:not-xml`,
          summary: 'sitemap.xml is not a well-formed urlset',
          url: p.url,
        });
      } else {
        const foreign = foreignSitemapHosts(p.body, policy.canonicalOrigin);
        if (foreign.length > 0) {
          add({
            id: p.id,
            severity: 'critical',
            dedupeKey: `${p.id}:foreign-hosts`,
            summary: `sitemap lists non-canonical origin(s): ${foreign.join(', ')}`,
            url: p.url,
          });
        }
      }
    }
  }

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ────────────────────────── transient vs sustained ────────────────────────── */

/** What the previous run left behind. Plain JSON so any runner can persist it. */
export interface SentinelState {
  /** dedupeKey → how many consecutive runs have seen it. */
  streaks: Record<string, number>;
  /** dedupeKeys already alerted on, so repeats stay quiet. */
  alerted: string[];
}

export const EMPTY_STATE: SentinelState = { streaks: {}, alerted: [] };

export interface Transition {
  /** Fire an alert for these: sustained, and not alerted yet. */
  firing: Finding[];
  /** These were alerted and are now gone — send a recovery notice. */
  recovered: string[];
  next: SentinelState;
}

/**
 * Decide what to actually tell a human.
 *
 * A single failed check is usually a cold start, a CDN hiccup or a deploy in
 * flight, so a finding must persist for `threshold` consecutive runs before it
 * alerts — EXCEPT the two that are never transient and are the whole reason this
 * exists: a site-wide `Disallow: /` and a production `noindex`. Those alert on
 * the first sighting, because the cost of waiting is deindexing.
 *
 * Pure, so "it alerts on the second failure, not the first" is a test and not a
 * hope.
 */
export function reconcile(
  findings: readonly Finding[],
  previous: SentinelState = EMPTY_STATE,
  threshold = 2,
): Transition {
  const immediate = new Set(['disallow-all', 'prod-noindex']);
  const isImmediate = (key: string) => immediate.has(key.split(':').slice(1).join(':'));

  const streaks: Record<string, number> = {};
  for (const f of findings) {
    streaks[f.dedupeKey] = (previous.streaks[f.dedupeKey] ?? 0) + 1;
  }

  const alreadyAlerted = new Set(previous.alerted);
  const firing: Finding[] = [];
  const stillAlerted = new Set<string>();

  for (const f of findings) {
    const sustained = streaks[f.dedupeKey] >= threshold || isImmediate(f.dedupeKey);
    if (!sustained) continue;
    stillAlerted.add(f.dedupeKey);
    if (!alreadyAlerted.has(f.dedupeKey)) firing.push(f);
  }

  const present = new Set(findings.map((f) => f.dedupeKey));
  const recovered = [...alreadyAlerted].filter((k) => !present.has(k)).sort();

  return {
    firing,
    recovered,
    next: { streaks, alerted: [...stillAlerted].sort() },
  };
}

/** Exit code for a runner: 2 = alerting, 1 = findings not yet sustained, 0 = clean. */
export function exitCode(t: Transition, findings: readonly Finding[]): number {
  if (t.firing.length > 0) return 2;
  return findings.length > 0 ? 1 : 0;
}
