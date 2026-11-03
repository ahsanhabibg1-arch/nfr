import React from 'react';
import Link from 'next/link';
import { BreadcrumbItem } from '../../types';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  /** Surface the trail sits on; keeps every crumb at ≥ 4.5:1 contrast (Batch B). */
  tone?: 'light' | 'dark';
}

const TONE = {
  light: { base: 'text-ink-muted', link: 'hover:text-stone-900', current: 'text-stone-900' },
  dark: { base: 'text-ink-inverse-muted', link: 'hover:text-white', current: 'text-white' },
} as const;

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '', tone = 'light' }) => {
  const t = TONE[tone];
  return (
    <nav aria-label="Breadcrumb" className={`text-xs font-sans ${t.base} ${className}`}>
      <ol className="flex items-center flex-wrap gap-1.5 list-none p-0 m-0">
        <li>
          <Link
            href="/"
            className={`${t.link} transition-colors uppercase tracking-wider font-semibold`}
          >
            NFRGuide
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              <li aria-hidden="true" className="select-none">
                /
              </li>
              <li className={isLast ? `${t.current} font-medium truncate max-w-xs sm:max-w-md` : ''}>
                {item.path && !isLast ? (
                  <Link
                    href={item.path}
                    className={`${t.link} transition-colors uppercase tracking-wider font-semibold`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? 'page' : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};
