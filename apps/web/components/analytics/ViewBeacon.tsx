'use client';

import { useEffect, useRef } from 'react';
import { sendAnalyticsEvent } from './beacon';

/**
 * Fires a single first-party content-view event once per mount (client-side, after
 * load) so server-rendered/prefetch/bot requests are not counted. No-ops server-side
 * if collection is disabled (the endpoint decides). Stores no identifiers.
 */
export function ViewBeacon({ entityType, entityId, path }: { entityType: string; entityId: string; path: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !entityId) return;
    sent.current = true;
    sendAnalyticsEvent({ type: 'content_view', entityType, entityId, path });
  }, [entityType, entityId, path]);
  return null;
}

export default ViewBeacon;
