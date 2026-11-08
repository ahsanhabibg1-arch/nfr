'use client';

import React from 'react';
import Link from 'next/link';

interface SectionHeadingProps {
  kicker?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  /** When set, the action renders as a link instead of a button. */
  actionHref?: string;
  dark?: boolean;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  kicker,
  title,
  description,
  actionLabel,
  onActionClick,
  actionHref,
  dark = false,
}) => {
  const actionClass = `group inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase font-sans py-2 px-1 transition-colors whitespace-nowrap self-start md:self-end ${
    dark ? 'text-[#D4A757] hover:text-white' : 'text-[#8B5E3C] hover:text-[#0F1115]'
  }`;
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-current/10 gap-4">
      <div className="max-w-2xl">
        {kicker && (
          <div className={`text-xs font-semibold uppercase tracking-widest font-sans mb-1.5 ${
            dark ? 'text-[#D4A757]' : 'text-[#8B5E3C]'
          }`}>
            {kicker}
          </div>
        )}
        <h2 className={`text-2xl sm:text-3xl md:text-4xl font-serif font-medium tracking-tight text-balance ${
          dark ? 'text-white' : 'text-[#0F1115]'
        }`}>
          {title}
        </h2>
        {description && (
          <p className={`mt-2 text-sm sm:text-base font-sans leading-relaxed ${
            dark ? 'text-stone-300' : 'text-stone-600'
          }`}>
            {description}
          </p>
        )}
      </div>

      {actionLabel && actionHref && (
        <Link href={actionHref} className={actionClass}>
          <span>{actionLabel}</span>
          <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
        </Link>
      )}
      {actionLabel && !actionHref && (
        <button
          onClick={onActionClick}
          className={actionClass}
        >
          <span>{actionLabel}</span>
          <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
        </button>
      )}
    </div>
  );
};
