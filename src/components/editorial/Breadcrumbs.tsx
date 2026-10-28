import React from 'react';
import { Link } from 'react-router-dom';
import { BreadcrumbItem } from '../../types';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, className = '' }) => {
  return (
    <nav aria-label="Breadcrumb" className={`text-xs font-sans text-stone-500 ${className}`}>
      <ol className="flex items-center flex-wrap gap-1.5 list-none p-0 m-0">
        <li>
          <Link 
            to="/" 
            className="hover:text-stone-900 transition-colors uppercase tracking-wider font-semibold"
          >
            NFRGuide
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              <li aria-hidden="true" className="text-stone-400 select-none">
                /
              </li>
              <li className={isLast ? 'text-stone-900 font-medium truncate max-w-xs sm:max-w-md' : ''}>
                {item.path && !isLast ? (
                  <Link 
                    to={item.path} 
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
