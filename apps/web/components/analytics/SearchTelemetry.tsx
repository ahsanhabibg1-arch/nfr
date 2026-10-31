'use client';

import { useEffect, useRef } from 'react';
import { sendAnalyticsEvent } from './beacon';

/**
 * Fires one internal-search event per distinct (query, filter, resultCount) once the
 * server-rendered results page mounts. Deduped client-side against the last sent key
 * so React re-renders don't double-count; the server endpoint dedupes again.
 */
export function SearchTelemetry({
  query,
  resultCount,
  zeroResult,
  contentType,
}: {
  query: string;
  resultCount: number;
  zeroResult: boolean;
  contentType: string;
}) {
  const key = `${query}|${contentType}|${resultCount}|${zeroResult}`;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!query || last.current === key) return;
    last.current = key;
    sendAnalyticsEvent({ type: 'search', query, resultCount, zeroResult, contentType });
  }, [key, query, resultCount, zeroResult, contentType]);
  return null;
}

export default SearchTelemetry;
