import React from 'react';

interface AdminStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  description?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export const AdminStatCard: React.FC<AdminStatCardProps> = ({
  title,
  value,
  subtitle,
  description,
  change,
  changeType,
  trend,
  icon,
  className = '',
}) => {
  const resolvedTrend = trend === 'up' ? 'positive' : trend === 'down' ? 'negative' : (changeType || 'neutral');
  const changeColor = {
    positive: 'text-emerald-700 bg-emerald-50',
    negative: 'text-rose-700 bg-rose-50',
    neutral: 'text-stone-600 bg-stone-100',
  }[resolvedTrend];

  const subText = subtitle || description;

  return (
    <div className={`p-5 bg-white border border-stone-200 rounded-sm shadow-2xs flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between text-stone-500 mb-2">
        <span className="text-xs uppercase font-sans tracking-wider font-semibold text-stone-600">
          {title}
        </span>
        {icon && <span className="text-stone-400">{icon}</span>}
      </div>

      <div className="flex items-baseline gap-2.5 my-1">
        <span className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tabular-nums">
          {value}
        </span>
        {change && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-xs ${changeColor}`}>
            {change}
          </span>
        )}
      </div>

      {subText && (
        <p className="text-[11px] text-stone-400 font-sans mt-1 line-clamp-1">
          {subText}
        </p>
      )}
    </div>
  );
};
