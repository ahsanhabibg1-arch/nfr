'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SearchControlsProps {
  initialQuery: string;
  type: string;
  category: string;
  discipline: string;
  sort: string;
  categories: { slug: string; name: string }[];
  disciplines: { slug: string; name: string }[];
}

/**
 * Client search form. Every change rewrites the URL query string and lets the server
 * component re-render results (SSR, shareable, deterministic). Resets to page 1 on any
 * change. No client-side search logic lives here — the engine is server-side.
 */
export function SearchControls(props: SearchControlsProps) {
  const router = useRouter();
  const [q, setQ] = useState(props.initialQuery);

  function push(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams();
    const merged = {
      q: q.trim(),
      type: props.type,
      category: props.category,
      discipline: props.discipline,
      sort: props.sort,
      ...next,
    };
    if (merged.q) params.set('q', merged.q);
    if (merged.type && merged.type !== 'all') params.set('type', merged.type);
    if (merged.category) params.set('category', merged.category);
    if (merged.discipline) params.set('discipline', merged.discipline);
    if (merged.sort && merged.sort !== 'relevance') params.set('sort', merged.sort);
    router.push(`/search/${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        push({ q: q.trim() });
      }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-sm px-3 py-2.5">
        <svg className="w-5 h-5 text-stone-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={160}
          placeholder="Search published articles, disciplines and sections…"
          aria-label="Search NFRGuide"
          className="w-full bg-transparent text-sm sm:text-base text-stone-900 placeholder-stone-400 focus:outline-none"
        />
        <button type="submit" className="text-xs uppercase font-mono tracking-wider bg-[#0F1115] text-[#D4A757] px-3 py-1.5 rounded-xs font-semibold">
          Search
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
        <label className="flex items-center gap-1.5">
          <span className="text-stone-500 uppercase tracking-wider text-[11px] font-semibold">Type</span>
          <select
            value={props.type}
            onChange={(e) => push({ type: e.target.value })}
            className="px-2 py-1 bg-white border border-stone-300 rounded-xs text-stone-700 focus:outline-none focus:border-[#D4A757]"
          >
            <option value="all">All</option>
            <option value="article">Articles</option>
            <option value="discipline">Disciplines</option>
            <option value="section">Sections</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-stone-500 uppercase tracking-wider text-[11px] font-semibold">Category</span>
          <select
            value={props.category}
            onChange={(e) => push({ category: e.target.value })}
            className="px-2 py-1 bg-white border border-stone-300 rounded-xs text-stone-700 focus:outline-none focus:border-[#D4A757]"
          >
            <option value="">Any</option>
            {props.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-stone-500 uppercase tracking-wider text-[11px] font-semibold">Discipline</span>
          <select
            value={props.discipline}
            onChange={(e) => push({ discipline: e.target.value })}
            className="px-2 py-1 bg-white border border-stone-300 rounded-xs text-stone-700 focus:outline-none focus:border-[#D4A757]"
          >
            <option value="">Any</option>
            {props.disciplines.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-stone-500 uppercase tracking-wider text-[11px] font-semibold">Sort</span>
          <select
            value={props.sort}
            onChange={(e) => push({ sort: e.target.value })}
            className="px-2 py-1 bg-white border border-stone-300 rounded-xs text-stone-700 focus:outline-none focus:border-[#D4A757]"
          >
            <option value="relevance">Relevance</option>
            <option value="newest">Newest</option>
          </select>
        </label>
      </div>
    </form>
  );
}

export default SearchControls;
