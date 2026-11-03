import React from 'react';
import { getArticleMonetization } from '@/lib/monetization/publicMonetization';

/**
 * Public article monetization block (Batch 08 §11/§15/§23). Server-rendered — no
 * client JS, no caching impact. Renders ONLY active, in-effect, approved commercial
 * items for the (already published) article, each clearly labeled and disclosed, with
 * first-party /go redirect links carrying the correct paid-link `rel`. Renders nothing
 * when there are no active offers or sponsorship, so ordinary editorial articles are
 * unaffected. Editorial independence is preserved: this is clearly delineated from the
 * article body.
 */
export async function ArticleMonetization({ articleId }: { articleId: string }) {
  const m = await getArticleMonetization(articleId);
  if (!m.sponsored && m.offers.length === 0) return null;

  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 my-10" aria-label="Commercial information">
      {m.sponsored && (
        <div className="mb-4 p-3 rounded-sm border border-amber-300 bg-amber-50/70 text-amber-900 text-xs font-sans" role="note">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#8B5E3C] mr-2">{m.sponsored.disclosureLabel}</span>
          This article is sponsored content in partnership with <strong>{m.sponsored.sponsorName}</strong>. Editorial standards and labeling are applied per our disclosure policy.
        </div>
      )}

      {m.offers.length > 0 && (
        <div className="border border-stone-300 rounded-sm bg-[#F7F3EA]/60 overflow-hidden">
          <div className="px-4 py-2 border-b border-stone-200 bg-white/60 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-[#8B5E3C]">Related Offers</span>
            <span className="text-[10px] uppercase tracking-wider font-mono text-ink-muted">Affiliate · Advertisement</span>
          </div>
          <ul className="divide-y divide-stone-200">
            {m.offers.map((o) => (
              <li key={o.placementId} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-serif font-semibold text-stone-900 truncate">{o.label}</p>
                  {o.context && <p className="text-xs text-ink-muted font-sans truncate">{o.context}</p>}
                </div>
                <a
                  href={o.href}
                  rel={o.rel}
                  target="_blank"
                  className="shrink-0 text-[11px] font-mono font-semibold text-[#D4A757] bg-[#0F1115] px-3 py-1.5 rounded-xs hover:bg-[#1a1d23]"
                >
                  View offer →
                </a>
              </li>
            ))}
          </ul>
          {m.showAffiliateDisclosure && (
            <div className="px-4 py-2.5 border-t border-stone-200 bg-white/40 text-[11px] text-stone-600 font-sans leading-relaxed">
              {m.disclosureBody ||
                'NFRGuide may earn an affiliate commission on qualifying purchases made through these links, at no additional cost to you. Editorial recommendations remain independent. Commercial partners are not official sources.'}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default ArticleMonetization;
