/**
 * NFRGuide — external SEO/availability sentinel runner (Stage 05, MON-01).
 *
 * The I/O half of `lib/monitoring/seoSentinel.ts`. Every decision lives in that
 * module, under unit test; this file only fetches and prints. Keep it that way:
 * logic added here is logic that nothing tests.
 *
 * Usage (read-only, GET only, no database, no secrets):
 *   npx tsx scripts/seo-sentinel.mts
 *   SENTINEL_BASE_URL=https://nfrguide.com npx tsx scripts/seo-sentinel.mts
 *   SENTINEL_STATE=.sentinel-state.json npx tsx scripts/seo-sentinel.mts   # enables dedupe
 *
 * Exit codes: 0 clean · 1 findings not yet sustained · 2 alerting · 3 runner error.
 *
 * NOT a keep-alive. Nine bounded GETs, intended at most every 15-30 minutes. It
 * does not try to defeat Render's free-tier spin-down: a cold start shows up as
 * a slow check, and one slow check never alerts on its own.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { connect as tlsConnect } from 'node:tls';
import {
  DEFAULT_POLICY,
  EMPTY_STATE,
  evaluate,
  exitCode,
  reconcile,
  type ProbeResult,
  type SentinelState,
} from '../lib/monitoring/seoSentinel';

const BASE = (process.env.SENTINEL_BASE_URL || DEFAULT_POLICY.canonicalOrigin).replace(/\/$/, '');
const RENDER_HOST = process.env.SENTINEL_RENDER_URL || `https://${DEFAULT_POLICY.noindexHosts[0]}/`;
const STATE_PATH = process.env.SENTINEL_STATE;
const TIMEOUT_MS = Number(process.env.SENTINEL_TIMEOUT_MS || 30_000);

/** Probes whose BODY is part of the contract; everything else is headers only. */
const WANT_BODY = new Set(['robots', 'sitemap']);

interface Target {
  id: string;
  url: string;
}

const TARGETS: Target[] = [
  { id: 'home', url: `${BASE}/` },
  { id: 'robots', url: `${BASE}/robots.txt` },
  { id: 'sitemap', url: `${BASE}/sitemap.xml` },
  { id: 'health', url: `${BASE}/api/health/` },
  { id: 'www', url: BASE.replace('://', '://www.') + '/' },
  { id: 'article', url: `${BASE}/concerts/nfr-concerts-2026/` },
  { id: 'category', url: `${BASE}/categories/nfr-competition/` },
  { id: 'render', url: RENDER_HOST },
];

/** Days until the serving certificate expires. Best effort — never throws. */
async function tlsDaysRemaining(url: string): Promise<number | undefined> {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return undefined;
    host = u.hostname;
  } catch {
    return undefined;
  }
  return new Promise((resolve) => {
    const done = (v: number | undefined) => {
      socket.destroy();
      resolve(v);
    };
    const socket = tlsConnect({ host, port: 443, servername: host, timeout: TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return done(undefined);
      const ms = new Date(cert.valid_to).getTime() - Date.now();
      done(Math.floor(ms / 86_400_000));
    });
    socket.on('error', () => done(undefined));
    socket.on('timeout', () => done(undefined));
  });
}

async function probe(t: Target): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(t.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'NFRGuide-Sentinel/1 (+monitoring; read-only)' },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    // `fetch` does not expose the hop count; derive it from the final URL.
    const redirects = res.url && res.url !== t.url ? 1 : 0;
    return {
      id: t.id,
      url: t.url,
      status: res.status,
      redirects,
      finalUrl: res.url || t.url,
      headers,
      body: WANT_BODY.has(t.id) ? await res.text() : undefined,
      durationMs: Date.now() - started,
      tlsDaysRemaining: await tlsDaysRemaining(res.url || t.url),
    };
  } catch (e) {
    return {
      id: t.id,
      url: t.url,
      status: 0,
      redirects: 0,
      finalUrl: t.url,
      durationMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

function loadState(): SentinelState {
  if (!STATE_PATH) return EMPTY_STATE;
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as SentinelState;
  } catch {
    return EMPTY_STATE;
  }
}

async function main(): Promise<number> {
  // Sequential on purpose: eight bounded GETs, one at a time, is gentler than a
  // burst and keeps a cold start from timing out the whole batch.
  const probes: ProbeResult[] = [];
  for (const t of TARGETS) probes.push(await probe(t));

  const findings = evaluate(probes, DEFAULT_POLICY);
  const transition = reconcile(findings, loadState());

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        base: BASE,
        probes: probes.map((p) => ({
          id: p.id,
          status: p.status,
          ms: p.durationMs,
          finalUrl: p.finalUrl,
          tlsDays: p.tlsDaysRemaining,
          error: p.error,
        })),
        findings,
        firing: transition.firing,
        recovered: transition.recovered,
      },
      null,
      2,
    ),
  );

  if (STATE_PATH) {
    try {
      writeFileSync(STATE_PATH, JSON.stringify(transition.next, null, 2));
    } catch (e) {
      console.error(`sentinel: could not write state to ${STATE_PATH}:`, e instanceof Error ? e.message : e);
    }
  }

  for (const f of transition.firing) console.error(`ALERT [${f.severity}] ${f.id}: ${f.summary} (${f.url})`);
  for (const k of transition.recovered) console.error(`RECOVERED ${k}`);

  return exitCode(transition, findings);
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error('sentinel: runner failed:', e instanceof Error ? e.message : e);
    process.exit(3);
  },
);
