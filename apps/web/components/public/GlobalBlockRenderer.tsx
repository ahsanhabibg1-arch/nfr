import React from 'react';

export interface PublicGlobalBlock {
  id: string;
  type: 'MESSAGE' | 'CTA' | 'FEATURED_STORY';
  content: string;
  mediaUrl?: string | null;
  mediaAlt?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

interface Props { blocks: PublicGlobalBlock[]; }

export const GlobalBlockRenderer: React.FC<Props> = ({ blocks }) => {
  if (blocks.length === 0) return null;
  return (
    <div className="w-full space-y-0">
      {blocks.map((b) => {
        switch (b.type) {
          case 'MESSAGE':
            return (
              <div key={b.id} className="w-full bg-stone-50 border-y border-stone-200 px-4 py-6">
                <div className="max-w-screen-xl mx-auto text-center">
                  <p className="text-sm text-stone-700">{b.content}</p>
                  {b.ctaUrl && (
                    <a href={b.ctaUrl} className="inline-block mt-2 text-xs font-semibold text-[#D4A757] hover:underline">
                      {b.ctaLabel || 'Learn more'}
                    </a>
                  )}
                </div>
              </div>
            );
          case 'CTA':
            return (
              <div key={b.id} className="w-full bg-[#0F1115] px-4 py-8">
                <div className="max-w-screen-xl mx-auto text-center">
                  <p className="text-white text-lg font-semibold mb-3">{b.content}</p>
                  {b.ctaUrl && (
                    <a href={b.ctaUrl} className="inline-block px-6 py-2.5 bg-[#D4A757] text-[#0F1115] rounded font-semibold text-sm hover:bg-[#c49a4a] transition-colors">
                      {b.ctaLabel || 'Get Started'}
                    </a>
                  )}
                </div>
              </div>
            );
          case 'FEATURED_STORY':
            return (
              <div key={b.id} className="w-full bg-stone-50 border-y border-stone-200 px-4 py-8">
                <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row gap-6 items-center">
                  {b.mediaUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={b.mediaUrl} alt={b.mediaAlt ?? ''} className="w-full md:w-1/3 rounded-lg object-cover max-h-48" />
                  )}
                  <div className="flex-1 text-center md:text-left">
                    <p className="text-stone-800 font-medium">{b.content}</p>
                    {b.ctaUrl && (
                      <a href={b.ctaUrl} className="inline-block mt-3 text-sm font-semibold text-[#D4A757] hover:underline">
                        {b.ctaLabel || 'Read more →'}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
