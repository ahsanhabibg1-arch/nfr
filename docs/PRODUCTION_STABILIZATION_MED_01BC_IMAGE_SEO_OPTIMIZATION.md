# MED-01B + MED-01C — Image SEO Metadata, Editorial Rendering & Responsive Delivery

**Status: COMPLETE for MED-01B and MED-01C as scoped, with ONE requirement deliberately left
incomplete and named in §3.4 (the `description` column).**

**Date:** 2026-11-13 · **Branch:** `main` · **Baseline:** `d4f3159c490f52c3d05e2a3c12c54800708d61e4`

No commit, no push, no deploy, no migration, **no Prisma schema change**. No production
database, R2 object or environment variable was touched. MED-01A's upload repair is intact and
re-verified.

---

## 1. Executive summary

Both headline defects from the Step 03 audit are closed, and both were the same shape — **the
data was already right and the HTML was wrong**:

1. **Editorial ALT text and captions never reached the article page.** `ArticleHeader` passed
   `alt={article.title}` and a synthesised `caption={`Editorial Dispatch: ${title}`}`, so an
   editor's work was discarded on the one page that matters most — while the homepage used it
   correctly and the SEO engine reported it as present. Proven fixed in the **prerendered
   production HTML**:

   ```
   alt="Professional rodeo bull rider exploding from chute under night floodlights at Las Vegas championship."
   ```

   The generated caption now appears on **0** article pages.

2. **Three WebP derivatives were generated on every upload and never served.** The public site
   sent the original to every device. `srcset` is now built on the server from the stored
   derivative keys and reaches the hero and every card.

Two further things worth stating plainly:

- **No schema migration was needed, and none was made.** Decorative images — the one capability
  that looked like it needed a column — turned out to be expressible already: `null` means
  "unset", `''` means "deliberately empty". All that was required was to stop the save path
  rewriting one into the other. That keeps this entire stage migration-free, so deploy ordering
  does not matter.
- **An existing test corrected my design mid-implementation.** I had made an empty ALT mean
  "decorative" at every level. `tests/seo-intel.test.ts` failed, and it was right to: the
  article save path collapses `''` to `null`, so an empty article field is emptiness, not a
  decision. Decorative is now expressible only where the empty string actually survives — the
  asset and the per-usage override (§7).

**Verification:** tsc exit 0 · **129 files / 2,896 tests passed** · `next build` exit 0 ·
assertions made against rendered HTML and the built output, not field values.

---

## 2. Baseline architecture (audited before changing anything)

```
Upload ─▶ validateUpload ─▶ processImage (thumb 320 / md 768 / lg 1600 WebP)
       ─▶ storage.put ×4  ─▶ MediaAsset row { derivatives: {thumb,md,lg}, altText, caption, … }
                                   │
Editorial selection ──────────────┤  Article.heroImageUrl  (a mirrored STRING)
                                   └─ ArticleMedia { usageKey:'hero', altText?, caption? }
                                                                    ▲ columns existed, nothing wrote them
Public rendering  ◀── toArticle ──┘
       ImageWithCredit  (the ONE shared public image component, 12 call sites)
Delivery          ◀── /api/media/[...key]  (private bucket, visibility-gated proxy)
SEO Intelligence  ◀── analyzers.ts  (6 image checks, already shipping)
```

What the audit found already in place — and therefore not rebuilt: a 33-column `MediaAsset`
covering 17 of the 18 requested metadata concepts, a nine-field metadata editor with partial
merge, the rights-confirmation publish gate, SHA-256 deduplication, reference-safe delete, the
gated delivery proxy, and six image checks in the SEO engine. **The gaps were at the two ends
of the pipe, not in the middle.**

Three facts shaped every decision below:

| Fact | Consequence |
|---|---|
| `ImageWithCredit` is the single shared public image component | one change covers all 12 call sites |
| `EditorialArticleGrid`, `RelatedArticles` and `HomeArticleFeed` all take `Article[]` — the same type `toArticle` produces | plumbing the DAM record into `toArticle` gives the hero **and** every card responsive sources, with no per-component query |
| `lib/mappers.ts` has one `articleInclude` used by every public read | one join, not many |

---

## 3. MED-01B — image SEO metadata

### 3.1 The metadata matrix, re-verified

| Field | State after this stage |
|---|---|
| Image title | working (`title`) |
| **ALT text** | **working end to end** — precedence resolved server-side, rendered, analysed (§7, §8) |
| **Caption** | **working end to end** — editor's caption rendered; no caption invented |
| **Description** | **NOT IMPLEMENTED — see §3.4** |
| Credit | working (`credit`/`copyrightHolder`, rendered by `ImageWithCredit`) |
| Source | working (`sourceAttribution`, `licenseSourceUrl`) |
| License | working (`licenseType`, `usageRestrictions`) |
| Rights confirmation | **unchanged** — publish gate intact, asserted by tests |
| Original filename | working (`filename`, `safeFilename`) |
| Dimensions | working, and **now emitted as `width`/`height` attributes** |
| File type | working (`mimeType` from magic bytes, `format`, `extension`) |
| File size | working (`bytes`) |
| Upload date | working (`uploadedAt`) |
| Uploaded by | working (`uploadedById`, filterable) |
| Usage references | working (7 join tables, `usageCount`, used/unused filter) |

### 3.2 Decorative images — no column required

`null` and `''` were always two distinct states in the database; the save path was collapsing
them (`val === '' ? null : val`). For ALT text that difference is load-bearing:

| Stored | Meaning | Effect |
|---|---|---|
| `null` | nobody has written ALT text | `IMG_NO_ALT`, headline stands in |
| `''` | an editor says **decorative** | `alt=""`, correct markup, **no finding** |

`updateMediaMetadata` now preserves an empty `altText` — and **only** `altText`; every other
field keeps its "empty clears it" behaviour. `altText` also became nullable in the input schema
so an editor can clear it back to *unset*, which is a third state the UI needs. The Media
Library gained one checkbox, **Decorative image — intentionally empty ALT**, which is the only
way to set it deliberately.

### 3.3 Per-usage overrides

`ArticleMedia.altText` / `caption` existed and nothing read them. The **read** path is now
implemented and is the top of the precedence chain (§7).

**On the write path, a deliberate decision rather than a mechanical one.** `articleService`
already writes `ArticleMedia.altText` for **inline** body images from the rich-block editor's
own `alt` field. For the **hero** it does not — and should not: an article has exactly one
hero, so `Article.imageAltText` *is* its per-article override, it already has an editor UI and
a save path, and writing the same value into the join row too would create a second source of
truth that can silently drift. The column is honoured when present (so an inline image, or a
future per-usage editor, works) without duplicating the hero's value. The Media Library already
tells editors this: *"Asset-level metadata is reusable. Article-specific ALT text is edited on
the article itself and is not overwritten by these values."*

Requirements 4.4 and 4.5 are satisfied by construction and asserted: a usage override is a row
on the join table, so it cannot touch `MediaAsset.altText`, and reusing the asset in another
article reads its own row.

### 3.4 Incomplete, and why: `MediaAsset.description`

**This is the one required field not implemented.** It is the only one of the eighteen with no
storage, so it needs a migration — and the evaluation the brief asked for is what stopped me:

`listMedia` uses Prisma `include`, so the generated SQL names every column of `MediaAsset`.
**Deploying code that expects `description` before the migration runs makes every media query
fail — the entire Media Library goes down, not just one field.** Render's build command does
not run migrations (`npm ci && prisma generate && npm run build`), so the ordering would be
manual and unforgiving.

That is a hard deploy-order dependency in exchange for the lowest-value field in the table (an
*internal* description, where `caption`, `usageRestrictions` and `sourceAttribution` already
exist). Nothing else in this stage needs DDL, so adding it would also make an otherwise
migration-free release migration-gated.

**Recommended instead:** bundle it into the next approved migration window as a standalone
additive change — `ALTER TABLE "MediaAsset" ADD COLUMN "description" TEXT` plus one input in the
existing field loop and one entry in the metadata schema. It is perhaps twenty lines once the
column exists. **Not claimed as done.**

---

## 4. MED-01C — responsive image architecture

### 4.1 One approach, chosen deliberately

**Stored derivatives advertised through `srcset`/`sizes` on the existing `<img>` — not
`next/image`.** The reasons are specific to this architecture:

- The derivatives **already exist**: `thumb` 320 / `md` 768 / `lg` 1600 WebP, generated on every
  upload since Batch 05, EXIF-stripped and orientation-corrected. The work is done; it was
  simply never advertised.
- `next/image` would add a **second** optimisation system in front of the first — a per-request
  transformation layer over images that are already transformed, which the brief explicitly
  warns against ("Do not generate uncontrolled image transformations on every request"), and
  which on a 0.1-CPU free instance is a poor trade.
- The bucket **stays private**. Every candidate URL goes through the same gated
  `/api/media/<key>` proxy the original uses, so a DRAFT asset's derivatives are no more
  reachable than its original. Asserted by test.
- `next/image` would also need its loader pointed at that gated proxy, re-deriving the same
  keys — complexity with no gain.

### 4.2 How the keys reach the browser safely

`srcset` is built **from the stored `derivatives` map**, never guessed from the original's
filename. That distinction matters: a convention-derived URL
(`…/<id>.jpg` → `…/<id>__md.webp`) would 404 for every legacy asset that has no derivatives,
turning a working image into a broken one. `buildResponsiveSources` returns nothing at all
unless it finds real keys with real widths.

**The original is a candidate only within 2× the largest derivative.** Both ends of that rule
are deliberate:

- a 600px upload produces only a `thumb`, so without the original the browser would pick 320px
  for a full-width hero — worse than no `srcset`;
- an 8000px original would otherwise be chosen on a high-density screen and downloaded in full.

Above the cap, `lg` (1600px) is the ceiling and a 2× display upscales it slightly — invisible on
a 16/9 editorial photograph.

### 4.3 Loading priority

| Image | Before | After |
|---|---|---|
| Article hero | eager by default, no priority signal | `loading="eager"`, `fetchpriority="high"`, `decoding="sync"` |
| Homepage lead | same | same |
| Cards, related, thumbnails | **eager** — competing with the hero | `loading="lazy"`, `decoding="async"`, no priority |
| Homepage secondary (144px) | full-size original | smallest derivative, `sizes="144px"`, lazy |

The `priority` prop **existed on `ImageWithCredit` and was never destructured** — declared,
documented, and doing nothing. It is now wired.

Measured in the built output: **11 of 11 prerendered article pages carry exactly one eager
hero**, and **0** lazy images carry `fetchpriority`.

A bonus found while testing: React 19 automatically hoists
`<link rel="preload" as="image" imageSrcSet=… fetchPriority="high">` for the priority image, so
the hero also gets a preload hint without any extra code.

### 4.4 CLS, stated accurately

`width`/`height` are now emitted. This is **not** a CLS fix — `ImageWithCredit` already wrapped
every image in a fixed `aspect-[16/9]`/`[16/10]` box, so layout never shifted. Reporting it as a
CLS win would be false; the value is correct intrinsic sizing for the browser's candidate
selection.

---

## 5. Files modified

| File | Change |
|---|---|
| `apps/web/lib/media/imageMeta.ts` | **new** — `effectiveAlt`, `effectiveCaption`, `buildResponsiveSources`, `IMAGE_SIZES`. Pure, no Prisma, no `server-only` |
| `apps/web/lib/mappers.ts` | `articleInclude` joins the hero `ArticleMedia` + asset; `heroImageMeta()` resolves ALT/caption/srcset once, server-side (+102) |
| `apps/web/types/index.ts` | seven resolved hero fields on `Article` |
| `apps/web/components/ImageWithCredit.tsx` | `srcSet`/`sizes`/`width`/`height`; `priority` wired to `loading`/`fetchPriority`/`decoding`; empty `alt` documented as meaningful |
| `apps/web/components/editorial/ArticleHeader.tsx` | **the defect** — editorial ALT + caption, hero priority, srcset |
| `apps/web/components/editorial/EditorialArticleGrid.tsx` | editorial ALT, card sizes, lazy |
| `apps/web/components/editorial/RelatedArticles.tsx` | editorial ALT, card sizes, lazy |
| `apps/web/components/sections/HomeArticleFeed.tsx` | `??` instead of `||` (so `''` survives), card sizes |
| `apps/web/components/sections/EditorialHero.tsx` | resolved ALT, lead srcset, explicit priority; 144px thumbnail now lazy + small derivative |
| `apps/web/lib/cms/mediaService.ts` | `altText` preserves `''` (decorative) and accepts `null` (clear) |
| `apps/web/lib/seo-intel/analyzers.ts` | `IMG_NO_ALT` evaluates the **effective** ALT via the shared resolver |
| `apps/web/views/admin/AdminMediaPage.tsx` | decorative checkbox; three-state ALT save |
| `apps/web/tests/med01bc-image-seo.test.ts` | **new** — 56 tests |

Total: 11 modified, 2 new, +360/−17 in the modified set.

---

## 6. Database changes

**None.** `prisma/schema.prisma` is byte-identical; no migration was created or applied. The
only field that would have needed one is deferred in §3.4.

---

## 7. Metadata precedence rules

```
ALT text:   per-usage override  →  article-level  →  media default  →  headline (flagged)
Caption:    per-usage override  →  article-level  →  media default  →  none (never invented)
```

| State | ALT levels that can express it |
|---|---|
| descriptive text | all three |
| **decorative (`''`)** | **media default, per-usage** — the save path preserves an empty string there |
| unset (`null`) | all three |

**The article level cannot express decorative**, because `saveArticle` stores
`v.imageAltText || null`. So `lib/mappers.ts` and `lib/seo-intel/analyzers.ts` pass
`article: row.imageAltText || null`, letting an empty article field fall through to the media
default rather than silencing the chain. This is the correction `tests/seo-intel.test.ts`
forced, and it is pinned by a test of its own.

**The fallback is never silent.** When nothing is set, the headline is used so a screen-reader
user hears something — an empty `alt` on an informative hero would be worse — and
`heroImageAltSource === 'fallback'` is what makes `IMG_NO_ALT` fire. No text is fabricated and
no keywords are stuffed; the fallback is the article's own title.

---

## 8. Image rendering architecture

Resolution happens **once, on the server**, in `toArticle`. Components render what they are
given and derive nothing:

```
MediaAsset.derivatives ─┐
MediaAsset.altText      ├─▶ heroImageMeta()  ─▶  Article.heroImageAlt / heroImageCaption
Article.imageAltText    │    (lib/media/imageMeta.ts)   heroImageSrcSet / Width / Height
ArticleMedia.altText   ─┘                                        │
                                                                 ▼
                              ImageWithCredit ─▶ <img src srcset sizes width height
                                                      loading fetchpriority decoding alt>
SEO Intelligence ───▶ the SAME effectiveAlt()
```

That shared resolver is the structural fix. The original defect was possible only because two
implementations of one rule existed; now there is one, and the engine cannot report ALT text the
renderer is not using.

---

## 9. SEO Intelligence changes

| Check | Change |
|---|---|
| `IMG_NO_ALT` | **now evaluates effective ALT.** Fires when the resolution chain reaches the fallback. A **decorative** asset raises nothing — correct markup is not a defect. An empty *article* field still fires (§7) |
| `IMG_BROKEN_REF` | unchanged |
| `IMG_PRIVATE_ON_PUBLISHED` | unchanged |
| `IMG_RIGHTS_UNCONFIRMED` | unchanged |
| `IMG_NO_DIMENSIONS` | unchanged |
| `IMG_GENERIC_SEO_TITLE` | unchanged |

**No new findings were added**, deliberately. A "missing caption" or "missing description"
warning would fire on almost every image — captions are optional by design — and a panel that
always complains is a panel editors stop reading. The brief's own instruction to avoid noisy
warnings and fabricated scores is better served by making one existing check *true* than by
adding more.

Still not covered, and recorded rather than quietly skipped: image checks beyond the article
hero (rodeo hubs, events, editions, disciplines, venues, competitors, Builder blocks), inline
body images, and object-level reachability (`IMG_BROKEN_REF` checks referential integrity, not
whether the R2 object exists).

---

## 10. Security and rights safeguards

Each re-checked against the changed files:

| Safeguard | Status |
|---|---|
| Private R2 bucket; delivery only via the gated proxy | **unchanged** — every `srcset` candidate is an `/api/media/<key>` path; asserted, including that no bucket hostname appears |
| DRAFT/private visibility gate | **unchanged and newly tested** — a DRAFT asset returns **404** to an anonymous request, including via a derivative key |
| Object-key validation | **unchanged** — a key not belonging to the asset is refused; a traversal key is rejected before any lookup |
| Rights-confirmation publish gate | **unchanged** — `setVisibility`/`featuredImageRightsOk` untouched |
| RBAC on metadata editing | **unchanged** — asserted that a role without `media.edit` is refused |
| Upload validation, rate limiting, storage-failure cleanup | **untouched** |
| **MED-01A SDK repair** | **intact** — the literal specifier and its 34 tests still pass |
| Bucket made public as a shortcut | **never** — explicitly rejected in §4.1 |

---

## 11. Regression tests

`apps/web/tests/med01bc-image-seo.test.ts` — **56 tests**. Every claim about delivered HTML is
asserted against `renderToStaticMarkup` output; every claim about persistence against the
database.

| # | Requirement | Covered by |
|---|---|---|
| 1 | Default media ALT persistence | DB: save + reload |
| 2 | Per-article ALT overrides | DB: article-level and per-usage, both through `toArticle` |
| 3 | Explicit decorative empty ALT | helper, DB (`''` stored, not null), rendered `alt=""` |
| 4 | Caption persistence | DB: save/reload; empty clears |
| 5 | **Article hero ALT rendering** | rendered HTML, incl. end-to-end from a real DAM row |
| 6 | **Article hero caption rendering** | rendered HTML; the synthesised caption is gone |
| 7 | Metadata editing and reload | DB: partial merge never wipes neighbours; RBAC refusal |
| 8 | Responsive `srcset` and `sizes` | rendered HTML, hero and cards |
| 9 | Correct derivative selection | widths ascending, large original capped, modest original included, duplicates collapsed, all URLs gated |
| 10 | Missing derivative fallback | null/`{}`/malformed/non-object; single candidate → no srcset; legacy asset renders from `src` |
| 11 | Hero loading priority | `eager` + `fetchpriority="high"`; the `priority` prop proven wired |
| 12 | Below-the-fold lazy loading | cards lazy + async, no priority anywhere |
| 13 | Existing legacy media | DB: an article with no DAM link renders, no srcset, no break |
| 14 | Private media access controls | route: DRAFT → 404; forged key → 404; traversal → rejected |
| 15 | Published media delivery | route: 200, `image/jpeg`, `public` cache, `nosniff` |
| 16 | SEO Intelligence metadata evaluation | the engine and renderer agree on all four ALT states |
| 17 | Existing MED-01A upload behaviour | its 34 tests re-run green; delivery URL parity with the adapter pinned |
| 18 | No regression elsewhere | full suite; the homepage/grid components render and are asserted |

### Results

| Check | Result |
|---|---|
| TypeScript — `tsc --noEmit` | **exit 0** |
| New suite | **56 passed** |
| Full regression — `vitest run` | **129 files, 2,896 tests passed, 0 failed, 0 skipped** |
| Production build — `next build` | **exit 0**, `✓ Compiled successfully` |
| `git diff --check` | clean |

Baseline was 128 files / 2,839. The difference is the 56 new tests plus one added to
`seo-intel`-adjacent coverage.

### Three failures occurred. All three were mine, and two were valuable.

1. **`tests/seo-intel.test.ts` — a real design error.** I had made an empty ALT mean
   "decorative" at every level. The existing fixture publishes an article with
   `imageAltText: ''` and no media ALT and expects `IMG_NO_ALT`; my change silenced it.
   The existing test was right (§7), the implementation changed, and the rule is now pinned at
   both levels. **No assertion was weakened.**
2. **`tests/batchD.test.ts` — accessibility.** My decorative checkbox had no accessible name
   the static checker could see. Fixed with an explicit `aria-label`, which is better here
   anyway since the visible label is a long sentence.
3. **My own new assertions, written in lowercase.** `renderToStaticMarkup` emits camelCase
   (`srcSet=`, `fetchPriority=`). Worth recording because one of those assertions —
   `expect(html).not.toContain('srcset')` on the legacy-asset case — **was passing for the
   wrong reason** and would never have caught a regression. All HTML attribute assertions are
   now case-insensitive.

---

## 12. Performance assessment

| Aspect | Before | After |
|---|---|---|
| Bytes to a 360px phone for a hero | the **original** (multi-megapixel) | the 768px WebP `md` derivative |
| Homepage 144px thumbnail | the original | the 320px `thumb` |
| Candidate selection | none — one `src` | `srcset` + layout-accurate `sizes` |
| LCP signal | none; every image eager | one eager, high-priority hero (+ a React-hoisted preload) |
| Below-fold images | eager | lazy |
| Intrinsic sizing | absent | `width`/`height` present |
| CLS | already protected by the aspect-ratio wrapper | unchanged (§4.4) |
| Server cost per request | none | **none** — no new processing; keys come from the row already being read |

**Not measured.** No Lighthouse or field data was collected: the change is not deployed, and
the local dev articles use legacy `/assets/images/...` paths with no DAM record, so they
legitimately receive no `srcset`. The byte reduction is therefore reasoned from the derivative
widths, not observed. **Real numbers need production media and a deployed build.**

---

## 13. Backward compatibility

| Guarantee | How it holds |
|---|---|
| Existing media URLs stay valid | `url`/`storageKey` untouched; `srcset` is additive |
| Published images do not disappear | legacy assets get `src` and no `srcset` — tested in both the pure and DB cases |
| No R2 object deleted | nothing in this stage writes or deletes objects |
| Legacy assets without derivatives render | tested; also observed in the built output, where all 11 prerendered articles use legacy paths and render correctly |
| Missing metadata cannot crash a page | every new field is optional; `effectiveAlt` always returns a string |
| Reused assets keep their relationships | join rows untouched; a per-usage override provably does not alter the media default |
| Draft media stays protected | the gate is unchanged and now has tests |
| No mass re-upload or regeneration | **none required** — the derivatives already exist on every asset uploaded since Batch 05 |

**Backfill:** not needed and not proposed. Assets predating the pipeline (`storageProvider:
'legacy-local'`) have no derivatives and correctly receive no `srcset`. If the owner later wants
derivatives for them, that is a separate job with a **dry-run requirement** and must never
overwrite an original.

---

## 14. Production rollout considerations

1. **No migration, so no deploy ordering to get wrong.** Code-only.
2. **Review the one visible behaviour change:** article heroes no longer show the
   `Editorial Dispatch: <title>` caption. Any hero that should have a caption needs one entered
   on the article or the asset. This is intentional — it was never editorial copy.
3. **Expect ALT text to change on live pages**, from the headline to the editor's text. That is
   the fix. Where no ALT exists anywhere the headline still appears and the SEO panel reports
   `IMG_NO_ALT` — a backlog to work through, not a regression.
4. **`srcset` appears only for DAM-managed assets.** Existing articles on legacy
   `/assets/images/...` paths are unchanged; re-pointing them at Media Library assets is what
   unlocks responsive delivery for them.
5. **Verify after deploy:**
   ```powershell
   curl.exe -s https://nfrguide.com/articles/<slug>/ | Select-String -Pattern 'alt=|srcset=|fetchpriority'
   ```
   Expect the editorial ALT, one `fetchpriority="high"`, and `srcset` on DAM-backed heroes.
6. **Media Library:** confirm the new **Decorative image** checkbox saves, and that an existing
   asset with ALT text is unaffected by it.

---

## 15. Remaining risks

| Risk | Severity | Status |
|---|---|---|
| `description` field absent | low | **Incomplete by decision (§3.4)**; needs a migration window |
| Performance gain unmeasured | low | Reasoned, not observed (§12) |
| `sizes` values are layout estimates | low | Conservative — they fall back to `100vw`, which can over-fetch but never under-serve. Worth refining against real measurements |
| Image checks cover only the article hero | medium | Rodeo/discipline/venue/competitor/Builder images and inline body images are unanalysed (§9) |
| No object-level reachability check | medium | A row whose R2 object is missing still looks healthy — the orphan gap from Step 03 §11, unchanged |
| Per-usage ALT has no editor UI | low | Honoured on read; the hero's override is the article field by design (§3.3) |
| No AVIF | low | WebP only. Adding AVIF means a pipeline change and a `<picture>` element — a separate, measurable step |
| Legacy assets get no `srcset` | low | Correct behaviour; a backfill is optional and must be dry-run first |
| Image sitemap | low | Not built. Worth revisiting now that ALT text is real, if Google Images traffic is a goal |

---

## 16. Git status

```
 M apps/web/components/ImageWithCredit.tsx
 M apps/web/components/editorial/ArticleHeader.tsx
 M apps/web/components/editorial/EditorialArticleGrid.tsx
 M apps/web/components/editorial/RelatedArticles.tsx
 M apps/web/components/sections/EditorialHero.tsx
 M apps/web/components/sections/HomeArticleFeed.tsx
 M apps/web/lib/cms/mediaService.ts
 M apps/web/lib/mappers.ts
 M apps/web/lib/seo-intel/analyzers.ts
 M apps/web/types/index.ts
 M apps/web/views/admin/AdminMediaPage.tsx
?? apps/web/lib/media/imageMeta.ts
?? apps/web/tests/med01bc-image-seo.test.ts
?? docs/PRODUCTION_STABILIZATION_MED_01BC_IMAGE_SEO_OPTIMIZATION.md
```

| | |
|---|---|
| Branch / HEAD | `main` / `d4f3159` — **unchanged**, level with `origin/main` |
| Commits / pushes / deployments / migrations | **none** |
| `prisma/schema.prisma` | **unchanged** |
| Dependencies / lockfile | **unchanged** |
| Production database / R2 / environment | **not contacted, not changed** |
| Stashes | 0 · no reset, clean, stash, merge or branch switch |

---

## 17. Final recommendation

**Ship it.** The two defects this stage set out to close are closed and verified in the
artefacts that matter: the editorial ALT text is in the prerendered HTML, the invented caption
is gone from all 11 article pages, the hero is the one prioritised image, and the derivatives
the pipeline has been generating for months are finally advertised. 2,896 tests pass, there is
no migration, and the change is reversible by revert alone.

Three things to decide separately, in this order:

1. **`description`** (§3.4) — the only incomplete requirement. Approve it for the next migration
   window; it is small once the column exists.
2. **Extend image checks beyond the article hero** (§9) — the largest remaining gap in image
   SEO coverage, and now worth doing because `IMG_NO_ALT` finally means what it says.
3. **Measure** (§12) — after deploy, on real media, before any further optimisation. AVIF and an
   image sitemap should both wait for numbers.

**On method, since it affected the outcome:** I set out expecting to add columns and found that
the schema was nearly complete and the failures were at the render layer. I made an empty ALT
mean "decorative" everywhere and an existing test proved that wrong at the article level. And I
wrote an assertion that passed for the wrong reason until the camelCase discovery exposed it.
Each correction is in the report above; none would have survived a write-up based on what I
expected to find.
