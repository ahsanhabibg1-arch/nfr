import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../config/routes';

type PolicyKey = 'about' | 'editorial' | 'corrections' | 'affiliate' | 'privacy' | 'terms' | 'contact' | null;

const POLICIES: Record<string, { title: string; content: string }> = {
  about: {
    title: 'About NFRGuide.com',
    content: 'NFRGuide.com is an independent editorial publication delivering authoritative reporting, objective spectator intelligence, and historical context on the National Finals Rodeo and premier global western sporting events. Founded by veteran sports journalists and western heritage enthusiasts, our newsroom is solely editorially driven.'
  },
  editorial: {
    title: 'Editorial Standards & Independence Policy',
    content: 'Our reporting remains completely independent of sanctioning bodies, event promoters, broadcast networks, and retail sponsors. We adhere to strict standards of journalistic integrity: facts are independently verified, sources are transparently credited, and opinion is clearly delineated from straight reporting.'
  },
  corrections: {
    title: 'Corrections & Clarifications Policy',
    content: 'Accuracy is the cornerstone of NFRGuide. When errors of fact occur in our reporting, we promptly publish a clear correction statement at the top of the relevant article detailing the previous text, the corrected fact, and the timestamp of amendment.'
  },
  affiliate: {
    title: 'Affiliate & Commercial Monetization Disclosure',
    content: 'To sustain our newsroom without subscription paywalls, NFRGuide may feature clearly identified advertising banners and select affiliate links for hotel accommodations, authorized ticket marketplaces, and western apparel. Editorial recommendations are never influenced by affiliate commissions.'
  },
  privacy: {
    title: 'Privacy Policy',
    content: 'NFRGuide respects reader privacy. We do not sell personal data to third parties. Analytical cookies are utilized strictly to evaluate content readership and improve site performance.'
  },
  terms: {
    title: 'Terms of Service',
    content: 'All original text, editorial analysis, visual curations, and database compilations on NFRGuide.com are copyrighted. Reproduction without written authorization is prohibited. Content is provided for informational and editorial purposes.'
  },
  contact: {
    title: 'Contact the Editorial Desk',
    content: 'To reach our editorial team, submit dispatches, report typographical errors, or inquire regarding syndication, please contact: editorial@nfrguide.com. Physical correspondence: NFRGuide Editorial Bureau, Las Vegas & Denver.'
  }
};

export const SiteFooter: React.FC = () => {
  const [activePolicy, setActivePolicy] = useState<PolicyKey>(null);

  return (
    <footer className="w-full bg-[#0F1115] text-stone-400 font-sans border-t border-white/10 pt-16 pb-12">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-white/10">
          {/* Col 1 & 2: Brand Lockup & Independent Mission */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-baseline gap-2">
              <Link to="/" className="font-serif text-3xl font-extrabold text-white tracking-tight uppercase hover:text-[#D4A757] transition-colors">
                NFR<span className="text-[#D4A757]">Guide</span>
              </Link>
            </div>
            
            <p className="text-sm text-stone-300 leading-relaxed max-w-sm">
              The premier independent editorial publication covering the National Finals Rodeo, championship roughstock competition, Western culture, and premier global rodeo events.
            </p>

            {/* Independent Disclaimer Callout Box */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-sm text-xs text-stone-400 space-y-1.5 max-w-md">
              <strong className="text-white block font-sans uppercase tracking-wider text-[11px]">
                Independent Publication Notice:
              </strong>
              <p>
                NFRGuide.com is an independent editorial publication. It is not affiliated with, authorized, endorsed by, or in any way officially connected with the Professional Rodeo Cowboys Association (PRCA), the Women’s Professional Rodeo Association (WPRA), the National Finals Rodeo (NFR), or Las Vegas Events.
              </p>
            </div>
          </div>

          {/* Col 3: Primary Navigation */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-bold text-[#D4A757] mb-4">
              Editorial Sections
            </h4>
            <ul className="space-y-2.5 text-xs text-stone-300">
              <li>
                <Link to={ROUTES.COMPETITION} className="hover:text-white transition-colors">
                  NFR Competition &amp; Disciplines
                </Link>
              </li>
              <li>
                <Link to={ROUTES.ENTERTAINMENT} className="hover:text-white transition-colors">
                  NFR Entertainment &amp; Concerts
                </Link>
              </li>
              <li>
                <Link to={ROUTES.EVENTS_SHOPPING} className="hover:text-white transition-colors">
                  Cowboy Christmas &amp; Shopping
                </Link>
              </li>
              <li>
                <Link to={ROUTES.PLAN_WATCH} className="hover:text-white transition-colors">
                  NFR Plan &amp; Watch Guides
                </Link>
              </li>
              <li>
                <Link to={ROUTES.MORE_RODEO} className="hover:text-white transition-colors">
                  More Rodeo (Hubs &amp; Major Events)
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Spectator Guides & Learning */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-bold text-[#D4A757] mb-4">
              Spectator Academy
            </h4>
            <ul className="space-y-2.5 text-xs text-stone-300">
              <li>
                <Link 
                  to={ROUTES.ARTICLE('inside-the-chutes-nfr-roughstock-intensity')} 
                  className="hover:text-white transition-colors"
                >
                  The 8-Second Rule Explainer
                </Link>
              </li>
              <li>
                <Link 
                  to={ROUTES.DISCIPLINE('saddle-bronc-riding')} 
                  className="hover:text-white transition-colors"
                >
                  50/50 Scoring Mechanics
                </Link>
              </li>
              <li>
                <Link 
                  to={ROUTES.ARTICLE('the-anatomy-of-the-10-round-average')} 
                  className="hover:text-white transition-colors"
                >
                  The 10-Round Average Formula
                </Link>
              </li>
              <li>
                <Link 
                  to={ROUTES.ARTICLE('how-to-watch-nfr-streaming-cable-cord-cutters')} 
                  className="hover:text-white transition-colors"
                >
                  TV &amp; Streaming Directory
                </Link>
              </li>
              <li>
                <Link 
                  to={ROUTES.ARTICLE('navigating-thomas-and-mack-center-guide')} 
                  className="hover:text-white transition-colors"
                >
                  Thomas &amp; Mack Venue Tips
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 5: Institutional & Policy */}
          <div>
            <h4 className="text-xs uppercase tracking-widest font-bold text-[#D4A757] mb-4">
              Publication Policies
            </h4>
            <ul className="space-y-2.5 text-xs text-stone-300">
              <li>
                <button onClick={() => setActivePolicy('about')} className="hover:text-white transition-colors text-left">
                  About NFRGuide
                </button>
              </li>
              <li>
                <button onClick={() => setActivePolicy('editorial')} className="hover:text-white transition-colors text-left">
                  Editorial Standards
                </button>
              </li>
              <li>
                <button onClick={() => setActivePolicy('corrections')} className="hover:text-white transition-colors text-left">
                  Corrections Policy
                </button>
              </li>
              <li>
                <button onClick={() => setActivePolicy('affiliate')} className="hover:text-white transition-colors text-left">
                  Affiliate Disclosure
                </button>
              </li>
              <li>
                <button onClick={() => setActivePolicy('privacy')} className="hover:text-white transition-colors text-left">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button onClick={() => setActivePolicy('terms')} className="hover:text-white transition-colors text-left">
                  Terms of Service
                </button>
              </li>
              <li>
                <button onClick={() => setActivePolicy('contact')} className="hover:text-white transition-colors text-left">
                  Contact Newsroom
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Compliance */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-stone-500 gap-4">
          <p>
            &copy; 2026 NFRGuide.com. All rights reserved. Phase 0 Editorial &amp; Routing Foundation.
          </p>
          <div className="flex items-center gap-6">
            <span className="font-mono text-[11px] text-stone-400">Domain: nfrguide.com</span>
            <Link to={ROUTES.ADMIN} className="font-mono text-[11px] text-[#D4A757] hover:text-white transition-colors flex items-center gap-1 font-semibold">
              Editorial CMS →
            </Link>
          </div>
        </div>
      </div>

      {/* Policy Modal */}
      {activePolicy && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="relative w-full max-w-lg bg-[#F7F3EA] text-[#0F1115] p-6 rounded-sm shadow-2xl border border-stone-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-300">
              <h3 className="font-serif text-lg font-bold text-stone-900">
                {POLICIES[activePolicy].title}
              </h3>
              <button
                onClick={() => setActivePolicy(null)}
                className="p-1 text-stone-500 hover:text-stone-900 text-lg"
              >
                &times;
              </button>
            </div>
            <p className="mt-4 text-xs sm:text-sm text-stone-700 font-sans leading-relaxed">
              {POLICIES[activePolicy].content}
            </p>
            <div className="mt-6 pt-3 border-t border-stone-300 flex justify-end">
              <button
                onClick={() => setActivePolicy(null)}
                className="px-4 py-1.5 bg-[#0F1115] text-white text-xs font-semibold rounded-sm uppercase tracking-wider"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
