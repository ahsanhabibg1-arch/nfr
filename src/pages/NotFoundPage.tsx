import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../config/routes';
import { useSEO } from '../utils/seo';

export const NotFoundPage: React.FC = () => {
  useSEO({
    title: 'Page Not Found (404)',
    description: 'The requested page could not be found on NFRGuide.com.',
  });

  return (
    <div className="w-full bg-[#F7F3EA] text-[#0F1115] py-20 px-4 sm:px-6 lg:px-8 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-xl text-center space-y-6">
        <span className="font-mono text-sm tracking-widest uppercase text-[#8B5E3C] font-semibold">
          Error 404 &middot; Out of Bounds
        </span>

        <h1 className="text-4xl sm:text-5xl font-serif font-bold text-[#0F1115] tracking-tight">
          Arena Route Not Found
        </h1>

        <p className="text-sm sm:text-base text-stone-600 font-sans leading-relaxed">
          The editorial dispatch, discipline guide, or category you requested is not currently part of the NFRGuide.com publication.
        </p>

        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={ROUTES.HOME}
            className="px-5 py-2.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider font-sans rounded-sm transition-colors"
          >
            Return to Homepage
          </Link>
          <Link
            to={ROUTES.COMPETITION}
            className="px-5 py-2.5 bg-white text-stone-800 hover:text-stone-950 border border-stone-300 text-xs font-semibold uppercase tracking-wider font-sans rounded-sm transition-colors"
          >
            NFR Competition
          </Link>
          <Link
            to={ROUTES.PLAN_WATCH}
            className="px-5 py-2.5 bg-white text-stone-800 hover:text-stone-950 border border-stone-300 text-xs font-semibold uppercase tracking-wider font-sans rounded-sm transition-colors"
          >
            Plan &amp; Watch
          </Link>
        </div>

        <div className="pt-8 border-t border-stone-300 text-xs text-stone-500 font-sans">
          Independent Rodeo Editorial &middot; Domain: nfrguide.com
        </div>
      </div>
    </div>
  );
};
