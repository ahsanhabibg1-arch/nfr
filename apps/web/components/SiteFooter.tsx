'use client';

import React from 'react';
import Link from 'next/link';
import { ROUTES } from '../config/routes';
import { LEGAL_PAGES } from '../config/legalPages';
import type { NavLink } from '../lib/cms/navTypes';
import { CANONICAL } from '../lib/cms/navCanonical';
import type { FooterConfig } from '../lib/cms/siteConfigService';

// Static fallbacks mirror the original footer menus; used when the DB-backed
// navigation is empty or unavailable.
const SECTIONS_FALLBACK: NavLink[] = [
  { label: 'NFR Competition & Disciplines', url: ROUTES.COMPETITION, isExternal: false },
  { label: 'NFR Entertainment & Concerts', url: ROUTES.ENTERTAINMENT, isExternal: false },
  { label: 'Cowboy Christmas & Shopping', url: ROUTES.EVENTS_SHOPPING, isExternal: false },
  { label: 'NFR Plan & Watch Guides', url: ROUTES.PLAN_WATCH, isExternal: false },
  { label: 'More Rodeo (Hubs & Major Events)', url: ROUTES.MORE_RODEO, isExternal: false },
];
// Same links as the canonical footer-academy menu (lib/cms/navCanonical.ts).
const ACADEMY_FALLBACK: NavLink[] = CANONICAL['footer-academy'];

// Batch 15/16: public directory links always surface in the footer, independent of the
// DB-backed navigation (so they appear even when the nav table has custom academy links).
const DIRECTORY_LINKS: NavLink[] = [
  { label: 'Competitors Directory', url: '/competitors/', isExternal: false },
  { label: 'Venues Directory', url: '/venues/', isExternal: false },
];

const FooterLinks: React.FC<{ links: NavLink[] }> = ({ links }) => (
  <ul className="space-y-2.5 text-xs text-stone-300">
    {links.map((l) => (
      <li key={l.url + l.label}>
        <Link
          href={l.url}
          target={l.isExternal ? '_blank' : undefined}
          rel={l.isExternal ? 'noopener noreferrer' : undefined}
          className="hover:text-white transition-colors"
        >
          {l.label}
        </Link>
      </li>
    ))}
  </ul>
);

// Publication policy pages (config/legalPages.ts) — real routes, not modal copy.
const POLICY_LINKS: NavLink[] = LEGAL_PAGES.map((p) => ({ label: p.label, url: p.path, isExternal: false }));

interface SiteFooterProps {
  sections?: NavLink[];
  academy?: NavLink[];
  /** Published Site Experience → Footer config. Blank fields keep the built-in defaults. */
  config?: FooterConfig;
}

const DEFAULT_DESCRIPTION = 'An independent editorial publication covering the National Finals Rodeo, rodeo competition, Western culture and rodeo events worldwide.';
const DEFAULT_COPYRIGHT = `© ${new Date().getFullYear()} NFRGuide.com. Independent rodeo publication.`;

const text = (v: string | undefined, fallback: string) => (v && v.trim() ? v : fallback);

export const SiteFooter: React.FC<SiteFooterProps> = ({ sections, academy, config = {} }) => {
  const sectionLinks = sections && sections.length > 0 ? sections : SECTIONS_FALLBACK;
  const baseAcademy = academy && academy.length > 0 ? academy : ACADEMY_FALLBACK;
  const academyLinks = [...baseAcademy, ...DIRECTORY_LINKS.filter((d) => !baseAcademy.some((a) => a.url === d.url))];

  // Columns: the CMS footer columns replace the two menu-driven columns when configured.
  // Publication Policies always stays (required legal links).
  const customColumns = (config.columns ?? []).filter((c) => c.title && c.links?.length);
  const menuColumns = customColumns.length > 0
    ? customColumns.map((c) => ({ title: c.title, links: c.links.map((l) => ({ label: l.label, url: l.url, isExternal: Boolean(l.isExternal) })) }))
    : [
        { title: 'Editorial Sections', links: sectionLinks },
        { title: 'Spectator Academy', links: academyLinks },
      ];
  const socialLinks = (config.socialLinks ?? []).filter((s) => s.platform && /^https:\/\//.test(s.url));
  const gridCols = menuColumns.length + 1 + 2; // menu columns + policies + 2-wide brand block
  const lgGrid = gridCols >= 6 ? 'lg:grid-cols-6' : gridCols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5';

  return (
    <footer className="w-full bg-[#0F1115] text-stone-400 font-sans border-t border-white/10 pt-16 pb-12">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${lgGrid} gap-10 pb-12 border-b border-white/10`}>
          {/* Col 1 & 2: Brand Lockup & Independent Mission */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-baseline gap-2">
              <Link href="/" className="font-serif text-3xl font-extrabold text-white tracking-tight uppercase hover:text-[#D4A757] transition-colors">
                NFR<span className="text-[#D4A757]">Guide</span>
              </Link>
            </div>
            
            {config.tagline?.trim() && (
              <p className="text-xs uppercase tracking-widest font-semibold text-[#D4A757]">{config.tagline}</p>
            )}
            <p className="text-sm text-stone-300 leading-relaxed max-w-sm whitespace-pre-line">
              {text(config.description, DEFAULT_DESCRIPTION)}
            </p>

            {socialLinks.length > 0 && (
              <ul className="flex flex-wrap gap-3" aria-label="Social profiles">
                {socialLinks.map((s) => (
                  <li key={s.platform + s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="inline-block px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider border border-white/15 rounded-sm text-stone-300 hover:text-white hover:border-[#D4A757] transition-colors">
                      {s.platform}
                    </a>
                  </li>
                ))}
              </ul>
            )}

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

          {/* Menu columns: CMS footer columns when configured, else the navigation menus */}
          {menuColumns.map((col) => (
            <div key={col.title}>
              <h2 className="text-xs uppercase tracking-widest font-bold text-[#D4A757] mb-4">
                {col.title}
              </h2>
              <FooterLinks links={col.links} />
            </div>
          ))}

          {/* Col 5: Institutional & Policy */}
          <div>
            <h2 className="text-xs uppercase tracking-widest font-bold text-[#D4A757] mb-4">
              Publication Policies
            </h2>
            <FooterLinks links={POLICY_LINKS} />
          </div>
        </div>

        {/* Bottom Bar: Copyright & Compliance */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-ink-inverse-muted gap-4">
          <p>
            {text(config.copyright, DEFAULT_COPYRIGHT)}
          </p>
          <div className="flex items-center gap-6">
            {config.statusText?.trim() && (
              <span className="font-mono text-[11px] text-stone-400">{config.statusText}</span>
            )}
            <span className="font-mono text-[11px] text-stone-400">Domain: nfrguide.com</span>
            <Link href={ROUTES.ADMIN} className="font-mono text-[11px] text-[#D4A757] hover:text-white transition-colors flex items-center gap-1 font-semibold">
              Editorial CMS →
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
