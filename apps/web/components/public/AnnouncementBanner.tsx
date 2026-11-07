'use client';

import React, { useState } from 'react';

export interface PublicAnnouncement {
  id: string;
  type: 'BREAKING' | 'INFO';
  text: string;
  linkUrl?: string | null;
  linkLabel?: string | null;
}

interface Props { announcements: PublicAnnouncement[]; }

export const AnnouncementBanner: React.FC<Props> = ({ announcements }) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="w-full">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`w-full px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3 ${
            a.type === 'BREAKING'
              ? 'bg-rose-600 text-white'
              : 'bg-[#D4A757] text-[#0F1115]'
          }`}
        >
          {a.type === 'BREAKING' && (
            <span className="text-[10px] font-mono uppercase bg-white/20 px-1.5 py-0.5 rounded">Breaking</span>
          )}
          <span>{a.text}</span>
          {a.linkUrl && (
            <a
              href={a.linkUrl}
              className={`text-xs underline font-semibold ${
                a.type === 'BREAKING' ? 'text-white/90' : 'text-[#0F1115]/80'
              }`}
            >
              {a.linkLabel || 'Read more'}
            </a>
          )}
          <button
            onClick={() => setDismissed((s) => new Set(s).add(a.id))}
            className="ml-2 opacity-60 hover:opacity-100 text-lg leading-none"
            aria-label="Dismiss announcement"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
