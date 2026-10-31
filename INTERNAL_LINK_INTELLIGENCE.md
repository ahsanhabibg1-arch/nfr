# Internal Link Intelligence (Batch 06 §10)

> Audience: editors + engineers. How internal-link analysis works and what it
> recommends — based on real entity relationships, never generic keyword overlap.

## What it analyzes

- **Body links** — internal paths extracted from article block content (articles,
  sections, disciplines, categories).
- **Relationships** — `ArticleRelation` (related articles), article↔category /
  discipline / hub / event / edition links, navigation and the redirect registry.

## Findings

| Finding | Meaning |
|---|---|
| `LINK_BROKEN` | A body link targets a path that does not resolve to a known route or published article. |
| `LINK_TO_UNPUBLISHED` | A body link targets a draft/archived (non-public) article. |
| `LINK_REDIRECTED` | A body link targets a known redirect source; should point at the final URL. |
| `LINK_ORPHAN` | A published article has no inbound internal links or related-article relationships. |
| `LINK_OPPORTUNITY` | Two published articles share a discipline but are not linked — a suggested, relationship-based link. |

## Recommendations are relationship-based, not keyword-based

`LINK_OPPORTUNITY` is only raised when two published articles share a real
taxonomy relationship (a discipline). It is **not** raised because two pages
share generic words. Each opportunity provides the **source article**, a
**suggested target** (canonical relative path), the **relationship reason**, and
is marked as an OPPORTUNITY (optional).

## No automatic insertion

The engine never inserts links into published articles. Opportunities are
surfaced for editorial review in the SEO dashboard and the editor's advisory
panel; applying them is a manual editorial action.
