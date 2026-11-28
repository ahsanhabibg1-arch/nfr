import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POLICY,
  EMPTY_STATE,
  blocksEntireSite,
  evaluate,
  exitCode,
  foreignSitemapHosts,
  headerSaysNoindex,
  looksLikeSitemap,
  reconcile,
  type ProbeResult,
} from '@/lib/monitoring/seoSentinel';

/**
 * Stage 05 / MON-01. These assert the sentinel fires on the failures that
 * actually happened or nearly happened, and stays quiet otherwise — the two
 * properties a monitor is useless without.
 */

const ok = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  id: 'home',
  url: 'https://nfrguide.com/',
  status: 200,
  redirects: 0,
  finalUrl: 'https://nfrguide.com/',
  headers: {},
  ...over,
});

describe('robots.txt site-wide block detection', () => {
  it('catches the incident signature', () => {
    expect(blocksEntireSite('User-Agent: *\nDisallow: /')).toBe(true);
    expect(blocksEntireSite('User-agent: *\r\n  disallow:  /  \r\n')).toBe(true);
  });

  it('does not fire on the real, permissive policy', () => {
    const real = 'User-Agent: *\nAllow: /\nDisallow: /admin/\n\nHost: https://nfrguide.com\nSitemap: https://nfrguide.com/sitemap.xml\n';
    expect(blocksEntireSite(real)).toBe(false);
  });

  it('is not fooled by a path that merely starts with a slash', () => {
    expect(blocksEntireSite('Disallow: /admin/')).toBe(false);
    expect(blocksEntireSite('Disallow: /a')).toBe(false);
  });

  it('ignores a commented-out block', () => {
    expect(blocksEntireSite('# Disallow: /\nAllow: /')).toBe(false);
  });
});

describe('sitemap shape', () => {
  const good = '<?xml version="1.0"?><urlset><url><loc>https://nfrguide.com/</loc></url></urlset>';

  it('accepts a well-formed urlset and an index', () => {
    expect(looksLikeSitemap(good)).toBe(true);
    expect(looksLikeSitemap('<sitemapindex><url><loc>https://nfrguide.com/a</loc></url></sitemapindex>')).toBe(true);
  });

  it('rejects an HTML error page served with a 200', () => {
    expect(looksLikeSitemap('<!doctype html><html><body>Something went wrong</body></html>')).toBe(false);
  });

  it('rejects a truncated response', () => {
    expect(looksLikeSitemap(good.replace('</urlset>', ''))).toBe(false);
  });

  it('flags non-canonical origins among the <loc> values', () => {
    const mixed = `<urlset><url><loc>https://nfrguide.com/a</loc></url><url><loc>https://nfr-qadd.onrender.com/b</loc></url></urlset>`;
    expect(foreignSitemapHosts(mixed, 'https://nfrguide.com')).toEqual(['https://nfr-qadd.onrender.com']);
    expect(foreignSitemapHosts(good, 'https://nfrguide.com')).toEqual([]);
  });
});

describe('header indexability', () => {
  it('reads noindex out of an X-Robots-Tag', () => {
    expect(headerSaysNoindex(ok({ headers: { 'x-robots-tag': 'noindex, nofollow' } }))).toBe(true);
    expect(headerSaysNoindex(ok({ headers: {} }))).toBe(false);
    expect(headerSaysNoindex(ok({ headers: { 'x-robots-tag': 'index, follow' } }))).toBe(false);
  });
});

describe('evaluate', () => {
  it('reports nothing for a healthy production response', () => {
    expect(evaluate([ok()])).toEqual([]);
  });

  it('treats an unreachable host as critical and stops there', () => {
    const f = evaluate([ok({ status: 0, error: 'ETIMEDOUT' })]);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('critical');
    expect(f[0].dedupeKey).toBe('home:unreachable');
  });

  it('separates 5xx from 4xx', () => {
    expect(evaluate([ok({ status: 503 })])[0].dedupeKey).toBe('home:5xx');
    expect(evaluate([ok({ status: 404 })])[0].dedupeKey).toBe('home:404');
  });

  it('fires on a production noindex header — the deindexing risk', () => {
    const f = evaluate([ok({ headers: { 'x-robots-tag': 'noindex, nofollow' } })]);
    expect(f.map((x) => x.dedupeKey)).toContain('home:prod-noindex');
    expect(f[0].severity).toBe('critical');
  });

  it('fires when the NON-production host stops being noindexed', () => {
    const probe = ok({ id: 'render', url: 'https://nfr-qadd.onrender.com/', finalUrl: 'https://nfr-qadd.onrender.com/' });
    expect(evaluate([probe]).map((x) => x.dedupeKey)).toContain('render:nonprod-indexable');
  });

  it('accepts the Render host while it keeps its noindex, and does not call it off-origin', () => {
    const probe = ok({
      id: 'render',
      url: 'https://nfr-qadd.onrender.com/',
      finalUrl: 'https://nfr-qadd.onrender.com/',
      headers: { 'x-robots-tag': 'noindex, nofollow' },
    });
    expect(evaluate([probe])).toEqual([]);
  });

  it('flags a page that lands outside the canonical origin', () => {
    const f = evaluate([ok({ finalUrl: 'https://example.com/' })]);
    expect(f.map((x) => x.dedupeKey)).toContain('home:off-origin');
  });

  it('accepts the canonical origin with no trailing path', () => {
    expect(evaluate([ok({ finalUrl: 'https://nfrguide.com' })])).toEqual([]);
  });

  it('tolerates the normal two-hop http://www chain but flags a longer one', () => {
    expect(evaluate([ok({ redirects: 2 })])).toEqual([]);
    const f = evaluate([ok({ redirects: 4 })]);
    expect(f.map((x) => x.dedupeKey)).toContain('home:redirect-chain');
    expect(f[0].severity).toBe('warning');
  });

  it('escalates TLS expiry as it gets closer', () => {
    expect(evaluate([ok({ tlsDaysRemaining: 30 })])).toEqual([]);
    expect(evaluate([ok({ tlsDaysRemaining: 10 })])[0].severity).toBe('warning');
    expect(evaluate([ok({ tlsDaysRemaining: 2 })])[0].severity).toBe('critical');
  });

  it('applies the robots.txt body contract only to the robots probe', () => {
    const body = 'User-Agent: *\nDisallow: /';
    const robots = evaluate([ok({ id: 'robots', url: 'https://nfrguide.com/robots.txt', body })]);
    expect(robots.map((x) => x.dedupeKey)).toContain('robots:disallow-all');
    // Same body on a different probe id is not a robots policy.
    expect(evaluate([ok({ body })]).map((x) => x.dedupeKey)).not.toContain('home:disallow-all');
  });

  it('warns when robots.txt stops advertising a sitemap', () => {
    const f = evaluate([ok({ id: 'robots', body: 'User-Agent: *\nAllow: /\n' })]);
    expect(f.map((x) => x.dedupeKey)).toContain('robots:no-sitemap-directive');
  });

  it('flags a sitemap that is really an error page', () => {
    const f = evaluate([ok({ id: 'sitemap', body: '<html>oops</html>' })]);
    expect(f.map((x) => x.dedupeKey)).toContain('sitemap:not-xml');
  });

  it('orders critical findings before warnings', () => {
    const f = evaluate([ok({ status: 503 }), ok({ id: 'other', redirects: 9 })]);
    expect(f[0].severity).toBe('critical');
  });
});

describe('reconcile — transient vs sustained', () => {
  const finding = { id: 'home', severity: 'critical' as const, dedupeKey: 'home:5xx', summary: '503', url: 'u' };

  it('stays quiet on a single failure', () => {
    const t = reconcile([finding], EMPTY_STATE);
    expect(t.firing).toEqual([]);
    expect(t.next.streaks['home:5xx']).toBe(1);
  });

  it('alerts once the failure is sustained', () => {
    const first = reconcile([finding], EMPTY_STATE);
    const second = reconcile([finding], first.next);
    expect(second.firing.map((f) => f.dedupeKey)).toEqual(['home:5xx']);
  });

  it('does not alert twice for the same ongoing problem', () => {
    const a = reconcile([finding], EMPTY_STATE);
    const b = reconcile([finding], a.next);
    const c = reconcile([finding], b.next);
    expect(c.firing).toEqual([]);
    expect(c.next.alerted).toContain('home:5xx');
  });

  it('sends a recovery notice when a alerted problem disappears', () => {
    const a = reconcile([finding], EMPTY_STATE);
    const b = reconcile([finding], a.next);
    const clean = reconcile([], b.next);
    expect(clean.recovered).toEqual(['home:5xx']);
    expect(clean.next.alerted).toEqual([]);
  });

  it('never delays a site-wide Disallow or a production noindex', () => {
    const block = { ...finding, dedupeKey: 'robots:disallow-all' };
    const noindex = { ...finding, dedupeKey: 'home:prod-noindex' };
    expect(reconcile([block], EMPTY_STATE).firing).toHaveLength(1);
    expect(reconcile([noindex], EMPTY_STATE).firing).toHaveLength(1);
  });

  it('resets the streak after a clean run, so flapping does not accumulate', () => {
    const a = reconcile([finding], EMPTY_STATE);
    const clean = reconcile([], a.next);
    const again = reconcile([finding], clean.next);
    expect(again.firing).toEqual([]);
    expect(again.next.streaks['home:5xx']).toBe(1);
  });
});

describe('exitCode', () => {
  it('distinguishes alerting, unsustained and clean', () => {
    const f = { id: 'home', severity: 'critical' as const, dedupeKey: 'home:5xx', summary: '', url: '' };
    expect(exitCode(reconcile([], EMPTY_STATE), [])).toBe(0);
    expect(exitCode(reconcile([f], EMPTY_STATE), [f])).toBe(1);
    const a = reconcile([f], EMPTY_STATE);
    expect(exitCode(reconcile([f], a.next), [f])).toBe(2);
  });
});

describe('default policy matches the verified production facts', () => {
  it('pins the canonical origin and the noindexed Render host', () => {
    expect(DEFAULT_POLICY.canonicalOrigin).toBe('https://nfrguide.com');
    expect(DEFAULT_POLICY.noindexHosts).toContain('nfr-qadd.onrender.com');
  });
});
