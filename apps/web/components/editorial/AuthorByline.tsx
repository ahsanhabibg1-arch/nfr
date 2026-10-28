import React from 'react';
import { Author } from '../../types';

interface AuthorBylineProps {
  author: Author;
  publishedAt: string;
  updatedAt?: string;
  reviewedAt?: string;
  readTime: string;
  className?: string;
}

export const AuthorByline: React.FC<AuthorBylineProps> = ({
  author,
  publishedAt,
  updatedAt,
  reviewedAt,
  readTime,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-y border-stone-200 text-xs font-sans text-stone-600 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1E293B] text-[#D4A757] font-serif font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
          {author.name.charAt(0)}
        </div>
        <div>
          <a 
            href="#author-bio" 
            className="font-semibold text-stone-900 hover:text-[#8B5E3C] transition-colors inline-block"
          >
            By {author.name}
          </a>
          <p className="text-[11px] text-stone-500">{author.role}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 font-sans sm:text-right">
        <span>Published {publishedAt}</span>
        {updatedAt && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span>Updated {updatedAt}</span>
          </>
        )}
        {reviewedAt && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span className="text-[#8B5E3C] font-medium">Fact-Checked {reviewedAt}</span>
          </>
        )}
        <span aria-hidden="true">&middot;</span>
        <span className="text-stone-700 font-medium">{readTime}</span>
      </div>
    </div>
  );
};
