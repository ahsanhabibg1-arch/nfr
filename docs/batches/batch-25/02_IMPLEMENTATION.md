# 02 — Implementation Details

## Files changed / added

| File | Change |
|---|---|
| `utils/seoValidator.ts` | **Additive** extension: `findings[]`, `notEvaluated[]`, and per-finding `displayCategory`, `fieldAnchor`, `fieldLabel`, `blocksPublication`, `evaluated`. Scheduled-time check is always present but marked `evaluated:false` when the article isn't scheduled. Tallies count only evaluated checks. All 17 check *rules* and `canPublish` semantics unchanged. |
| `components/admin/editor/SeoAssistantPanel.tsx` | **New** client panel (Phases B/C/F/G copy). |
| `views/admin/AdminArticleEditorShell.tsx` | Mounts the panel; adds `goToField()` + `handleCheckSeo()`; adds anchor ids (`field-04-body`, `editor-slug`, `editor-relationships`, `editor-sources`). |
| `tests/seoValidator.test.ts` | +5 tests (findings shape, blocks-publication flag, Go-to-Field anchor, not-evaluated scheduled, empty article). |
| `e2e/seo-assistant.spec.ts` | **New** e2e: panel renders, Check-SEO-no-navigate, Go-to-Field focuses the field; captures the docs screenshot. |

No Prisma schema change. No new dependency.

## Phase D — the checks (all reused, none fabricated)

| # | Check | Severity | Blocks | Category (panel) | Go-to-Field |
|---|---|---|---|---|---|
| 1 | Main headline present | blocker | ✅ | Editorial Quality | `field-01-headline` |
| 2 | Editorial excerpt present | blocker | ✅ | Editorial Quality | `field-03-excerpt` |
| 3 | Body ≥ 2 structured blocks | blocker | ✅ | Content Structure | `field-04-body` |
| 4 | URL slug format | blocker | ✅ | SEO Metadata | `editor-slug` |
| 5 | Featured image rights verified | compliance | ✅ | Rights, Safety & Compliance | `editor-rights-status` |
| 6 | Image ALT text ≥ 10 chars | compliance | ✅ | Images & Accessibility | `field-08-imagealt` |
| 7 | Monetization disclosure | compliance | ✅ | Rights, Safety & Compliance | `editor-disclosure` |
| 8 | Scheduled time in future *(only when SCHEDULED)* | compliance | ✅ | Publication Readiness | `editor-workflow-state` |
| 9 | SEO title 35–65 chars | warning | ❌ | SEO Metadata | `field-05-seotitle` |
| 10 | Meta description 110–165 | warning | ❌ | SEO Metadata | `field-06-metadesc` |
| 11 | Image SEO title | notice | ❌ | Images & Accessibility | `field-07-imageseotitle` |
| 12 | H2 heading hierarchy | notice | ❌ | Content Structure | `field-04-body` |
| 13 | AI-overview takeaway/callout | notice | ❌ | Content Structure | `field-04-body` |
| 14 | Rodeo entity association | notice | ❌ | Entity Relationships | `editor-relationships` |
| 15 | Source provenance | notice | ❌ | Structured Data | `editor-sources` |
| 16 | Internal links / related | notice | ❌ | Internal & External Links | `editor-relationships` |
| 17 | Canonical trailing slash | notice | ❌ | SEO Metadata | `field-06-metadesc` |

Deliberately **absent** (per spec §D): keyword density, ranking guarantees, "plagiarism-free / verified original" claims — no reliable mechanism, so no such check or label.

## Phase C — actionable guidance
Each failed/warning finding expands to: **Detected** (the engine's `message`), **Standard** (the `rule`), **How to fix** (the `remediation`), **Field** (`fieldLabel`) + a **Go to field →** action that scrolls to and focuses the real control. A static one-line "why it matters" per category provides context (editorial guidance, not a validation result).

## Phase E — validation execution
- The report is a `useMemo` over the current (unsaved) editor snapshot — it is **always live**, so results can't go stale relative to editor content.
- **Check SEO** only re-stamps the review time and jumps to the first blocker. It **does not** save or publish.
- The panel states plainly that it validates **unsaved** content and that the **server** performs the authoritative gate (including rights/relationship/source checks the client can't run). The publish button stays gated by server-enforced `permissions.canPublish`; the transition action surfaces `code:'validation'`. The UI is not an alternative publish path.

## Phase F — publishing workflow
Category A/B/C policy is untouched. The readiness summary reads either
"Publication blocked: N mandatory issue(s) remain." or
"All mandatory editor checks passed. Review N non-blocking warning(s)." — and never claims unconditional "Ready to publish", because the server may still reject on DB-backed checks.

## Editor layout — independent inspector scroll (follow-up fix)

The editor's right inspector column (workflow, Quality & SEO Gates, SEO Assistant, SERP
preview) previously scrolled away with the page while the author wrote in the left
column. Fixed so the inspector **sticks below the 64px topbar and scrolls within its own
area**, independent of the editorial fields:

- Right grid item now `lg:self-stretch` (fills the tall row) with an **inner** wrapper
  `lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto` — the inner-wrapper
  pattern gives the sticky element room to stick.
- **Root cause of the first failed attempt:** `app/globals.css` set `body { overflow-x: hidden }`,
  which forces `overflow-y: auto` and makes `<body>` a scroll container — this silently
  breaks every `position: sticky` descendant. Changed to **`overflow-x: clip`**, which
  prevents horizontal scroll *without* creating a scroll container. (The "no horizontal
  overflow" e2e still passes.)
- Stacks normally on mobile (`lg:` only). Covered by `e2e/seo-assistant.spec.ts` ("the
  inspector column scrolls independently").

## Phase G — SEO preview
The existing `SearchAppearancePreview` (title/description/URL SERP preview) is retained. The new panel adds the honesty note that search engines may render snippets differently; no "exact Google result" claim is made.
