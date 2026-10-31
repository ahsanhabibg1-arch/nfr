/**
 * Client-side analytics beacon (Batch 07). Fire-and-forget POST to the ingest
 * endpoint. Uses `keepalive` so the request survives navigation/unload (an
 * alternative to navigator.sendBeacon that lets us set a JSON content-type and hit
 * the trailing-slash path — required under `trailingSlash: true`). Never throws into
 * the page; failures are swallowed. Sends no identifiers.
 */
export function sendAnalyticsEvent(payload: Record<string, unknown>): void {
  try {
    void fetch('/api/analytics/event/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {});
  } catch {
    /* ignore — analytics must never break the page */
  }
}
