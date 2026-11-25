import React from 'react';

/**
 * The site's ONE question-and-answer accordion.
 *
 * WHY ONE COMPONENT FOR THREE CALLERS. Before this, the site drew a question
 * set three different ways: the article body laid every question and answer out
 * permanently open in a `dl`, the entity pages used a `details` with a "+" that
 * rotated into an "x", and the Visual Builder's `faq-block` used a `details`
 * with a rotating triangle. Three presentations of one idea — and only the
 * article one, on the longest pages the site has, kept every answer open. That
 * is what made an article with eight questions scroll for a screen and a half
 * of text the reader had not asked for.
 *
 * So the three now share this file. Changing the row padding, the icon or the
 * animation happens once, and no caller can drift back to its own version.
 *
 * WHY NATIVE `details`/`summary` RATHER THAN BUTTONS AND STATE.
 *
 *   - The disclosure semantics, the keyboard interaction (Enter and Space) and
 *     the expanded state reported to assistive technology are the browser's,
 *     not ours. A button-based accordion has to re-implement all three, and is
 *     only ever as correct as the next edit leaves it.
 *   - It needs no JavaScript, so it works in a server-rendered page with no
 *     client bundle, nothing to hydrate, and therefore no hydration mismatch:
 *     the whole class of "the server said closed and the client said open"
 *     defects cannot occur here.
 *   - Every answer is in the server-rendered HTML whether or not it has been
 *     opened. That is what keeps the FAQPage structured data honest — the
 *     markup describes rows genuinely present on the page. Fetching an answer
 *     on click would describe content the HTML does not contain.
 *
 * SINGLE-OPEN COMES FROM THE PLATFORM TOO. `name` on `details` makes a group
 * exclusive: opening one row closes its sibling, and the browser does it.
 * Groups with different names are independent, which is how an article
 * carrying two question sets — or a question set plus a Visual Builder FAQ
 * region — keeps one set's state out of the other's. In a browser too old for
 * exclusive accordions the group degrades to several independently open rows,
 * which is the previous behaviour rather than a broken one.
 *
 * WHAT IS NOT CLAIMED. Collapsing answers is a reading-experience change. It is
 * not a route to Google FAQ rich results: those have been limited to
 * authoritative government and health sites since 2023, and no markup or
 * interaction pattern changes that.
 */

export interface FaqAccordionRow {
  /** Unique within the group. Becomes part of the answer panel's DOM id. */
  key: string;
  question: string;
  /**
   * The answer. A string is wrapped in a paragraph; a node is drawn as given,
   * which is how the article body passes its inline runs (links, emphasis)
   * through unchanged instead of flattening them to text.
   */
  answer: React.ReactNode;
}

/**
 * A DOM id fragment that is stable for the same input and legal in `id`.
 *
 * Question text and database ids both reach here, so anything outside
 * `[A-Za-z0-9_-]` folds to a hyphen. Stability matters more than prettiness:
 * the id is referenced by `aria-controls`, so it has to come out the same on
 * the server and in the browser.
 */
function idPart(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return cleaned || 'x';
}

/** Blank-line-separated plain text as paragraphs, which is how entity answers are stored. */
export function FaqAnswerText({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

/**
 * The accordion rows on their own — no section element, no heading.
 *
 * Each caller already owns its heading and spacing (the article body uses the
 * author's block title, the entity pages a fixed "Frequently Asked Questions",
 * the Visual Builder an editable one), so a second section here would nest
 * landmarks and duplicate headings.
 *
 * `group` must be unique on the page: it names the exclusive accordion group
 * and prefixes every panel id. Two groups sharing a name would close each
 * other's rows.
 */
export function FaqAccordionRows({
  group,
  rows,
  className = '',
}: {
  group: string;
  rows: readonly FaqAccordionRow[];
  className?: string;
}) {
  if (rows.length === 0) return null;
  const g = idPart(group);
  return (
    <div className={`divide-y divide-stone-200 border-y border-stone-200 ${className}`.trimEnd()}>
      {rows.map((row) => {
        const panelId = `faq-${g}-${idPart(row.key)}`;
        return (
          <details key={row.key} name={`faq-${g}`} className="nfr-faq-item">
            {/*
              The WHOLE row is the control, because `summary` IS the control and
              it is a flex row spanning the full width — so the question text,
              the empty space beside it and the icon are one click target. A
              button wrapped around only the text would leave the rest of the
              row dead to a pointer and to a thumb.
            */}
            <summary className="nfr-faq-summary" aria-controls={panelId}>
              <span className="nfr-faq-question">{row.question}</span>
              {/*
                Plus when closed, minus when open: the vertical bar is the only
                thing that moves, scaled away by CSS on `[open]`. Drawn rather
                than imported so it takes its colour from a brand token and
                costs no icon dependency, and hidden from assistive technology
                because `summary` already announces whether the row is
                expanded — a screen reader reading "plus" after "collapsed" is
                noise, not information.
              */}
              <svg
                className="nfr-faq-icon"
                viewBox="0 0 16 16"
                width="16"
                height="16"
                aria-hidden="true"
                focusable="false"
              >
                <line x1="2.5" y1="8" x2="13.5" y2="8" />
                <line x1="8" y1="2.5" x2="8" y2="13.5" className="nfr-faq-icon__bar" />
              </svg>
            </summary>
            <div id={panelId} className="nfr-faq-answer">
              {typeof row.answer === 'string' ? <p>{row.answer}</p> : row.answer}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/**
 * The entity-page question set: category, subcategory, discipline, competitor,
 * venue, event and edition pages all render this.
 *
 * Takes the rows `listPublicFaqs` returns — already filtered to the enabled
 * ones and ordered — which are the same rows the page's FAQPage JSON-LD is
 * built from. `group` defaults to a constant because each of these pages
 * renders exactly one set; a page that grows a second must pass its own.
 */
export function FaqAccordion({
  faqs,
  group = 'entity',
  heading = 'Frequently Asked Questions',
}: {
  faqs: { id: string; question: string; answer: string }[] | null | undefined;
  group?: string;
  heading?: string;
}) {
  if (!faqs || faqs.length === 0) return null;
  return (
    <section className="mt-10" aria-label="Frequently asked questions">
      <h2 className="text-sm uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-3">{heading}</h2>
      <FaqAccordionRows
        group={group}
        rows={faqs.map((f) => ({
          key: f.id,
          question: f.question,
          answer: <FaqAnswerText text={f.answer} />,
        }))}
      />
    </section>
  );
}

export default FaqAccordion;
