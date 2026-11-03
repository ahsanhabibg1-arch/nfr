import React from 'react';
import Link from 'next/link';
import { ROUTES } from '../../config/routes';

export interface AdminBreadcrumbItem {
  label: string;
  path?: string;
}

interface AdminBreadcrumbsProps {
  items: AdminBreadcrumbItem[];
  className?: string;
}

export const AdminBreadcrumbs: React.FC<AdminBreadcrumbsProps> = ({ items, className = '' }) => {
  return (
    <nav aria-label="Admin Breadcrumb" className={`text-xs font-sans text-ink-muted ${className}`}>
      <ol className="flex items-center flex-wrap gap-1.5 list-none p-0 m-0">
        <li>
          <Link
            href={ROUTES.ADMIN}
            className="hover:text-stone-900 transition-colors uppercase tracking-wider font-semibold text-ink-muted"
          >
            CMS Dashboard
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              <li aria-hidden="true" className="text-stone-300 select-none">
                /
              </li>
              <li className={isLast ? 'text-stone-900 font-medium truncate max-w-xs' : ''}>
                {item.path && !isLast ? (
                  <Link
                    href={item.path}
                    className="hover:text-stone-900 transition-colors uppercase tracking-wider font-semibold"
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
