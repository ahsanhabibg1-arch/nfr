import React from 'react';
import { Author } from '../../types';

interface AuthorBioProps {
  author: Author;
  className?: string;
}

export const AuthorBio: React.FC<AuthorBioProps> = ({ author, className = '' }) => {
  return (
    <aside 
      id="author-bio" 
      aria-labelledby="author-bio-heading"
      className={`p-6 sm:p-7 bg-[#FFFFFF] border border-stone-200 rounded-sm shadow-xs ${className}`}
    >
      <div className="flex flex-col sm:flex-row gap-5 items-start">
        <div className="w-14 h-14 rounded-full bg-[#0F1115] text-[#D4A757] font-serif font-bold text-xl flex items-center justify-center shrink-0 border border-stone-200">
          {author.name.charAt(0)}
        </div>

        <div className="flex-1 space-y-2 font-sans">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <h3 id="author-bio-heading" className="text-base font-serif font-bold text-stone-900">
              {author.name}
            </h3>
            <span className="text-xs text-[#8B5E3C] font-semibold uppercase tracking-wider">
              {author.role}
            </span>
          </div>

          {author.credentials && (
            <p className="text-xs text-stone-500 font-mono">
              Credentials: {author.credentials}
            </p>
          )}

          {author.editorialBeat && (
            <p className="text-xs text-stone-600">
              <strong className="text-stone-800">Editorial Beat:</strong> {author.editorialBeat}
            </p>
          )}

          <p className="text-xs sm:text-sm text-stone-700 leading-relaxed pt-1">
            {author.bio || 'Veteran rodeo journalist contributing independent reporting and championship analysis to NFRGuide.com.'}
          </p>

          <div className="pt-2 text-[11px] text-stone-500 italic">
            NFRGuide staff adhere to the Society of Professional Journalists Code of Ethics.
          </div>
        </div>
      </div>
    </aside>
  );
};
