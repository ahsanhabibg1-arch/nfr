# 01 — Existing SEO System Audit (Phase A)

Audited before any change. **No new SEO engine was created** — the existing one is reused.

## Two distinct SEO systems exist

1. **SEO Intelligence module** (Batch 06) — `lib/cms/seoService.ts` + `app/admin/seo/` +
   `views/admin/ArticleSeoPanel.tsx`. Persists `SeoFinding` rows from full audits run
   from the SEO Intelligence page. In the editor it renders a small **advisory**
   diagnostics list (`ArticleSeoPanel`, a server component) that *never blocks publishing*.
2. **Editor publication-gate validator** (the authoritative gate) —
   `utils/seoValidator.ts` `validateArticle()`. A pure function producing a
   `ArticleValidationReport`. This is what the editor's **Quality & SEO Gates** panel
   and the **server** publish gate both use.

Batch 25 targets system #2 (the gate/validator the spec calls "Quality & SEO Gates").

## The validation engine — `utils/seoValidator.ts`

`validateArticle(article)` runs **17 checks** and returns
`{ blockers, compliance, warnings, notices, canPublish, score, totalChecks, passedChecks }`.
Each finding already carries `{ id, group, severity, rule, field, message, remediation, passed }`.

Severities → gate behavior:
- `blocker` (Category A, editorial) and `compliance` (Category B, rights/safety) — **block publication** (`canPublish = no blockers && no compliance failures`).
- `warning` (Category C) and `notice` — **do not block**.

### Full check inventory

| # | id | Severity | Blocks? | Field | Auto? |
|---|---|---|---|---|---|
| 1 | `val-headline-req` | blocker | ✅ | title (Field 01) | auto |
| 2 | `val-excerpt-req` | blocker | ✅ | excerpt (Field 03) | auto |
| 3 | `val-body-req` (≥2 blocks) | blocker | ✅ | structuredBody (Field 04) | auto |
| 4 | `val-slug-format` | blocker | ✅ | slug | auto |
| 5 | `val-image-rights` | compliance | ✅ | imageRightsStatus | auto |
| 6 | `val-alt-required` (≥10 chars) | compliance | ✅ | imageAltText (Field 08) | auto |
| 7 | `val-monetization-disclosure` | compliance | ✅ | disclosureNote | auto |
| 8 | `val-scheduled-time` | compliance | ✅ (only when SCHEDULED) | scheduledAt | conditional |
| 9 | `val-seo-title-len` (35–65) | warning | ❌ | seo.title (Field 05) | auto |
| 10 | `val-meta-desc-len` (110–165) | warning | ❌ | seo.description (Field 06) | auto |
| 11 | `val-image-seo-title` | notice | ❌ | imageSeoTitle (Field 07) | auto |
| 12 | `val-heading-hierarchy` (H2) | notice | ❌ | structuredBody (Field 04) | auto |
| 13 | `val-ai-readiness` (callout/takeaway) | notice | ❌ | structuredBody (Field 04) | auto |
| 14 | `val-entity-association` | notice | ❌ | relationships | auto |
| 15 | `val-sources-provenance` | notice | ❌ | sources | auto |
| 16 | `val-internal-links` | notice | ❌ | relatedArticleIds | auto |
| 17 | `val-canonical-redirects` | notice | ❌ | seo.canonicalUrl | auto |

### Phase A inventory answers

1. **Existing checks:** the 17 above.
2. **Run automatically:** all of them — `validationReport` is a `useMemo` recomputed on every editor edit (reactive), so results are always live for the *unsaved* editor content.
3. **Require manual execution:** none (no explicit "Check SEO" button existed — it was implicit/continuous). The SEO Intelligence full audit (system #1) is the separately-run one.
4. **Block publication:** checks 1–8 (blocker + compliance). Enforced **server-side** too.
5. **Non-blocking warnings:** checks 9–17 (warning + notice).
6. **Implemented but not displayed:** this was the core gap — the panel rendered only summary counts + a flat list of *failed blockers/compliance*. Passed checks, warnings, notices, per-check explanation/remediation/field, and grouping were **computed but never rendered**.
7. **Displayed without useful explanations:** the "Inspect All Validation Findings" box showed `message — remediation` for blockers only; no severity label, no field mapping, no "why it matters", no Go-to-Field.
8. **Missing checks justified by requirements:** no keyword-density check (intentionally excluded per §8.1 — "Do not introduce arbitrary keyword-density requirements"); no "ranking guarantee"/"plagiarism-free" claims (no reliable mechanism — intentionally absent).

**Conclusion (the key Phase A question):** *Yes* — the panel already had access to detailed, structured validation findings but failed to render them. The fix is a presentation/UX improvement over the **existing** engine, not a new engine.

## Server-side authoritative gate — `lib/cms/articleService.ts`

The server reuses the **same** `validateArticle` (`report.canPublish`) at the publish
transition (and on save), and **adds DB-only checks the client cannot do**:

- every managed (DAM) image must have `rightsConfirmed = true` in the Media Library,
- linked relationships (disciplines/hubs/events/editions) must still exist,
- linked sources must still exist.

Implication for the UI: the editor's client report is authoritative for *its* checks,
but the server may still reject on these DB-backed checks. The panel must therefore
**not** claim unconditional "Ready to publish" — it says mandatory *editor* checks pass
and the server performs final rights/relationship/source verification on publish. The
publish button itself is gated by server-enforced `permissions.canPublish`, and the
transition action returns `code: 'validation'` which the UI surfaces — the UI cannot
bypass server validation.

## Data models

`Article` (Prisma) + the editor's `Article`/`ContentBlock` TS types (`types.ts`),
`SeoFinding` (SEO Intelligence). **No schema change is required for Batch 25** — the
improvement is presentation + an additive, backward-compatible extension of the
validator's return shape.

## Existing SEO preview

`components/admin/editor/SearchAppearancePreview.tsx` already renders a Google-style
SERP preview (title/description/URL). Phase G only needs minor guidance copy, not a
rebuild.

## Tests covering the engine today

`tests/seoValidator.test.ts` (3 cases: headline blocker, image-rights compliance,
all-pass). These only use `blockers`/`compliance`/`canPublish`, so the return shape can
be **extended additively** without breaking them.
