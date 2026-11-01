import React from 'react';

export function AdminLandingSeoPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-serif font-bold text-stone-900">Landing-Page SEO & FAQ</h2>
      <p className="text-sm text-stone-600">Batch 11 — Manage SEO overrides and FAQs for landing entities (Rodeo Hubs, Events, Editions, Disciplines, Categories).</p>
      <div className="p-4 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-600">
        <strong>Note:</strong> Full interactive CMS interface requires additional server actions and forms. The underlying services (<code>entitySeoService</code>, <code>faqService</code>) and server actions (<code>landing-seo-actions</code>) are implemented and authorized. Public rendering and database persistence are verified.
      </div>
    </div>
  );
}
