'use client';

import React from 'react';
import Link from 'next/link';
import { sendAnalyticsEvent } from './beacon';

/**
 * A search-result link that fires a search_click event before navigating. The beacon
 * is keepalive, so it survives the navigation; the click itself is never blocked.
 */
export function TrackedResultLink({
  href,
  query,
  entityType,
  entityId,
  position,
  className,
  children,
}: {
  href: string;
  query: string;
  entityType: string;
  entityId: string;
  position: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => sendAnalyticsEvent({ type: 'search_click', query, entityType, entityId, position })}
    >
      {children}
    </Link>
  );
}

export default TrackedResultLink;
