import React from 'react';

/**
 * Accessible FAQ accordion (Batch 11). Uses native <details>/<summary> so it is
 * keyboard-accessible and works without JavaScript. Renders only the enabled FAQs it
 * is given (the same rows used for FAQPage JSON-LD — no hidden content). Answers are
 * plain text rendered as paragraphs (no raw HTML).
 */
export function FaqAccordion({ faqs }: { faqs: { id: string; question: string; answer: string }[] }) {
  if (!faqs || faqs.length === 0) return null;
  return (
    <section className="mt-10" aria-label="Frequently asked questions">
      <h2 className="text-sm uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-3">Frequently Asked Questions</h2>
      <div className="divide-y divide-stone-200 border-y border-stone-200">
        {faqs.map((f) => (
          <details key={f.id} className="group py-3">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-serif font-semibold text-stone-900">
              <span>{f.question}</span>
              <span className="text-[#8B5E3C] text-lg leading-none transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <div className="mt-2 text-sm text-stone-700 font-sans leading-relaxed space-y-2">
              {f.answer.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export default FaqAccordion;
