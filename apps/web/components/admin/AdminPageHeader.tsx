import React from 'react';
import { AdminBreadcrumbs, AdminBreadcrumbItem } from './AdminBreadcrumbs';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
  breadcrumbs?: AdminBreadcrumbItem[];
  className?: string;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  breadcrumbs,
  className = '',
}) => {
  return (
    <div className={`pb-6 mb-6 border-b border-stone-200 ${className}`}>
      {breadcrumbs && (
        <div className="mb-3">
          <AdminBreadcrumbs items={breadcrumbs} />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 tracking-tight">
            {title}
          </h1>
          {badge && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8B5E3C] bg-[#F7F3EA] border border-[#8B5E3C]/30 px-1.5 py-0.5 rounded-xs">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-ink-muted font-sans leading-relaxed max-w-2xl">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {actions}
        </div>
      )}
      </div>
    </div>
  );
};
