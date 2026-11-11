import React from 'react';
import Link from 'next/link';

interface ContentEmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  actionLink?: string;
  className?: string;
}

export const ContentEmptyState: React.FC<ContentEmptyStateProps> = ({
  title = 'No Editorial Dispatches Available',
  description = 'No published articles currently match this category or filter in the Phase 0 demonstration catalogue.',
  actionText = 'Return to Homepage',
  actionLink = '/',
  className = '',
}) => {
  return (
    <div className={`p-12 text-center bg-white border border-dashed border-stone-300 rounded-sm ${className}`}>
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F7F3EA] text-[#8B5E3C] flex items-center justify-center">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15" />
        </svg>
      </div>
      {/* Full-project audit — accessibility fix (heading hierarchy).
          This was an `h3`, and both call sites render it as a page-level region
          directly under the page `h1`: the category archive when a filter
          matches nothing (`CategoryArchiveView`) and the section landing when a
          section has no published articles (`LandingBlocks.LandingEmptyState`).
          An `h3` there skips a level (h1 -> h3). Visual size is set by the
          classes, so nothing changes on screen. */}
      <h2 className="text-lg font-serif font-bold text-stone-900 mb-1">
        {title}
      </h2>
      <p className="text-xs sm:text-sm text-stone-500 font-sans max-w-md mx-auto mb-5 leading-relaxed">
        {description}
      </p>
      {actionLink && (
        <Link
          href={actionLink}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider font-sans rounded-sm transition-colors"
        >
          {actionText}
        </Link>
      )}
    </div>
  );
};
