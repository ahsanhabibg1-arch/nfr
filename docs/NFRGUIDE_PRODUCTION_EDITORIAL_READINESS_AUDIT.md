# NFRGuide — Production Readiness & Editorial CMS Integration Audit

**Date:** 2026-11-12 · **Branch:** `main` · **HEAD:** `54fe6dd28a77ba5da54452e66b8c3a78b9752f68`
**Type:** AUDIT ONLY — no application code, Prisma schema, migration, database, deployment
configuration or environment secret was modified. Nothing was committed, pushed or deployed.
No production media was uploaded. No secret value appears in this report.

---

## 1. Executive summary

All four problems the owner reported are **real and reproducible from the source**. Two have
a confirmed root cause in code; one is a configuration mismatch I can bound but not finish
diagnosing without Render access; one is a set of missing admin surfaces.

| # | Owner's report | Verdict |
|---|---|---|
| 1 | Article Type (18 typologies) has no management interface | **CONFIRMED** — hardcoded TypeScript array; no table, no enum, no admin module |
| 2 | Subcategory workflow unclear | **CONFIRMED, worse than stated** — a free-text input with no vocabulary at all; 11 distinct values already exist in the development database |
| 3 | Media uploads fail in production | **CONFIRMED** — and the code discards the cause, so production logs say nothing. R2 itself is healthy (verified 7/7 round-trip) |
| 4 | Builder canvas shows `localhost refused to connect` | **CONFIRMED, root cause found** — `preview/route.ts:60` builds an absolute redirect from `req.url`, which is the container's internal origin |
| 5 | Discipline pages lack hero-image management | **CONFIRMED, broader than stated** — hero image, image credit, rules and scoring are all **seed-only**; no admin action writes them |

The single most useful structural finding: **the Discipline remediation needs no database
migration.** `image`, `imageCredit` and `guide` already exist on the model and are already
rendered publicly — only the editing surface is missing.

The most urgent operational finding: **the media-upload diagnostic fix is written but not
deployed.** Commit `c03e233` adds the missing error reporting; Render's last successful
deploy was `abc0da5`. Until that ships, every upload failure remains invisible.

---

## 2. Current repository state

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd`, level with `origin/main` (0 ahead, 0 behind) |
| Working tree | **clean** · 0 staged · 0 stashes |
| Migrations | **21**, newest `20261112000000_add_rodeo_archived_at`, `20261112010000_add_seed_tombstone` |
| Development DB | `localhost:5433/nfrguide_dev` — **"Database schema is up to date!"** (21/21). The SeedTombstone migration the brief lists as pending **has been applied** |
| Test DB | `localhost:5433/nfrguide_test` — 21/21 applied |
| Latest commit | `54fe6dd` *feat(rodeo-coverage): entity lifecycle, dependency transfer, slugs & redirects* — 38 files, ~6,000 insertions, 5 new test files |

Static checks run during this audit: `tsc --noEmit` **clean**, Vitest **2,687 passed / 124
files, 0 failed**. Both executed on Node 22.23.4 (the version `render.yaml` pins).

---

## 3. Deployment environment assessment

From the deploy log the owner supplied (2026-11-12 03:08) and `render.yaml` in the repo:

| Item | Observed | Note |
|---|---|---|
| Service | live at `https://nfr-qadd.onrender.com` | build + start succeeded |
| Deployed commit | **`abc0da5`** | **two commits behind** `54fe6dd` |
| Runtime | Node 22.23.4, `next start`, port 10000 | matches `.nvmrc` |
| `APP_ENV` / `NODE_ENV` | `production` / `production` | |
| `db` | `cloud` | Aiven |
| `MEDIA_STORAGE_PROVIDER` | **`r2`** | so all four `MEDIA_S3_*` values are present — the production env guard refuses to start otherwise |
| `NEXT_PUBLIC_SITE_URL` | `https://nfr-qadd.onrender.com` | correct, https |
| Build concurrency | `cpus: 1`, `staticGenerationMaxConcurrency: 1` | added to survive the database's 20-connection ceiling |

**Cloud database is behind the code.** The two migrations in `54fe6dd` have **not** been
applied to the Aiven database. Deploying `54fe6dd` as-is will fail during static generation,
exactly as the earlier `InfoPage` failure did.

**Unverified by me:** the actual values of Render's environment variables, the R2 bucket
binding used in production, and Render's runtime logs. I hold no Render or Cloudflare
credentials. Every statement about production env above is derived from the startup log the
owner pasted, not from reading the dashboard.

---

## 4. Article Editor field matrix

Source: `views/admin/AdminArticleEditorShell.tsx`, `lib/cms/articleService.ts`,
`prisma/schema.prisma`.

| Field | DB ownership | Source of options | Create | Edit | Delete/archive | Admin management location | Validation | Public render | SEO | Hardcoded? |
|---|---|---|---|---|---|---|---|---|---|---|
| Title | `Article.title` | free text | ✓ | ✓ | workflow | Article editor | required | ✓ | title/OG | no |
| Slug | `Article.slug` | derived/editable | ✓ | ✓ | — | Article editor | unique | ✓ | canonical | no |
| Deck / Excerpt | `Article.deck/excerpt` | free text | ✓ | ✓ | — | Article editor | bounded | ✓ | description | no |
| **Article Type** | `Article.articleType` **String (free text, no FK)** | **hardcoded array** `ALL_ARTICLE_TYPES` (`AdminArticleEditorShell.tsx:26-45`, 18 entries) | — | — | — | **NONE** | none at DB level | ✓ (drives `NewsArticle` vs `Article` JSON-LD) | structured data | **YES** |
| **Primary Section** | `Article.category` → `Category` FK | **hardcoded array** `PRIMARY_SECTIONS` (`:47`) | ✓ via Editorial Organization | ✓ | ✓ | Editorial Organization *(but editor does not read it)* | FK | ✓ | breadcrumb | **YES (duplicate source)** |
| **Subcategory** | `Article.subcategory` **String?** | **free-text `<input>`** (`:1156-1169`) | — | — | — | **NONE** | `z.string().max(120)` only | ✓ | search weight C | **N/A — no vocabulary** |
| Tags | `Tag` + `ArticleTag` | DB | ✓ | **✗ no update** | ✓ | Editorial Organization | name | ✓ | — | no |
| Author | `Author` | DB | ✓ | ✓ | ✓ | Editorial Organization | — | ✓ | JSON-LD Person | no |
| Featured image | `Article.heroImageUrl` | Media Library picker | ✓ | ✓ | — | Media Library | optional | ✓ | OG image | no |
| Image rights | `imageCredit`, `imageRightsStatus`, `imageAltText`, `imageCaption` | free text | ✓ | ✓ | — | Article editor | publication blocker | ✓ | alt text | no |
| Sources | `SourceReference` | DB | ✓ | ✓ | ✓ | Sources module + editor | — | ✓ | — | no |
| Related Disciplines | `ArticleDiscipline` | DB | ✓ | ✓ | ✓ | editor relationship panel | FK | ✓ | — | no |
| Rodeo Hubs / Events / Editions | `ArticleRodeo*` | DB | ✓ | ✓ | ✓ | editor panel + Rodeo Coverage | FK | ✓ | — | no |
| Venues / Competitors | `Venue` / `Competitor` | DB | ✓ | ✓ | ✓ (archive, new in `54fe6dd`) | Venues / Competitors modules | FK | ✓ | JSON-LD | no |
| SEO metadata | `ArticleSeo` | editor fields | ✓ | ✓ (title, description, OG) | — | Article editor | bounded | ✓ | ✓ | no |
| `ArticleSeo.robots` | `ArticleSeo.robots` | — | **✗** | **✗ no writer** | — | **NONE** | — | ✓ **consumed by metadata AND sitemap** | ✓ | — |
| Structured body | `Article.structuredBody` Json | block editor | ✓ | ✓ | — | Article editor | block schema | ✓ | — | no |
| Workflow state | `Article.workflowStatus` | enum | ✓ | ✓ | archive | Article editor | state machine | gates publication | — | no |

**Fields whose options exist but cannot be managed through the Admin UI:** Article Type (18
values), Primary Section (editor copy diverges from `SectionConfig`), `ArticleSeo.robots`.

---

## 5. Taxonomy management gap analysis

| Taxonomy | Table | Create | Read | Update | Delete | Archive | Admin home | Verdict |
|---|---|---|---|---|---|---|---|---|
| Category | `Category` | ✓ | ✓ | ✓ | ✓ | — | Editorial Organization | **complete** |
| Author | `Author` | ✓ | ✓ | ✓ | ✓ | — | Editorial Organization | **complete** |
| Tag | `Tag` | ✓ | ✓ | **✗** | ✓ | — | Editorial Organization | rename requires delete + recreate (loses `ArticleTag` links) |
| Source | `SourceReference` | ✓ | ✓ | ✓ | ✓ | — | Sources | complete |
| Discipline | `Discipline` | ✓ *(new in `54fe6dd`)* | ✓ | **partial — 4 of 11 fields** | ✓ | ✓ | Rodeo Coverage | **§8** |
| Hub / Event / Edition / Venue / Competitor | own tables | ✓ | ✓ | ✓ | ✓ + dependency transfer | ✓ | Rodeo Coverage / Venues / Competitors | strong after `54fe6dd` |
| **Article Type** | **none** | ✗ | ✗ | ✗ | ✗ | ✗ | **none** | **P1 gap** |
| **Subcategory** | **none** | ✗ | ✗ | ✗ | ✗ | ✗ | **none** | **P1 gap** |
| Section config | `SectionConfig` | — | ✓ | ✓ | — | — | Settings | exists, but editor ignores it |

**Measured consequence of the missing vocabularies (read-only query, development DB):**
`articleType` has **3 distinct values** in use out of 18 offered; `subcategory` already has
**11 distinct free-text values**. Nothing prevents "Ticketing", "ticketing" and "Ticket" from
coexisting, and nothing lets an editor list or correct them.

---

## 6. Media upload architecture and failure diagnosis

### Pipeline, as built
```
Browser  →  POST /api/admin/media/upload
            ├ requireUser + media.upload permission        (route.ts:21-23)
            ├ durable rate limit, fails closed             (route.ts:36-42)
            ├ validateUpload: magic-byte sniff (jpeg/png/webp), ≤ 15 MB
            │                 MEDIA_MAX_BYTES override     (validation.ts:21)
            ├ processImage: orientation-corrected WebP thumb/md/lg (sharp)
            ├ storage.put(original) + put(each derivative)  ← FAILS HERE
            ├ prisma.mediaAsset.create + auditLog (one transaction)
            └ delivery: GET /api/media/[...key] — visibility-gated proxy,
              404 unless PUBLIC+READY or caller holds media.view
```

### What is proven healthy
- **R2 itself.** `scripts/r2-verify.mts`, run earlier in this session against the
  credentials in the local `.env`: **7 of 7 passed** — HeadBucket, PutObject, GetObject with
  SHA-256 match, HeadObject, DeleteObject, and absence after delete. Bucket `nfr`, endpoint
  origin `71ee0d….r2.cloudflarestorage.com`, region `auto`. So those credentials carry
  **write** permission and the bucket exists.
- **The adapter.** `S3StorageAdapter` normalises the endpoint to its origin (so a mistakenly
  appended bucket path cannot double-sign), addresses the bucket separately, and loads the
  AWS SDK through a runtime specifier. `@aws-sdk/client-s3` is a **production** dependency
  (`dev=false` in the lockfile), so it is installed by `npm ci` on Render.
- **Delivery is correctly gated** — drafts and private originals 404 for anonymous callers.
- **Render has the configuration.** The production env guard (`lib/env.ts`) refuses to boot
  when provider is `r2` and any of bucket / key id / secret / endpoint is missing. The
  service booted and logged `storage: cloud`, so **all four are set**.

### The defect that prevents diagnosis
`lib/cms/mediaService.ts` had **three** bare `catch` blocks that discarded the underlying
error, so an `AccessDenied`, an `InvalidAccessKeyId`, a `NoSuchBucket` and a wrong endpoint
were indistinguishable — the browser said "Upload failed while saving the file." and the
server logged **nothing**. Commit **`c03e233`** adds `report()` to all three. **It is in
`main` but is NOT the deployed commit** (Render last built `abc0da5`).

### Most probable cause, and what is still unverified
Because the local credentials work and Render's variables are present but produce a failure,
the values on Render most likely **differ** from the working ones. The highest-probability
candidate is an R2 API token scoped **Object Read only** rather than **Object Read & Write** —
consistent with the credential rotation recommended before deployment. Alternatives: a
different bucket name, or an endpoint that includes a path segment.

**I could not verify this.** I have no Render or Cloudflare access, and I did not upload any
test object to production storage. Deploying `c03e233` (or later) and retrying one upload
will put the exact cause in the Render log.

### Configuration checklist (values redacted)
| Variable | Required when provider is `r2` | Expected shape |
|---|---|---|
| `MEDIA_STORAGE_PROVIDER` | yes | `r2` (must not be `local` — Render's filesystem is ephemeral) |
| `MEDIA_S3_BUCKET` | yes | bucket name only |
| `MEDIA_S3_ENDPOINT` | yes | `https://<account-id>.r2.cloudflarestorage.com` — **origin only, no bucket path** |
| `MEDIA_S3_REGION` | defaults `auto` | `auto` |
| `MEDIA_S3_ACCESS_KEY_ID` / `MEDIA_S3_SECRET_ACCESS_KEY` | yes | token with **Object Read & Write** |
| `MEDIA_S3_PUBLIC_BASE_URL` | no | leave unset; delivery is proxied and the bucket stays private |
| `MEDIA_MAX_BYTES` | no | defaults to 15 MB |

**Redeployment persistence:** satisfied only because provider is `r2`. With `local`, every
upload would vanish on each redeploy, restart and 15-minute idle spin-down.

---

## 7. Visual Builder deployed-preview diagnosis — root cause confirmed

**The canvas iframe is same-origin and relative.** `views/admin/BuilderCanvas.tsx:110`:
```js
const src = `/admin/website/preview?pageKey=${…}&embed=1&t=${refreshToken}`;
```
No absolute URL, no `localhost`. The iframe is not the problem.

**The redirect it receives is the problem.** `app/admin/(dashboard)/website/preview/route.ts`:
```js
58  if (embed) {
59    (await draftMode()).enable();
60    const dest = new URL(targetUrl, req.url);     // ← base is the request URL
…
66    const res = NextResponse.redirect(dest);      // ← absolute Location header
```
`NextResponse.redirect` requires an absolute URL, and here it is resolved against `req.url`.
Behind Render's proxy the application is bound to the container's internal address — the
deploy log shows `Local: http://localhost:10000` — so the `Location` header sent to the
browser can be `http://localhost:10000/…`. The browser then tries to reach *its own*
localhost and reports **`localhost refused to connect`**. The `embed=1` branch is exactly
the path the canvas uses, and it is the only place in the preview flow that emits an
absolute URL.

The same pattern appears at **line 18** (`new URL('/admin/website/', req.url)` for the
`?exit=1` path), so "Exit draft preview" is likely broken in production for the same reason.

Note the standalone (non-embed) preview at line 100 uses a **relative** iframe `src`, which
is why that path does not show the fault — a useful discriminator when testing a fix.

**Proposed remediation (not implemented):** keep the redirect same-origin by deriving the
base from the forwarded request headers (`x-forwarded-proto` / `x-forwarded-host`, falling
back to `host`), or return a 307 whose `Location` is the **relative** path. Either keeps the
canvas on the deployment's own origin, requires no new route, and leaves draft isolation
untouched. No migration, no owner decision.

**Security review of the surrounding mechanism — no defects found.** The canvas bridge
(`components/builder/BuilderCanvasBridge.tsx`) validates `event.origin` against
`window.location.origin` explicitly, treats message payloads as untrusted even though the
frame is same-origin, and posts with an explicit target origin — never `'*'`. CSP keeps
`frame-ancestors` and `frame-src` at `'self'`. Draft preview requires `system.config` and
re-checks the permission inside the page.

---

## 8. Seven-Discipline landing-page assessment

All seven exist and return HTTP 200 locally: `bareback-riding`, `steer-wrestling`,
`team-roping`, `saddle-bronc-riding`, `tie-down-roping`, `barrel-racing`, `bull-riding`.

**Model fields vs. editable fields.** `Discipline` carries `slug, name, shortName, category,
tagline, summary, image, imageCredit, guide (Json), sortOrder, archivedAt`.
`updateDiscipline` (`lib/cms/rodeoService.ts:306-318`) accepts **four**: `shortName`,
`category`, `tagline`, `summary`. `createDiscipline` accepts five (adds `name`).

| Capability | Managed in Admin? | Where |
|---|---|---|
| Name | **create only** — not editable afterwards | Rodeo Coverage |
| Slug | **✗ never settable** | — |
| **Hero image** | **✗** | — *(seed only)* |
| **Hero credit** | **✗** | — *(seed only)* |
| Hero ALT / caption | **✗ no field on the model** | — |
| Editorial introduction | ✓ | Landing SEO (`EntitySeo.intro`) |
| **Rules** (`guide.rulesHighlights`) | **✗** | — *(seed only)* |
| **Scoring** (`guide.scoringBreakdown`) | **✗** | — *(seed only)* |
| Related events / articles / competitors | ✓ (from the related entity) | Rodeo Coverage, Article editor |
| FAQ | ✓ | Landing SEO |
| SEO title / description / canonical / social image / noindex | ✓ | Landing SEO |
| Archive / reactivate | ✓ *(new in `54fe6dd`)* | Rodeo Coverage |
| Sort order | ✗ | — |

**Read-only evidence from the development database** — every one of the seven has
`image=YES`, `imageCredit=YES`, 2–3 `rulesHighlights` and 2 `scoringBreakdown` entries. All
of it was written by `prisma/seed.ts`; a grep across `lib/cms/*` confirms **no admin action
writes `image`, `imageCredit` or `guide`**. The content is live on the public pages and the
administrator cannot change a word of it.

**Template assessment.** The public page already uses one shared, authoritative template
(`views/DisciplineGuideView.tsx` + `lib/mappers.ts`) driven by structured CMS records — not
seven hardcoded pages. So the recommendation is *not* to build a template; it is to **add
the missing editing surface** for fields the template already renders. Because
`image`, `imageCredit` and `guide` already exist on the model, **this requires no database
migration** — only an extended input schema, service write path, admin form (with a Media
Library picker for the hero) and tests. Hero ALT/caption would be the only additions that
need a migration, and only if the owner wants them separate from `imageCredit`.

---

## 9. Hardcoded / mock / fixture inventory

| Item | Location | Status |
|---|---|---|
| 18 Article Types | `AdminArticleEditorShell.tsx:26-45` | **hardcoded, no DB** |
| Primary Sections | `AdminArticleEditorShell.tsx:47` | **hardcoded**, duplicates `SectionConfig` |
| Discipline hero images, credits, rules, scoring | `prisma/seed.ts` | **seed-only**, no admin writer |
| Discipline `category` options | `AdminLandingSeoPage.tsx:173` | hardcoded `Roughstock` / `Timed Event` (also enforced by Zod — consistent) |
| `data/mockEditorialData.ts` | `data/` | **present but imported by no `app/`, `lib/`, `views/` or `components/` file** — dead code, not serving the site |
| Affiliate banner fallback text | `components/editorial/DisclosureBanner.tsx` | hardcoded commercial claim — open owner decision (OD-4) |
| Publisher identity in JSON-LD | `lib/seo.tsx` | hardcoded `Organization` name, no logo — open owner decision (OD-5) |
| Legal page bodies | `config/legalPages.ts` | intentional fallback; DB override exists via Info Pages |
| Fixture records | `prisma/fixtures.ts` | excluded from public reads when `APP_ENV=production` |

---

## 10. Admin capability matrix

| Module | Create | Read | Update | Delete | Archive | Notes |
|---|---|---|---|---|---|---|
| Articles | ✓ | ✓ | ✓ | workflow | ✓ | full workflow, revisions, SEO panel |
| Rodeo Coverage | ✓ | ✓ | ✓ | ✓ + dependency transfer | ✓ | much stronger after `54fe6dd` |
| Venues / Competitors | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Competition Coverage | ✓ | ✓ | ✓ | ✓ | — | sessions, results, standings |
| Editorial Organization | ✓ | ✓ | partial | ✓ | — | **Tag has no update** |
| Info Pages | ✓ | ✓ | ✓ (draft only) | unpublish | — | published page not editable in place (D-09/S-1, open) |
| Landing SEO & FAQ | — | ✓ | ✓ | ✓ (FAQ) | — | entity SEO + FAQ + 4 discipline fields |
| Media Library | ✓ *(failing in production)* | ✓ | ✓ metadata | ✓ | — | **MED-01** |
| Website & Navigation / Page Builder | ✓ | ✓ | ✓ | ✓ | — | **canvas broken in production (BLD-01)** |
| SEO Intelligence | — | ✓ | ✓ | — | — | audits, findings |
| Comments / Readers / Team / Sources / Settings / Analytics / Monetization | ✓ | ✓ | ✓ | ✓ | — | |
| **Article Types** | — | — | — | — | — | **module does not exist** |
| **Subcategories** | — | — | — | — | — | **module does not exist** |

---

## 11. Public website integration findings

- All five sections, both directories, all seven discipline pages, article pages, legal
  pages, `robots.txt` and `/sitemap.xml` return **200** locally (14/14 routes checked on the
  running dev server; no server-side errors logged).
- Public pages read authoritative CMS records; the Builder stores **references** (`featuredIds`),
  not copies of entity content, so the non-duplication rule holds.
- `Discipline.guide` is rendered publicly but has no editing surface (§8).
- `ArticleSeo.robots` is honoured by both page metadata and sitemap membership, yet nothing
  writes it — an editor cannot noindex a single article through the CMS.

---

## 12. Security and permission findings

No new vulnerability found. Verified in this audit:

- Media delivery is visibility-gated: non-`PUBLIC`/non-`READY` assets 404 unless the caller
  holds `media.view`; unknown keys and non-derivative keys 404.
- Upload requires authentication plus `media.upload`, is rate-limited, fails closed when the
  limiter is degraded, and sniffs **magic bytes** rather than trusting the declared MIME type.
- Builder messaging validates origin explicitly and never posts to `'*'`.
- Rodeo admin actions all require `rodeo.manage`; reader administration is scoped so staff
  accounts cannot be manipulated through the reader module.
- Storage keys pass `assertSafeKey`, and the local adapter additionally refuses any resolved
  path that escapes its root.

Standing limitations carried forward (unchanged by this audit): CSP is **report-only** with
inline script permitted; the Privacy Policy still contradicts the live reader-account feature
(OD-2). Neither is a regression.

---

## 13. SEO and structured-data findings

- One owner per concern holds: SEO Intelligence owns metadata, the Builder owns presentation,
  the structured CMS owns facts.
- Sitemap excludes `noindex` pages; no contradiction found.
- `articleType` (hardcoded, free-text in the database) drives the `NewsArticle` vs `Article`
  JSON-LD decision. A typo written directly to the column would silently change structured
  data — an argument for making it a controlled vocabulary.
- Publisher identity remains hardcoded and unverified (OD-5); no sitewide `Organization`/
  `WebSite` markup.

---

## 14. Issue register

| ID | Sev | Module | Expected | Actual | Evidence | Root cause | Files | Remediation | Migration? | Owner approval? | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **MED-01** | **P0** | Media Library | Editor uploads an image in production | "Upload failed while saving the file."; nothing in logs | R2 round-trip 7/7 locally; Render boots with `storage: cloud` | **unconfirmed** — most likely Render R2 token lacking write scope | `lib/cms/mediaService.ts`, `lib/media/storage/s3.ts` | Deploy `c03e233`, retry once, read the logged cause; then correct the token/bucket/endpoint | No | No (unless credentials must be reissued) | existing media suites |
| **BLD-01** | **P0** | Page Builder | Canvas renders the draft page | `localhost refused to connect` | `preview/route.ts:60`; Render binds `localhost:10000` | **confirmed** — absolute redirect built from `req.url` | `app/admin/(dashboard)/website/preview/route.ts` (lines 18, 60-66) | Derive base from forwarded headers, or redirect relatively | No | No | new route test + e2e |
| **DB-01** | **P0** | Deployment | Cloud DB matches code | 2 migrations from `54fe6dd` unapplied | `migrate status` not run against cloud in this audit; migrations dated 2026-11-12 are newer than the deploy | process | `prisma/migrations/*` | `prisma migrate deploy` against the cloud DB **before** deploying `54fe6dd` | Applies existing | **Yes** — touches real data | migration replay |
| **TAX-01** | **P1** | Article Types | Admin manages the 18 typologies | Hardcoded array; no table | `AdminArticleEditorShell.tsx:26-45`; `Article.articleType String` | by design, never built | editor, schema | Either a controlled `ArticleType` table + module, or keep in code and remove the expectation | **Yes if DB-backed** | **Yes** | service + editor tests |
| **TAX-02** | **P1** | Subcategory | Managed vocabulary | Free-text input; 11 distinct values already | `:1156-1169`; read-only DB query | by design, never built | editor, schema | Promote to a taxonomy, or scope it under Category | **Yes if DB-backed** | **Yes** | as above |
| **DISC-01** | **P1** | Disciplines | Hero image + credit editable | Seed-only | `rodeoService.ts:306-318`; no writer for `image` | missing input schema + form | `rodeoService.ts`, `AdminRodeoCoveragePage.tsx` / Landing SEO | Extend input, add Media-Library picker | **No** | No | service + form tests |
| **DISC-02** | **P1** | Disciplines | Rules + scoring editable | `guide` JSON seed-only | mapper reads `rulesHighlights`, `scoringBreakdown`; no writer | missing editor | same | Structured list editor writing `guide` | **No** | No | service tests |
| **SEO-01** | **P1** | Article SEO | Editor can noindex one article | `ArticleSeo.robots` has no writer | consumed by `articleMeta` + `sitemapEntries` | capability built read-side only | `articleService.ts` | Add a gated control (policy question) | No | **Yes** (publication policy) | metadata + sitemap tests |
| **TAX-03** | **P2** | Editorial Organization | Rename a tag | No update path | `taxonomyService.ts` | omission | `taxonomyService.ts` | Add `updateTag` | No | No | service test |
| **SEC-02** | **P2** | Article editor | Section list matches `SectionConfig` | Hardcoded `PRIMARY_SECTIONS` | `:47` vs `sectionConfigService` | duplicated source | editor | Read from `SectionConfig` | No | No | editor test |
| **DISC-03** | **P2** | Disciplines | Rename / reorder / set slug | `name` create-only; `slug`, `sortOrder` never settable | `rodeoService.ts:306-318` | omission | same | Extend input; slug changes need the redirect machinery already added in `54fe6dd` | No | No | slug/redirect tests |
| **OPS-01** | **P2** | Deployment | Production runs current code | Render on `abc0da5`, repo at `54fe6dd` | deploy log | process | — | Migrate cloud DB, then deploy | — | **Yes** | — |
| **CLN-01** | **P3** | Repo hygiene | No dead mock data | `data/mockEditorialData.ts` unused by the app | import grep returns nothing | leftover | `data/` | Remove or document | No | No | — |
| **CLN-02** | **P3** | Build | No deprecation warnings | `middleware` convention deprecated in Next 16.4 | build log | framework | `middleware.ts` | Migrate to `proxy` when convenient — it carries `STAGING_NOINDEX` | No | No | header test |

---

## 15. Database migration requirements

| Change | Migration needed? |
|---|---|
| Discipline hero image, credit, rules, scoring editing (DISC-01/02) | **No** — columns exist |
| Discipline rename / slug / sort order (DISC-03) | **No** |
| Builder preview fix (BLD-01) | **No** |
| Media upload fix (MED-01) | **No** |
| Tag rename (TAX-03) | **No** |
| Section source unification (SEC-02) | **No** |
| `ArticleType` as a managed taxonomy (TAX-01) | **Yes** — new table + FK, backfill from existing free-text values |
| `Subcategory` as a managed taxonomy (TAX-02) | **Yes** — new table + FK, backfill 11 existing values |
| Discipline hero ALT / caption as distinct fields | **Yes** — only if the owner wants them separate from `imageCredit` |
| Apply the two `54fe6dd` migrations to the cloud DB (DB-01) | **Existing migrations**, owner-executed |

Eight of the twelve actionable findings need **no schema change at all**.

---

## 16. Environment configuration requirements

Correct as deployed: `NODE_VERSION`, `NODE_ENV`, `APP_ENV`, `LOG_LEVEL`, `STAGING_NOINDEX`,
`NEXT_PUBLIC_SITE_URL`, `MEDIA_STORAGE_PROVIDER=r2`, `DATABASE_URL` (cloud).

Needing attention:

| Variable | Issue |
|---|---|
| `MEDIA_S3_ACCESS_KEY_ID` / `MEDIA_S3_SECRET_ACCESS_KEY` | **Prime suspect for MED-01** — confirm the token carries **Object Read & Write** on the correct bucket |
| `MEDIA_S3_ENDPOINT` | must be the account origin only, no bucket path |
| `MEDIA_S3_BUCKET` | must match the bucket the token is scoped to |
| `INTERNAL_REVALIDATE_SECRET` | declared in `render.yaml`; confirm it is actually set, or scheduled publishes will never refresh public pages |
| `DATABASE_URL` | `connection_limit` now defaults safely in code; an explicit value still wins |

---

## 17. Recommended remediation sequence

1. **BLD-01** — Builder preview redirect. Small, no migration, no approval; restores the
   Page Builder in production.
2. **Deploy `54fe6dd`+** — but only **after** applying its two migrations to the cloud
   database (DB-01, owner-executed). This also ships the media logging from `c03e233`.
3. **MED-01** — retry one upload, read the now-logged cause, correct the R2 token or binding.
4. **DISC-01 / DISC-02** — hero image, credit, rules and scoring editing. No migration;
   directly answers the owner's complaint.
5. **SEC-02, TAX-03, DISC-03** — small correctness and completeness fixes.
6. **TAX-01 / TAX-02** — Article Type and Subcategory vocabularies, once the owner chooses a
   model (§19). These need migrations and a backfill.
7. **SEO-01** — per-article noindex, once the publication policy is set.

---

## 18. Verification performed, and limitations

**Performed:** git state and migration inventory; read-only `prisma migrate status` on the
development and test databases; read-only content queries against the development database
(discipline fields, distinct `articleType`/`subcategory` values, media asset count);
`tsc --noEmit`; the full Vitest suite (**2,687 passed, 124 files, 0 failed**) on Node 22.23.4;
14 read-only HTTP checks against the local development server; and source tracing of the
editor, taxonomy services, rodeo services, media pipeline, preview route and builder bridge.

**Not performed, and therefore not claimed:**
- No read or write of Render's environment variables, logs or dashboard — no access.
- No Cloudflare R2 console inspection, and **no test object uploaded to production storage**.
  The 7/7 R2 round-trip cited in §6 used the credentials in the local `.env` and ran earlier
  in this session; it does **not** prove Render's values are the same.
- No connection to the cloud database during this audit, so its migration state is inferred
  from commit dates, not measured.
- Production behaviour of BLD-01 was not reproduced against the live site; the root cause is
  established from source plus the deploy log's binding address.
- No browser-based admin walkthrough of all 21 modules; the capability matrix is derived from
  server actions, services and view source.

---

## 19. Owner decisions needed

1. **Article Type** — a managed `ArticleType` table (migration + backfill + module), or keep
   the 18 values in code and accept that changes need a deploy?
2. **Subcategory** — promote to a taxonomy, scope it under Category, or remove the field?
3. **Discipline hero ALT / caption** — separate fields (migration), or continue using
   `imageCredit` plus the existing alt text?
4. **Per-article noindex (SEO-01)** — who may deindex an article, and under what policy?
5. **Cloud database migration (DB-01)** — authorise `prisma migrate deploy` against the real
   database for the two `54fe6dd` migrations.
6. **R2 credentials** — reissue a write-scoped token if MED-01's logged cause turns out to be
   permission-related.
7. Still open from earlier work: OD-2 (privacy wording), OD-3 (D-09/S-1 InfoPage schema),
   OD-4 (affiliate wording), OD-5 (publisher identity).

---

## 20. Final repository state

Unchanged except for this report.

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd` — identical to `origin/main` |
| Commits created | **none** · pushed: **none** |
| Application code | **unmodified** · Prisma schema **unmodified** · migrations **none created or applied** |
| Databases | development and test **read only**; cloud and production **not contacted** |
| Deployment config | **unmodified** · secrets **untouched and not printed** |
| New file | `docs/NFRGUIDE_PRODUCTION_EDITORIAL_READINESS_AUDIT.md` (this report) |

**No problem described above has been fixed.** This is an audit; implementation awaits the
owner's instruction.
