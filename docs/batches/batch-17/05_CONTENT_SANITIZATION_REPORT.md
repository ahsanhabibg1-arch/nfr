# Batch 17 §D — Rich-Content Sanitization Report

**Date:** 2026-11-04

## Trace of the rich-content render path
| Surface | Finding |
|---------|---------|
| Article body storage | **Structured block model** (`ArticleBlock` / `article.structuredBody`), not raw HTML. |
| Public render (`components/editorial/ArticleBody.tsx`) | Renders each block (`heading`/`paragraph`/`quote`/`list`/`table`/`image`) as **React elements with the text passed as children** — React escapes it. No HTML string is ever injected. |
| Editor serialization (`RichBlockEditor`) | Produces/consumes the structured block model; no HTML blob stored. |
| Outbound links | Pass through `safeHref` / `isSafeHref` (`lib/url.ts`) — an **allowlist** of `http(s)`, `mailto`, `tel`, site-relative/fragment. `javascript:`, `data:`, `vbscript:`, `file:` are rejected → neutral `#`. |
| JSON-LD | The only `dangerouslySetInnerHTML` in the codebase (`lib/seo.tsx JsonLd`), fed exclusively by `serializeJsonLd`, which escapes `<`, `>`, `&`, U+2028/U+2029 so a `</script>` payload cannot break out. |
| Search highlight (`components/search/SearchHighlight.tsx`, `lib/search/query.ts`) | Builds `<mark>` React nodes, explicitly **no** `dangerouslySetInnerHTML`. |

### `grep dangerouslySetInnerHTML` → one hit (JSON-LD, escaped). No untrusted-HTML sink exists.

## Conclusion: no vulnerability found
Untrusted HTML cannot reach the browser as markup. The body is escaped React text, links are allowlisted, and the single raw-HTML sink is the escaped JSON-LD serializer. **No editor or storage rewrite was needed** (and none was done — per the batch's "if no vulnerability exists, document and avoid unnecessary changes").

## Regression lock-in — `tests/batch17-sanitization.test.ts` (5 cases, all pass)
- `safeHref` rejects `javascript:` (incl. mixed-case + leading space), `data:`, `vbscript:`, `file:`.
- `safeHref` accepts http/https/mailto/tel/relative/fragment/query.
- Empty/nullish hrefs → unsafe (`#`).
- `serializeJsonLd` neutralizes a `</script><script>` payload (escapes `<`,`>`,`&`) and round-trips to equivalent JSON.
- `serializeJsonLd` escapes U+2028/U+2029.

Hostile inputs (script tags, inline handlers, dangerous schemes, malformed markup) are therefore verified to render as inert text / be rejected, while normal editorial formatting (headings, paragraphs, lists, tables, quotes, images, safe links) is preserved.

## Remaining risk
Low. If a future change introduces an HTML-blob block type or a markdown→HTML renderer, sanitization (e.g., an allowlist sanitizer at the trust boundary) must be added **then**. The current structured-block design is the strongest posture and should be retained.
