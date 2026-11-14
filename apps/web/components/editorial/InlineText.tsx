import React from 'react';
import type { InlineRun } from '../../lib/content/articleInline';
import { isSafeHref } from '../../lib/content/articleInline';

/**
 * Renders a block's text, with inline formatting when the block carries it.
 *
 * XSS-SAFE BY CONSTRUCTION, not by sanitising. Every run becomes a React
 * element with the run's text as a child, so React escapes the content exactly
 * as it did when the body was plain strings. No markup is ever injected, so
 * there is no sanitizer whose allowlist could be wrong and no parser to
 * mis-handle a crafted payload.
 *
 * THE FALLBACK IS THE POINT. `runs` is optional: a block written before inline
 * formatting existed, or one whose projection failed reconciliation on save,
 * renders from `text` and is indistinguishable from the previous output. That
 * is what makes every stored article still render correctly.
 *
 * `isSafeHref` is applied again HERE, not only on save. Storage is validated,
 * but a renderer that trusts its input is one bad migration or one direct
 * database edit away from emitting a `javascript:` link. An unsafe href renders
 * as plain text — the words survive, the target does not.
 */
export const InlineText: React.FC<{ text: string; runs?: InlineRun[] | null }> = ({ text, runs }) => {
  if (!runs || runs.length === 0) return <>{text}</>;

  return (
    <>
      {runs.map((run, i) => {
        let node: React.ReactNode = run.text;

        // Marks nest outward in a fixed order so the same runs always produce
        // the same tree, which keeps snapshots and comparisons stable.
        //
        // Superscript and subscript are INNERMOST, so a bold footnote marker is
        // `<strong><sup>3</sup></strong>` rather than a raised bold span: the
        // vertical shift belongs to the character, the weight to the phrase.
        // The editor refuses to apply both at once; if stored data somehow
        // carries both, `sup` wins over `sub` here rather than nesting them into
        // something unreadable.
        if (run.marks?.includes('sub') && !run.marks?.includes('sup')) node = <sub>{node}</sub>;
        if (run.marks?.includes('sup')) node = <sup>{node}</sup>;
        if (run.marks?.includes('strike')) node = <s>{node}</s>;
        if (run.marks?.includes('underline')) node = <u>{node}</u>;
        if (run.marks?.includes('italic')) node = <em>{node}</em>;
        if (run.marks?.includes('bold')) node = <strong>{node}</strong>;

        if (run.href && isSafeHref(run.href)) {
          const external = /^https:/i.test(run.href);
          node = (
            <a
              href={run.href}
              className="underline decoration-[#8B5E3C]/40 hover:decoration-[#8B5E3C] underline-offset-2"
              // Only an off-site link needs the new tab and the opener guard;
              // adding them to internal links would break in-site navigation.
              {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
            >
              {node}
            </a>
          );
        }

        return <React.Fragment key={i}>{node}</React.Fragment>;
      })}
    </>
  );
};
