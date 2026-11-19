import { isSafeHref } from './articleInline';

/**
 * Keeps the semantic part of Word/Google Docs/website HTML while removing
 * editor-specific markup that ProseMirror cannot represent.
 *
 * This runs in the browser's inert DOM parser during a paste event. It is not
 * an HTML trust boundary: the resulting document is parsed again by TipTap,
 * and only the marks/nodes registered by the article editor can be stored.
 */
export function sanitizePastedHtml(html: string): string {
  if (!html.trim() || typeof DOMParser === 'undefined') return html;

  const document = new DOMParser().parseFromString(html, 'text/html');
  document
    .querySelectorAll('script, style, meta, link, title, xml, o\\:p')
    .forEach((element) => element.remove());

  document.body.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'class' || name === 'id' || name === 'lang') {
        element.removeAttribute(attribute.name);
      }
    }

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute('href');
      if (!href || !isSafeHref(href)) element.removeAttribute('href');
      element.removeAttribute('target');
      element.removeAttribute('rel');
    }

    const style = element.getAttribute('style');
    if (style) {
      const textAlign = style.match(/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i);
      if (textAlign) {
        element.setAttribute('style', `text-align: ${textAlign[1].toLowerCase()}`);
      } else {
        element.removeAttribute('style');
      }
    }
  });

  // Office exports commonly use spans with inline font styling instead of
  // semantic marks. Promote those marks before TipTap parses the HTML.
  document.body.querySelectorAll('span').forEach((span) => {
    const style = span.getAttribute('style') ?? '';
    const weight = /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
    const italic = /font-style\s*:\s*italic/i.test(style);
    const underline = /text-decoration(?:-line)?\s*:[^;]*(?:underline)/i.test(style);
    const strike = /text-decoration(?:-line)?\s*:[^;]*(?:line-through)/i.test(style);
    const vertical = /vertical-align\s*:\s*(super|sub)/i.exec(style)?.[1];
    const marks: string[] = [];
    let replacement: Element = span;
    if (weight) marks.push('strong');
    if (italic) marks.push('em');
    if (underline) marks.push('u');
    if (strike) marks.push('s');
    if (vertical) marks.push(vertical);

    if (marks.length) {
      for (const tag of marks) {
        const marked = document.createElement(tag);
        while (replacement.firstChild) marked.appendChild(replacement.firstChild);
        replacement.replaceWith(marked);
        replacement = marked;
      }
    }
    replacement.removeAttribute('style');
  });

  return document.body.innerHTML;
}
