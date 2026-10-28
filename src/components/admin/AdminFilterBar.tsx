import React from 'react';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDropdown {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface AdminFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  dropdowns?: FilterDropdown[];
  selectedCount?: number;
  bulkActions?: React.ReactNode;
  onReset?: () => void;
  className?: string;
}

export const AdminFilterBar: React.FC<AdminFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  dropdowns = [],
  selectedCount = 0,
  bulkActions,
  onReset,
  className = '',
}) => {
  return (
    <div className={`p-3.5 bg-white border border-stone-200 rounded-sm mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${className}`}>
      {/* Search Input & Dropdown Filters */}
      <div className="flex flex-1 flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <svg className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 text-xs font-sans text-stone-900 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757]"
          />
        </div>

        {/* Dropdowns */}
        {dropdowns.map((dd) => (
          <div key={dd.id} className="flex items-center gap-1.5">
            <label htmlFor={dd.id} className="text-[11px] font-sans font-semibold text-stone-500 uppercase tracking-wider hidden sm:inline">
              {dd.label}:
            </label>
            <select
              id={dd.id}
              value={dd.value}
              onChange={(e) => dd.onChange(e.target.value)}
              className="py-1.5 px-2.5 text-xs font-sans text-stone-800 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757]"
            >
              {dd.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {onReset && (searchQuery || dropdowns.some((d) => d.value !== 'all')) && (
          <button
            onClick={onReset}
            className="text-[11px] font-sans text-stone-500 hover:text-stone-900 underline px-1.5 py-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk Actions / Selection Counter */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-stone-200">
          <span className="text-xs font-mono font-medium text-stone-600 bg-[#F7F3EA] px-2 py-1 rounded-xs border border-stone-200">
            {selectedCount} Selected
          </span>
          {bulkActions}
        </div>
      )}
    </div>
  );
};
