import React from 'react';
import Link from 'next/link';
import { ContentBlock, Article } from '../../types';
import { ImageWithCredit } from '../ImageWithCredit';
import { safeHref } from '../../lib/url';

interface ArticleBodyProps {
  article: Article;
  className?: string;
}

export const ArticleBody: React.FC<ArticleBodyProps> = ({ article, className = '' }) => {
  const blocks = article.structuredBody;

  // Fallback to classic content paragraphs if no structuredBody exists
  if (!blocks || blocks.length === 0) {
    return (
      <div className={`space-y-6 text-stone-800 font-sans text-base sm:text-lg leading-[1.8] ${className}`}>
        {article.content.map((p, idx) => (
          <p key={idx} className={idx === 0 ? 'drop-cap text-stone-900' : ''}>
            {p}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-7 text-stone-800 font-sans text-base sm:text-lg leading-[1.8] ${className}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const HeadingTag = block.level === 2 ? 'h2' : 'h3';
            const sizeClass =
              block.level === 2
                ? 'text-2xl sm:text-3xl font-bold mt-10 mb-4 pt-4 border-t border-stone-200'
                : 'text-xl sm:text-2xl font-semibold mt-8 mb-3';

            return (
              <HeadingTag
                key={index}
                id={block.id}
                className={`font-serif text-[#0F1115] scroll-mt-24 ${sizeClass}`}
              >
                {block.text}
              </HeadingTag>
            );
          }

          case 'paragraph': {
            return (
              <p
                key={index}
                className={block.isDropCap ? 'drop-cap text-stone-950' : 'text-stone-800'}
              >
                {block.text}
              </p>
            );
          }

          case 'quote': {
            return (
              <blockquote
                key={index}
                className="my-8 py-6 px-6 sm:px-10 border-y border-stone-300 bg-white/70 text-center"
              >
                <p className="font-serif italic text-xl sm:text-2xl text-[#0F1115] leading-relaxed">
                  &ldquo;{block.quote}&rdquo;
                </p>
                <cite className="block mt-3 text-xs uppercase tracking-widest font-sans font-semibold text-[#8B5E3C]">
                  &mdash; {block.attribution} {block.role ? `(${block.role})` : ''}
                </cite>
              </blockquote>
            );
          }

          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            return (
              <ListTag
                key={index}
                className={`my-4 space-y-2 pl-6 text-base ${
                  block.ordered ? 'list-decimal' : 'list-disc marker:text-[#D4A757]'
                }`}
              >
                {block.items.map((item, i) => (
                  <li key={i} className="pl-1">
                    {item}
                  </li>
                ))}
              </ListTag>
            );
          }

          case 'table': {
            return (
              <div key={index} className="my-8 overflow-x-auto border border-stone-300 rounded-sm bg-white">
                {block.caption && (
                  <div className="p-3 bg-[#F7F3EA] text-xs font-semibold uppercase tracking-wider text-stone-700 border-b border-stone-200 font-sans">
                    {block.caption}
                  </div>
                )}
                <table className="w-full text-left text-xs sm:text-sm font-sans border-collapse">
                  <thead>
                    <tr className="bg-stone-100 border-b border-stone-200">
                      {block.headers.map((h, i) => (
                        <th key={i} className="py-2.5 px-4 font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-stone-50/80 transition-colors">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="py-2.5 px-4 text-stone-700">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          case 'callout': {
            const variantClasses = {
              takeaway: 'bg-white border-[#D4A757] text-stone-900',
              info: 'bg-[#F7F3EA] border-[#8B5E3C] text-stone-900',
              warning: 'bg-amber-50 border-amber-500 text-amber-950',
              curator: 'bg-stone-100 border-stone-400 text-stone-900',
            }[block.variant || 'info'];

            return (
              <aside
                key={index}
                className={`my-6 p-5 border-l-4 rounded-sm shadow-2xs font-sans text-sm sm:text-base leading-relaxed ${variantClasses}`}
              >
                {block.title && (
                  <h4 className="text-xs uppercase tracking-widest font-bold mb-1.5 text-[#8B5E3C]">
                    {block.title}
                  </h4>
                )}
                <p>{block.text}</p>
              </aside>
            );
          }

          case 'image': {
            return (
              <div key={index} className="my-8">
                <ImageWithCredit
                  src={block.src}
                  alt={block.alt}
                  caption={block.caption}
                  credit={block.credit}
                />
              </div>
            );
          }

          case 'sourceLink': {
            return (
              <div key={index} className="my-4 p-3 bg-white border border-stone-200 rounded-sm text-xs font-sans flex items-center justify-between">
                <div>
                  <span className="font-semibold text-stone-900">{block.title}</span>
                  {block.publisher && <span className="text-stone-500 ml-2">&middot; {block.publisher}</span>}
                </div>
                <a
                  href={safeHref(block.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8B5E3C] hover:underline font-semibold"
                >
                  Verify Source &rarr;
                </a>
              </div>
            );
          }

          case 'disclosure': {
            return (
              <div
                key={index}
                className="my-6 p-3.5 bg-stone-100 border border-stone-200 rounded-sm text-xs font-sans text-stone-600 italic"
              >
                {block.text}
              </div>
            );
          }

          case 'divider': {
            return <hr key={index} className="my-8 border-t border-stone-300" />;
          }

          default:
            return null;
        }
      })}
    </div>
  );
};
