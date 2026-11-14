import React from 'react';
import Link from 'next/link';
import { ContentBlock, Article } from '../../types';
import { ImageWithCredit } from '../ImageWithCredit';
import { safeHref } from '../../lib/url';
import { InlineText } from './InlineText';
import { alignmentClass } from '../../lib/content/articleBlockStyle';
import { videoEmbedUrl, videoWatchUrl, VIDEO_PROVIDER_LABEL } from '../../lib/content/articleEmbeds';

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
            /*
              h2-h4. The level is the stored one, so the published outline is
              the one the author built: promoting an h4 to an h3 to "tidy" the
              hierarchy would silently change the document outline a screen
              reader and a search engine both navigate by.
            */
            const HeadingTag = block.level === 4 ? 'h4' : block.level === 3 ? 'h3' : 'h2';
            const sizeClass =
              block.level === 2
                ? 'text-2xl sm:text-3xl font-bold mt-10 mb-4 pt-4 border-t border-stone-200'
                : block.level === 3
                  ? 'text-xl sm:text-2xl font-semibold mt-8 mb-3'
                  : 'text-lg sm:text-xl font-semibold mt-6 mb-2 text-[#8B5E3C]';

            return (
              <HeadingTag
                key={index}
                id={block.id}
                className={`font-serif text-[#0F1115] scroll-mt-24 ${sizeClass} ${alignmentClass(block.align)}`}
              >
                <InlineText text={block.text} runs={block.runs} />
              </HeadingTag>
            );
          }

          case 'paragraph': {
            return (
              <p
                key={index}
                /*
                  `alignmentClass` returns '' for the default, so an unaligned
                  paragraph's markup is exactly what it was before alignment
                  existed — no class to override the stylesheet by accident.
                */
                className={`${block.isDropCap ? 'drop-cap text-stone-950' : 'text-stone-800'} ${alignmentClass(block.align)}`}
              >
                <InlineText text={block.text} runs={block.runs} />
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
                  &ldquo;<InlineText text={block.quote} runs={block.quoteRuns} />&rdquo;
                </p>
                <cite className="block mt-3 text-xs uppercase tracking-widest font-sans font-semibold text-[#8B5E3C]">
                  &mdash; {block.attribution} {block.role ? `(${block.role})` : ''}
                </cite>
              </blockquote>
            );
          }

          case 'list': {
            /*
              A CHECKLIST IS NOT A FORM.

              The published article is a static document, so the boxes are
              presentational: a disabled checkbox input would be announced as an
              interactive control a reader cannot use, and an enabled one would
              invite a click that saves nothing. Instead each item carries a
              glyph that is hidden from assistive technology and a visually
              hidden word that states the state in prose — so a screen reader
              hears "Done: book the venue" rather than "checkbox, checked".
            */
            if (block.checklist) {
              return (
                <ul key={index} className="my-4 space-y-2 list-none pl-0 text-base">
                  {block.items.map((item, i) => {
                    const done = block.checked?.[i] === true;
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className={`mt-[0.35rem] shrink-0 w-4 h-4 flex items-center justify-center text-[11px] font-bold border rounded-xs ${
                            done
                              ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]'
                              : 'bg-white text-transparent border-stone-400'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={done ? 'text-stone-500' : 'text-stone-800'}>
                          <span className="sr-only">{done ? 'Done: ' : 'Not done: '}</span>
                          <InlineText text={item} runs={block.itemRuns?.[i] ?? null} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              );
            }

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
                    {/* `itemRuns` is positional and sparse: index i may be
                        absent or null, which means "this item has no inline
                        formatting". That keeps a list where only one item is
                        formatted from having to store runs for all of them. */}
                    <InlineText text={item} runs={block.itemRuns?.[i] ?? null} />
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
                  /* Full-project audit — accessibility fix (heading hierarchy).
                     A callout sits between the article's `h2` body sections, so
                     an `h4` title skipped a level (h2 -> h4). `h3` is the
                     correct level for a block nested under a body section.
                     Visual size is set by the classes, not the tag. */
                  <h3 className="text-xs uppercase tracking-widest font-bold mb-1.5 text-[#8B5E3C]">
                    {block.title}
                  </h3>
                )}
                <p><InlineText text={block.text} runs={block.runs} /></p>
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

          case 'faq': {
            /*
              A DESCRIPTION LIST, NOT A STACK OF DIVS.

              `dl`/`dt`/`dd` is what a question-and-answer set is: assistive
              technology announces the pairing and lets a reader move between
              questions, which a styled div cannot. Each question is `dt`, so
              it is also not a heading — headings would appear in the article's
              outline and in the contents list beside real sections.
            */
            return (
              <section key={index} className="my-8" aria-label={block.title || 'Questions and answers'}>
                {block.title && (
                  <h3 className="font-serif text-xl sm:text-2xl font-semibold text-[#0F1115] mb-3">
                    {block.title}
                  </h3>
                )}
                <dl className="divide-y divide-stone-200 border-y border-stone-200">
                  {block.items.map((item, i) => (
                    <div key={i} className="py-3.5">
                      <dt className="font-sans font-semibold text-base text-[#0F1115]">{item.question}</dt>
                      <dd className="mt-1.5 text-stone-800">
                        <InlineText text={item.answer} runs={item.answerRuns} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          }

          case 'footnotes': {
            /*
              Numbered by position with an `ol`, so the browser owns the
              numbering. The author places the matching marker in the prose
              with the superscript mark; there is no automatic link between the
              two, and pretending otherwise with a guessed anchor would send a
              reader to the wrong note.
            */
            return (
              <section key={index} className="my-8 pt-4 border-t border-stone-300" aria-label={block.title || 'Notes'}>
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-stone-500 mb-2">
                  {block.title || 'Notes'}
                </h3>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-stone-700">
                  {block.items.map((item, i) => (
                    <li key={i}>
                      <InlineText text={item.text} runs={item.runs} />
                    </li>
                  ))}
                </ol>
              </section>
            );
          }

          case 'gallery': {
            // Same reasoning as an unfilled video: an empty gallery is a block
            // the author has not finished, not a gallery of nothing.
            if (block.images.length === 0) return null;
            const isRow = block.layout === 'row';
            return (
              <figure key={index} className="my-8">
                <div
                  className={
                    isRow
                      // A row scrolls rather than squeezing: six photographs
                      // crushed to thumbnail width show a reader nothing.
                      ? 'flex gap-3 overflow-x-auto pb-2 snap-x'
                      : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                  }
                >
                  {block.images.map((img, i) => (
                    <div key={i} className={isRow ? 'min-w-[16rem] snap-start' : ''}>
                      {/*
                        Each image keeps its own alt text, caption and credit:
                        a reader using a screen reader meets them one at a
                        time, and a single caption for the set tells them
                        nothing about any individual photograph.
                      */}
                      <ImageWithCredit
                        src={img.src}
                        alt={img.alt}
                        caption={img.caption}
                        credit={img.credit}
                      />
                    </div>
                  ))}
                </div>
                {block.caption && (
                  <figcaption className="mt-2 text-xs font-sans text-stone-500">{block.caption}</figcaption>
                )}
              </figure>
            );
          }

          case 'video': {
            /*
              THE EMBED URL IS BUILT HERE, FROM A CLOSED PROVIDER LIST.

              `videoEmbedUrl` returns null for anything it does not recognise,
              and this is checked at RENDER time as well as on save — storage
              is validated, but a renderer that trusts its input is one bad
              import or one direct database edit away from putting an arbitrary
              origin in an iframe. An unrecognised reference costs the reader
              one video, not the page.
            */
            // An empty id means the block was inserted and not yet filled in;
            // drawing a "could not be displayed" note for the author's own
            // unfinished work would be wrong, so it renders nothing.
            if (!block.videoId) return null;
            const embed = videoEmbedUrl(block.provider, block.videoId);
            if (!embed) {
              return (
                <div key={index} className="my-6 p-3 border border-dashed border-stone-300 rounded-sm text-xs font-sans text-stone-500">
                  This video could not be displayed.
                </div>
              );
            }
            const watch = videoWatchUrl(block.provider, block.videoId);
            return (
              <figure key={index} className="my-8">
                <div className="relative w-full aspect-video bg-stone-900 rounded-sm overflow-hidden">
                  <iframe
                    src={embed}
                    // A frame with no accessible name is announced as "frame",
                    // which is why the schema requires a title.
                    title={block.title}
                    loading="lazy"
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    // The embed is third-party content: it gets no access to
                    // this page's origin beyond what playback needs.
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
                <figcaption className="mt-2 text-xs font-sans text-stone-500">
                  {block.caption || block.title}
                  {watch && (
                    <>
                      {' '}
                      <a
                        href={watch}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#8B5E3C] hover:underline"
                      >
                        Watch on {VIDEO_PROVIDER_LABEL[block.provider]}
                      </a>
                    </>
                  )}
                </figcaption>
              </figure>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
};
