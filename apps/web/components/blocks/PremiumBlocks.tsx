import React from 'react';
import type { BlockProps } from './blockProps';
import { slotStr } from './blockProps';

export function RichTextBlock({ slot }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const align = p('alignment', 'left');
  return (
    <section className="w-full max-w-screen-xl mx-auto px-4 py-12">
      <div style={{ textAlign: align as 'left' | 'center' | 'right' }}>
        {p('title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-4">{p('title')}</h2>}
        {p('body') && <div className="text-stone-700 leading-relaxed whitespace-pre-line">{p('body')}</div>}
      </div>
    </section>
  );
}

export function ImageTextBlock({ slot }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const imgPos = p('imagePosition', 'left');
  return (
    <section className="w-full max-w-screen-xl mx-auto px-4 py-12">
      <div className={`flex flex-col md:flex-row gap-8 items-center ${imgPos === 'right' ? 'md:flex-row-reverse' : ''}`}>
        {p('imageUrl') && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={p('imageUrl')} alt={p('imageAlt', '')} className="w-full md:w-1/2 rounded-lg object-cover max-h-80" />
        )}
        <div className="flex-1">
          {p('title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-3">{p('title')}</h2>}
          {p('body') && <p className="text-stone-700 leading-relaxed">{p('body')}</p>}
          {p('ctaText') && p('ctaUrl') && (
            <a href={p('ctaUrl')} className="inline-block mt-4 px-5 py-2 bg-[#0F1115] text-[#D4A757] rounded font-semibold text-sm">{p('ctaText')}</a>
          )}
        </div>
      </div>
    </section>
  );
}

export function StatsBanner({ slot }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const stats = [1, 2, 3, 4].map((n) => ({ label: p(`stat${n}Label`), value: p(`stat${n}Value`) })).filter((s) => s.label && s.value);
  if (stats.length === 0) return null;
  return (
    <section className="w-full bg-[#0F1115] py-10">
      <div className="max-w-screen-xl mx-auto px-4">
        {p('title') && <h2 className="text-lg font-bold text-[#D4A757] text-center mb-6">{p('title')}</h2>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-bold text-white">{s.value}</div>
              <div className="text-sm text-stone-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaBanner({ slot }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const bg = p('bgColor', 'dark');
  const bgClass = bg === 'gold' ? 'bg-[#D4A757]' : bg === 'light' ? 'bg-stone-100' : 'bg-[#0F1115]';
  const textClass = bg === 'light' ? 'text-[#0F1115]' : 'text-white';
  return (
    <section className={`w-full ${bgClass} py-12`}>
      <div className="max-w-screen-xl mx-auto px-4 text-center">
        {p('kicker') && <div className={`text-xs uppercase tracking-wider mb-2 ${bg === 'light' ? 'text-stone-500' : 'text-[#D4A757]'}`}>{p('kicker')}</div>}
        {p('title') && <h2 className={`text-2xl font-bold mb-3 ${textClass}`}>{p('title')}</h2>}
        {p('description') && <p className={`mb-6 max-w-2xl mx-auto ${bg === 'light' ? 'text-stone-600' : 'text-stone-300'}`}>{p('description')}</p>}
        {p('ctaText') && p('ctaUrl') && (
          <a href={p('ctaUrl')} className={`inline-block px-6 py-2.5 rounded font-semibold text-sm ${bg === 'gold' ? 'bg-[#0F1115] text-[#D4A757]' : 'bg-[#D4A757] text-[#0F1115]'}`}>{p('ctaText')}</a>
        )}
      </div>
    </section>
  );
}

export function FaqBlock({ slot }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  const faqs = [1, 2, 3, 4, 5].map((n) => ({ q: p(`q${n}`), a: p(`a${n}`) })).filter((f) => f.q && f.a);
  if (faqs.length === 0) return null;
  return (
    <section className="w-full max-w-screen-xl mx-auto px-4 py-12">
      {p('title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-6 text-center">{p('title')}</h2>}
      <div className="max-w-3xl mx-auto divide-y divide-stone-200">
        {faqs.map((f) => (
          <details key={f.q} className="py-4 group">
            <summary className="font-semibold text-stone-900 cursor-pointer list-none flex items-center justify-between">
              {f.q}
              <span className="text-stone-400 group-open:rotate-180 transition-transform">&#x25BC;</span>
            </summary>
            <p className="mt-3 text-stone-600 leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/**
 * RETIRED AND UNREACHABLE — owner decision D-11 (Stage 05).
 *
 * `newsletter-signup` was removed from `blockRegistry`, so `PageRenderer` skips
 * any legacy slot and this component is never mounted. It is retained, not
 * deleted, so the block can be revived cheaply once a subscription backend and
 * consent workflow are approved.
 *
 * DO NOT re-register this in `components/blocks/registry.tsx` until both exist.
 * As written it presents a `readOnly` input and a button with no handler: it
 * captures nothing, but it promises a subscription the site cannot deliver.
 */
export function NewsletterSignup({ slot }: BlockProps) {
  const p = (k: string, f = '') => slotStr(slot, k, f);
  return (
    <section className="w-full bg-stone-50 py-12">
      <div className="max-w-screen-xl mx-auto px-4 text-center">
        {p('title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-3">{p('title')}</h2>}
        {p('description') && <p className="text-stone-600 mb-6 max-w-xl mx-auto">{p('description')}</p>}
        <div className="flex justify-center gap-2 max-w-md mx-auto">
          <input type="email" placeholder={p('placeholderText', 'Enter your email')} className="flex-1 px-4 py-2.5 border border-stone-300 rounded text-sm" readOnly />
          <button className="px-5 py-2.5 bg-[#0F1115] text-[#D4A757] rounded font-semibold text-sm">{p('ctaText', 'Subscribe')}</button>
        </div>
      </div>
    </section>
  );
}
