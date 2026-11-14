import sanitize from 'sanitize-html';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup',
  'a', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'dl', 'dt', 'dd',
  'figure', 'figcaption',
  'div', 'span', 'section', 'article', 'aside',
  'abbr', 'cite', 'time',
  // PM-03. An information page can carry images now, but only ones the Media
  // Library serves — see `allowedSchemesByTag` and the transform below.
  'img',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'rel', 'target'],
  abbr: ['title'],
  time: ['datetime'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
  '*': ['class', 'id'],
};

/**
 * Images must come from THIS site's media routes, and that restriction is not
 * decoration.
 *
 * An editor who can store an arbitrary `<img src>` can point a legal page at a
 * third-party server, which then receives the IP address and user-agent of
 * every reader of that page — tracking the site did not choose and cannot see.
 * It is also the usual way a mixed-content or hotlink problem arrives.
 *
 * So an `img` keeps its `src` only when the path is one the application itself
 * serves. Anything else loses the attribute, and the sanitiser's own
 * `exclusiveFilter` then drops the now-sourceless tag rather than leaving a
 * broken image in a published policy page.
 */
const MEDIA_SRC = /^\/(api\/media\/|assets\/images\/|uploads\/)/;

export function isAllowedMediaSrc(src: string): boolean {
  return MEDIA_SRC.test(src.trim());
}

export function sanitizeLegalHtml(dirty: string): string {
  return sanitize(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['https', 'http', 'mailto'],
    disallowedTagsMode: 'discard',
    selfClosing: ['br', 'hr', 'img'],
    transformTags: {
      img: (tagName, attribs) => {
        const src = typeof attribs.src === 'string' ? attribs.src : '';
        if (!isAllowedMediaSrc(src)) {
          // Strip the source rather than the whole tag here; `exclusiveFilter`
          // below removes what is left, so the two rules cannot disagree.
          const { src: _dropped, ...rest } = attribs;
          return { tagName, attribs: rest };
        }
        // Images in a long policy page should not block first paint.
        return { tagName, attribs: { loading: 'lazy', decoding: 'async', ...attribs } };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    enforceHtmlBoundary: false,
  });
}
