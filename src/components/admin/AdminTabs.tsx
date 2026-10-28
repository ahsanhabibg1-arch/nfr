import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface AdminTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export const AdminTabs: React.FC<AdminTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-1 border-b border-stone-200 overflow-x-auto scrollbar-none pb-px ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2 text-xs font-sans font-semibold tracking-wide transition-all whitespace-nowrap border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
              isActive
                ? 'border-[#D4A757] text-stone-900 font-bold bg-white/60'
                : 'border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-xs ${
                isActive ? 'bg-[#D4A757]/20 text-[#8B5E3C]' : 'bg-stone-100 text-stone-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
