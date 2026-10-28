import React from 'react';
import { SourceReference } from '../../types';

interface SourceListProps {
  sources?: SourceReference[];
  className?: string;
}

export const SourceList: React.FC<SourceListProps> = ({ sources, className = '' }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <section 
      aria-labelledby="sources-heading"
      className={`p-6 bg-white border border-stone-200 rounded-sm ${className}`}
    >
      <h3 
        id="sources-heading"
        className="text-xs uppercase tracking-widest font-sans font-bold text-stone-900 mb-3 flex items-center gap-2"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#D4A757]" aria-hidden="true" />
        Sources &amp; Judicial References
      </h3>
      <p className="text-xs text-stone-500 font-sans mb-4">
        All rules, scoring statistics, and historical results in this article are cross-referenced with primary records.
      </p>

      <ul className="space-y-3 list-none p-0 m-0 text-xs font-sans">
        {sources.map((src, index) => (
          <li key={src.id || index} className="p-3 bg-[#F7F3EA]/70 border border-stone-200 rounded-sm">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
              <span className="font-semibold text-stone-900">
                {src.url ? (
                  <a 
                    href={src.url} 
                    target="_blank" 
                    rel="noreferrer noopener" 
                    className="hover:text-[#8B5E3C] underline decoration-stone-300 underline-offset-2"
                  >
                    {src.title} &rarr;
                  </a>
                ) : (
                  src.title
                )}
              </span>
              <span className="text-[11px] font-mono text-stone-500 shrink-0">
                {src.publisher} {src.date ? `(${src.date})` : ''}
              </span>
            </div>
            {src.note && (
              <p className="mt-1 text-[11px] text-stone-600 leading-normal">
                {src.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
