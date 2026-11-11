'use client';

import React, { useState, useEffect } from 'react';

export interface TOCItem {
  id: string;
  text: string;
  level?: 2 | 3;
}

interface TableOfContentsProps {
  items: TOCItem[];
  className?: string;
  isSticky?: boolean;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  items,
  className = '',
  isSticky = false,
}) => {
  const [activeId, setActiveId] = useState<string>(items[0]?.id || '');
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -60% 0px' }
    );

    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      setMobileExpanded(false);
    }
  };

  return (
    <nav
      aria-label="Table of Contents"
      className={`bg-white border border-stone-200 rounded-sm p-4 ${
        isSticky ? 'lg:sticky lg:top-24' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        {/* Full-project audit — accessibility fix (heading hierarchy).
            This was an `h3` while the article's own body section headings are
            `h2`, and the table of contents renders directly after the article
            `h1`. That skipped a level (h1 -> h3) on every article page. The
            contents panel is a sibling of the body sections it lists, so `h2`
            is the correct level. Visual size comes from the classes. */}
        <h2 className="text-xs uppercase tracking-widest font-sans font-bold text-stone-900 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8B5E3C]" aria-hidden="true" />
          Contents of This Guide
        </h2>
        <button
          onClick={() => setMobileExpanded(!mobileExpanded)}
          className="lg:hidden text-xs text-[#8B5E3C] font-semibold font-sans py-1 px-2 hover:bg-stone-100 rounded"
          aria-expanded={mobileExpanded}
        >
          {mobileExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <ol
        className={`mt-3 space-y-2 list-none p-0 text-xs font-sans border-t border-stone-100 pt-3 ${
          mobileExpanded ? 'block' : 'hidden lg:block'
        }`}
      >
        {items.map((item, idx) => {
          const isActive = activeId === item.id;
          return (
            <li
              key={item.id}
              className={`${item.level === 3 ? 'pl-3 text-[11px]' : ''}`}
            >
              <button
                onClick={() => scrollToHeading(item.id)}
                className={`text-left w-full transition-colors flex items-start gap-2 py-1 leading-snug ${
                  isActive
                    ? 'text-[#8B5E3C] font-bold'
                    : 'text-stone-600 hover:text-stone-950'
                }`}
              >
                <span className="text-[10px] font-mono text-ink-muted shrink-0 mt-0.5">
                  0{idx + 1}
                </span>
                <span>{item.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
