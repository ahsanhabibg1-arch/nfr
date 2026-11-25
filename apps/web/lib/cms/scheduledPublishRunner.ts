import 'server-only';
import { getDueSchedules, executeScheduledPublish } from './pageLayoutService';
import { log } from '../logger';

const INTERVAL_MS = 60_000;
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function triggerRevalidation(): Promise<void> {
  // Read per-call and never fall back to a literal: without a configured secret
  // the endpoint fails closed, so skip rather than issue a request that cannot succeed.
  const secret = process.env.INTERNAL_REVALIDATE_SECRET;
  if (!secret) {
    log.warn('skipping revalidation: INTERNAL_REVALIDATE_SECRET is not configured');
    return;
  }

  const port = process.env.PORT || '3000';
  const base = `http://localhost:${port}`;
  try {
    const res = await fetch(`${base}/api/internal/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, path: '/' }),
    });
    if (!res.ok) log.warn('revalidation request failed', { status: res.status });
  } catch (err) {
    log.warn('revalidation request error (server may still be starting)', { error: String(err) });
  }
}

export async function runDuePublications(): Promise<number> {
  let published = 0;
  try {
    const due = await getDueSchedules();
    if (due.length === 0) return 0;

    for (const layout of due) {
      try {
        const result = await executeScheduledPublish(layout);
        if (result) {
          published++;
          log.info('scheduled publish executed', { pageKey: layout.pageKey, layoutId: layout.id });
        }
      } catch (err) {
        log.error('scheduled publish failed', { pageKey: layout.pageKey, layoutId: layout.id, error: String(err) });
      }
    }

    if (published > 0) {
      await triggerRevalidation();
    }
  } catch (err) {
    log.error('scheduled publish runner error', { error: String(err) });
  }
  return published;
}

export interface SchedulerAuthorization {
  enabled: boolean;
  /** Secret-free explanation, safe to log. */
  reason: string;
}

/**
 * Who may run the publishing WRITER.
 *
 * WHY THIS GATE EXISTS. `startScheduler` installs a 60-second timer that calls
 * `executeScheduledPublish`, which WRITES to whatever database the process is
 * pointed at — it publishes page layouts, bumps versions and appends audit
 * rows. That was unconditional, so once local development was pointed at the
 * managed (production) database, a developer's `next dev` could publish to
 * production. Nothing fired, but the capability was live. Diagnostics and local
 * verification must never be able to mutate production, so the writer now has
 * to be authorized rather than merely reached.
 *
 * WHY NOT `NODE_ENV`. `NODE_ENV` is `production` for ANY production build —
 * including `next build` + `next start` run on a laptop to verify a release.
 * Keying off it would re-open the exact hole this closes. The decision
 * therefore needs two independent, deliberate signals:
 *
 *   1. `APP_ENV=production` — the deployment's own LABEL, read directly rather
 *      than through `appEnv()`. `appEnv()` falls back to `NODE_ENV` when the
 *      label is absent, which is right for validation but wrong here: an
 *      unlabelled process must not inherit production authority. An absent or
 *      unrecognised label is ambiguous, and ambiguity fails CLOSED.
 *   2. `SCHEDULED_PUBLISHING=on` — per-deployment authorization, so staging and
 *      preview services built from the same image stay read-only by default and
 *      exactly one deployment owns the writer.
 *
 * Everything else — development, test, staging, preview, an unlabelled process,
 * and local production-mode verification — is disabled, and says why.
 *
 * This gates only the AUTOMATIC timer. An editor publishing from the CMS, and
 * `runDuePublications()` called deliberately by an external scheduler, are
 * unaffected: those are authenticated, intentional actions, not a side effect of
 * starting a server.
 */
export function schedulerAuthorization(
  env: Record<string, string | undefined> = process.env,
): SchedulerAuthorization {
  const label = (env.APP_ENV || '').trim().toLowerCase();
  if (label !== 'production') {
    return {
      enabled: false,
      reason: label
        ? `APP_ENV="${label}" is not a production deployment`
        : 'APP_ENV is not set, so this process is not a declared production deployment',
    };
  }
  if ((env.SCHEDULED_PUBLISHING || '').trim().toLowerCase() !== 'on') {
    return {
      enabled: false,
      reason: 'SCHEDULED_PUBLISHING is not "on" — the publishing writer must be authorized explicitly, per deployment',
    };
  }
  return { enabled: true, reason: 'APP_ENV=production and SCHEDULED_PUBLISHING=on' };
}

export function startScheduler(): void {
  if (started) return;

  // Ambiguity fails closed: see `schedulerAuthorization`.
  const authorization = schedulerAuthorization();
  if (!authorization.enabled) {
    log.info('page layout scheduler disabled', { reason: authorization.reason });
    return;
  }

  started = true;
  log.info('page layout scheduler started', { intervalMs: INTERVAL_MS });
  runDuePublications().catch(() => {});
  timer = setInterval(() => { runDuePublications().catch(() => {}); }, INTERVAL_MS);
  if (timer && typeof timer === 'object' && 'unref' in timer) timer.unref();
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
  started = false;
}
