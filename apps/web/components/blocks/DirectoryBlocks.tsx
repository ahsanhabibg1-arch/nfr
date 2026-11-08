import React from 'react';
import Link from 'next/link';
import type { BlockProps } from './blockProps';

interface DirectoryData {
  ctaText?: string;
  ctaUrl?: string;
}

function dd(data: Record<string, unknown>): DirectoryData {
  return data as unknown as DirectoryData;
}

export function DirectoryCtaBlock({ data }: BlockProps) {
  const d = dd(data);
  if (!d.ctaText) return null;
  return (
    <div className="mt-10 py-8 border-t border-stone-200 text-center">
      <Link
        href={d.ctaUrl || '/'}
        className="inline-block px-6 py-3 bg-[#0F1115] text-[#D4A757] font-semibold text-sm rounded-xs hover:bg-stone-800 transition-colors"
      >
        {d.ctaText}
      </Link>
    </div>
  );
}
