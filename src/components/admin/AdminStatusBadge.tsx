import React from 'react';

interface AdminStatusBadgeProps {
  status: string;
  variant?: 'draft' | 'published' | 'in_review' | 'scheduled' | 'archived' | 'critical' | 'warning' | 'notice' | 'passed' | 'default';
  className?: string;
}

export const AdminStatusBadge: React.FC<AdminStatusBadgeProps> = ({
  status,
  variant,
  className = '',
}) => {
  const normalized = (variant || status).toLowerCase().replace(/[\s-]+/g, '_');

  const variantStyles: Record<string, string> = {
    published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    passed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    draft: 'bg-stone-100 text-stone-700 border-stone-300',
    in_review: 'bg-amber-50 text-amber-800 border-amber-200',
    scheduled: 'bg-blue-50 text-blue-800 border-blue-200',
    archived: 'bg-stone-100 text-stone-500 border-stone-200',
    critical: 'bg-rose-50 text-rose-800 border-rose-200 font-semibold',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    notice: 'bg-blue-50 text-blue-700 border-blue-200',
    verified: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    default: 'bg-stone-100 text-stone-700 border-stone-200',
  };

  const style = variantStyles[normalized] || variantStyles.default;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-sans font-medium border rounded-xs whitespace-nowrap tracking-tight ${style} ${className}`}
    >
      {status}
    </span>
  );
};
