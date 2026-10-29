# Sources & References System (Batch 04 — Phase E)

> Audience: editors and engineers. Covers the sources/references module used to
> track citations, their verification status and URL safety.

Service: `lib/cms/sourceService.ts`. Actions: `app/admin/source-actions.ts`.
UI: `views/admin/AdminSourcesPage.tsx`. Route:
`app/admin/(dashboard)/sources/page.tsx`. Permission: **`source.manage`**
(Editor and above).

## 1. Model

`Source`: `title`, `url`, `publisher`, `type`, `classification`
(`OFFICIAL | INDEPENDENT_REFERENCE | HISTORICAL_ARCHIVE`), `status`
(`NEEDS_REVIEW | VERIFIED | EXPIRED`), `verificationDate`, and a count of linked
articles (`ArticleSource`).

## 2. URL validation

Every create/update runs the URL through `isSafeHref` (`lib/url.ts`), which
permits only safe protocols (`http`, `https`, `mailto`, `tel`). Dangerous
schemes (`javascript:`, `data:`, …) are rejected with `ServiceError('validation')`
before any write. Verified by test ("unsafe URL scheme is rejected").

## 3. Verification status — never fabricated

`setSourceStatus(actor, id, status)` records the **actual time of the editorial
action** as `verificationDate` when (and only when) the status becomes
`VERIFIED`; moving to any other status clears it. The date is `new Date()` at
the moment an editor verifies — it is never back-dated or invented. New sources
start as `NEEDS_REVIEW`.

## 4. Referential protection

`deleteSource` counts `ArticleSource` links first and refuses (`conflict`) when
the source is cited by ≥1 article, instructing the editor to detach it first.
The UI hides Delete for cited sources. This prevents orphaning citations on
published articles.

## 5. Listing / filtering

`listSources({ q, status })` supports case-insensitive search across title /
publisher / URL and an optional status filter, capped at 200 rows, ordered by
title.

## 6. Tests

`tests/batch04.test.ts`: create by Editor + SEO-Manager forbidden; unsafe URL
rejection; VERIFIED records a real `verificationDate`; cited-source delete
refusal then success after detaching.
