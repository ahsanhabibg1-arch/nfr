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

export function startScheduler(): void {
  if (started) return;
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
