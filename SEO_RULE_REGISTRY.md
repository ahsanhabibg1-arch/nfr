# SEO Rule Registry (Batch 06)

> Audience: editors + engineers. Every rule the SEO engine applies, with its
> stable code, category, severity and kind. Source of truth: `lib/seo-intel/rules.ts`.
> Severity is an **internal editorial diagnostic**, not a Google score. Length
> checks are **configurable guidance**, not indexing rules.

Kinds: **DEFECT** (an actual problem), **RECOMMENDATION** (editorial advice),
**OPPORTUNITY** (optional optimization), **NOT_PERFORMED** (a check that could
not be run). Severity: CRITICAL > HIGH > MEDIUM > LOW > INFO.

## Content (article metadata, §6)
| Code | Severity | Kind | Checks |
|---|---|---|---|
| ART_NO_HEADLINE | CRITICAL | DEFECT | Article has no headline. |
| ART_NO_SEO_TITLE | HIGH | DEFECT | No SEO title (field 5). |
| ART_NO_META_DESC | HIGH | DEFECT | No meta description (field 6). |
| ART_TITLE_LEN | LOW | RECOMMENDATION | SEO title length outside guidance. |
| ART_META_DESC_LEN | LOW | RECOMMENDATION | Meta description length outside guidance. |
| ART_DUP_SEO_TITLE | MEDIUM | DEFECT | SEO title duplicated across articles. |
| ART_DUP_META_DESC | MEDIUM | DEFECT | Meta description duplicated across articles. |
| ART_NO_EXCERPT | MEDIUM | DEFECT | No editorial excerpt (field 3). |
| ART_NO_CATEGORY | HIGH | DEFECT | No primary category. |
| ART_EMPTY_BODY | HIGH | DEFECT | Body below the minimum word guidance. |
| ART_HEADING_HIERARCHY | LOW | RECOMMENDATION | No section headings in a long body. |
| ART_DUP_HEADINGS | LOW | RECOMMENDATION | Identical heading text repeated. |
| ART_FUTURE_PUBDATE | MEDIUM | DEFECT | Published article dated in the future. |
| ART_NO_FEATURED_IMAGE | LOW | RECOMMENDATION | Published article has no featured image. |

## Editorial quality (§7)
| Code | Severity | Kind | Checks |
|---|---|---|---|
| ED_NO_SOURCES | MEDIUM | RECOMMENDATION | No source references. |
| ED_NO_RODEO_ENTITY | LOW | RECOMMENDATION | No discipline/hub/event/edition association. |
| ED_STALE_EDITION | LOW | RECOMMENDATION | References a past-year edition; verify currency. |

## Technical (§8, DB/static analysis)
| Code | Severity | Kind | Checks |
|---|---|---|---|
| TECH_NO_CANONICAL | HIGH | DEFECT | Published article has no canonical URL. |
| TECH_CANONICAL_MISMATCH | MEDIUM | DEFECT | Canonical ≠ computed canonical path. |
| TECH_PUBLISHED_NOINDEX | HIGH | DEFECT | Published page robots contains noindex. |
| TECH_SITEMAP_EXCLUDED | MEDIUM | DEFECT | Indexable published article missing from sitemap inventory. |
| TECH_REDIRECT_LOOP | HIGH | DEFECT | Redirect target is itself a redirect source. |
| TECH_REDIRECT_TARGET_UNKNOWN | MEDIUM | DEFECT | Redirect target does not resolve. |

## Structured data (§9, JSON-LD)
| Code | Severity | Kind | Checks |
|---|---|---|---|
| SD_ARTICLE_NO_HEADLINE | HIGH | DEFECT | Article JSON-LD would lack a headline. |
| SD_ARTICLE_NO_DATE | MEDIUM | DEFECT | Article JSON-LD would lack datePublished. |
| SD_ARTICLE_NO_IMAGE | LOW | RECOMMENDATION | Article JSON-LD has no image. |
| SD_CANONICAL_MISMATCH | MEDIUM | DEFECT | Schema URL ≠ canonical. |

## Internal links (§10)
| Code | Severity | Kind | Checks |
|---|---|---|---|
| LINK_BROKEN | HIGH | DEFECT | Body link to a path that does not resolve. |
| LINK_TO_UNPUBLISHED | MEDIUM | DEFECT | Link to a draft/archived article. |
| LINK_REDIRECTED | LOW | RECOMMENDATION | Link points to a redirect source. |
| LINK_ORPHAN | MEDIUM | RECOMMENDATION | Published article with no inbound links/relations. |
| LINK_OPPORTUNITY | LOW | OPPORTUNITY | Two articles share a discipline but aren't linked. |

## Rodeo entity (§11)
| Code | Severity | Kind | Checks |
|---|---|---|---|
| RODEO_DUP_SLUG | HIGH | DEFECT | Slug shared by more than one rodeo entity. |
| RODEO_EVENT_NO_EDITION | LOW | RECOMMENDATION | Recurring event with no editions. |
| RODEO_ORPHAN_EDITION | LOW | RECOMMENDATION | Edition with no articles. |
| RODEO_ARTICLE_EDITION_MISMATCH | MEDIUM | DEFECT | Article edition's parent event not among its linked events. |
| RODEO_EDITION_NO_VENUE_DATE | LOW | RECOMMENDATION | Edition missing venue and year. |

## Image SEO & accessibility (§12)
| Code | Severity | Kind | Checks |
|---|---|---|---|
| IMG_NO_ALT | HIGH | DEFECT | Featured image has no ALT (article- or asset-level). |
| IMG_GENERIC_SEO_TITLE | LOW | RECOMMENDATION | Featured image has no image SEO title. |
| IMG_BROKEN_REF | HIGH | DEFECT | Managed media URL does not resolve to an asset. |
| IMG_PRIVATE_ON_PUBLISHED | CRITICAL | DEFECT | Published page's featured image is DRAFT/not-public. |
| IMG_RIGHTS_UNCONFIRMED | HIGH | DEFECT | Published page uses a managed image with unconfirmed rights. |
| IMG_NO_DIMENSIONS | LOW | RECOMMENDATION | Media asset has no recorded dimensions. |

## Configuration (§15)
Rules can be enabled/disabled (`seo.config`). Editorial thresholds
(`seoTitleMin/Max`, `metaDescMin/Max`, `minBodyWords`) are stored in `SeoConfig`
(`key = "thresholds"`) and validated server-side. Disabling a rule stops it
producing findings and auto-resolves its existing ones on the next audit.
