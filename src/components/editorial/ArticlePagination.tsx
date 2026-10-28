import React from 'react';

interface ArticlePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const ArticlePagination: React.FC<ArticlePaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  return (
    <nav 
      aria-label="Archive Pagination" 
      className={`flex items-center justify-center gap-2 pt-8 border-t border-stone-200 ${className}`}
    >
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1.5 text-xs font-sans font-semibold uppercase tracking-wider text-stone-700 bg-white border border-stone-300 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50"
      >
        &larr; Prev
      </button>

      <div className="flex items-center gap-1 text-xs font-sans text-stone-700">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 rounded-sm font-semibold transition-colors ${
              currentPage === page
                ? 'bg-[#0F1115] text-[#D4A757]'
                : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'
            }`}
          >
            {page}
          </button>
        ))}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 text-xs font-sans font-semibold uppercase tracking-wider text-stone-700 bg-white border border-stone-300 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50"
      >
        Next &rarr;
      </button>
    </nav>
  );
};
