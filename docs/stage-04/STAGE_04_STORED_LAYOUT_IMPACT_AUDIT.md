# Stage 04 — Stored Layout Impact Audit

**Stage:** 04 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`
**Status:** blocking prerequisite, completed **before** any behaviour-changing fix was applied.

This audit existed to answer one question: **could wiring a previously-inert property, or consolidating a block definition, change what a visitor currently sees?** The answer determines whether Stage 04's fixes are safe or disruptive.

---

## 1. Method

Read-only Prisma queries against **verified non-production** databases. No writes, no migrations, no seeds. Nothing beyond type and length was printed for any stored value, and no connection string was ever emitted.

Target verification before each connection: hostname must be local, and the database name must not match `/prod/i`. The dev target was additionally confirmed to be `nfrguide_dev`, distinct from `nfrguide_test` and from the configured `CLOUD_DATABASE_URL`.

Properties and types watched — every surface Stage 04 could change:

- **Properties:** `heroImageUrl`, `articleCount`, `showImage`, `columns`, `pills`, `title`, `heroImageAlt`, `ctaUrl`, `ctaText`
- **Section types:** `detail-hero`, `detail-body`, `detail-faq`, `landing-stat-pills`, `directory-hero`, `directory-grid`, `rich-text-block`, `cta-banner`, `landing-hero`, `landing-grid`, `detail-related`, `newsletter-signup`

Declared property keys were parsed from `lib/cms/sectionRegistry.ts` so undeclared keys in stored JSON could be detected.

---

## 2. Result — no stored layout exists in either inspectable database

| Database | `PageLayout` rows | Verdict |
|---|---|---|
| `nfrguide_test` (isolated test) | **0** | no stored layout |
| `nfrguide_dev` (development) | **0** | no stored layout |

Because there are no rows, there are consequently:

- **0** stored values for any watched property
- **0** undeclared property keys in stored JSON
- **0** stored occurrences of any legacy or to-be-retired section type

### Supporting table counts — development database

| Table | Rows | What it tells us |
|---|---|---|
| `PageLayout` | **0** | the Page Builder has never saved a layout |
| `PageLayoutRevision` | **0** | consequently, nothing has ever been published through it |
| `SiteConfig` | **0** | footer and appearance have never been configured either |
| `SectionConfig` | **0** | section identity overrides have never been saved |
| `Announcement` | **0** | none created |
| `GlobalBlock` | **0** | none created |
| `NavigationItem` | 15 | seeded canonical navigation |
| `Article` | 11 | editorial content exists; page *composition* does not |

**Interpretation.** Every public page currently renders from `buildDefaultSlots(family)` — the code defaults — not from admin-saved composition. This is consistent with Stage 03's observability work: `getPublishedSections` returns `default-no-layout` for every key.

The distinction matters: **the CMS has real content, but the Builder has never been used to compose a page.** So there is no saved admin intent for a Stage 04 fix to disturb.

---

## 3. Impact assessment per Stage 04 change

| Change | Could it alter a stored page? | Why |
|---|---|---|
| `landing-hero.heroImageUrl` now consumed | **No** | no stored value exists; the component renders identically when unset, verified by test |
| `landing-grid.articleCount` now limits the grid | **No** | no stored value; unset and `0` both preserve the previous "show all" behaviour, verified by test |
| `detail-related.title` now passed through | **No** | no stored value; absent title still yields the documented default heading |
| `rich-text-block` / `cta-banner` consolidated | **No** | the `type` strings, `defaultProps` and `editableProps` are unchanged; only the duplicate declaration was removed |
| Family-aware instance caps enforced | **No** | no layout exists that could exceed a cap |
| `landing-stat-pills.defaultProps.pills[]` removed | **No** | nothing read it, and no stored slot carries it |
| Per-`PropDef` validation enforced | **No** | no stored props to re-validate; undeclared keys are warned, never rejected or deleted |
| `detail-related.articleCount` clamped | **No** | no stored value; absent still yields the default of 3 |

**Conclusion: Stage 04's behaviour-changing fixes carry no stored-data risk in either inspectable environment.** Each was additionally verified by a behavioural test proving the unset path renders as before.

---

## 4. Limitations — stated plainly

### 4.1 Production was not inspected

Per the stage directive, no production database was connected to. **A zero-row result in dev and test does not prove production is safe.**

What is known without connecting:

- `CLOUD_DATABASE_URL` is configured, but `apps/web/.env.example:42` documents it as *"The **FUTURE** deployed site's PostgreSQL"*.
- `NEXT_PUBLIC_SITE_URL` is `http://localhost:3000`.
- Stage 01 established that `INTERNAL_REVALIDATE_SECRET` is unset, so scheduled-publish revalidation is not configured for any deployment.
- Stage 04 observed that the project's own environment guard **refuses to boot** a production build against a local database (§5 of the test report), which is consistent with production never having been stood up from this working copy.

**Documentary evidence therefore indicates a pre-launch project with no live production layouts.** That is an inference from documentation and configuration, **not** a verified database observation, and it is recorded as such.

**If a production database does exist and holds `PageLayout` rows**, the same queries should be run against it, read-only and with separate explicit authorization, before these changes are deployed. The specific checks are in §5.

### 4.2 Defence in depth, given that limitation

Because production could not be verified, every Stage 04 fix was implemented so that **the unset path is byte-equivalent to the previous behaviour**:

- `landing-hero` renders no `<img>` at all when `heroImageUrl` is absent or blank — asserted by test.
- `landing-grid` returns the full list when `articleCount` is absent **or zero** — asserted by test, including the `0` case specifically.
- `detail-related` falls back to its documented default heading when `title` is absent or empty — asserted by test.
- Undeclared property keys are **warned about and preserved**, never rejected or dropped — asserted by a test that inspects what is written.

So even if production holds layouts this audit could not see, a stored value for one of these properties would begin taking effect **as the admin originally intended**, and a stored layout with no such value renders unchanged.

---

## 5. Required checks if a production database is later authorized

Read-only. Run before deploying Stage 04.

```sql
-- 1. Does any layout exist at all?
SELECT count(*) FROM "PageLayout";

-- 2. Stored values for the properties Stage 04 made effective.
SELECT "pageKey",
       "draftSections"::text ~ 'heroImageUrl'  AS draft_has_hero_image,
       "publishedSections"::text ~ 'heroImageUrl' AS published_has_hero_image,
       "publishedSections"::text ~ 'articleCount' AS published_has_article_count
FROM "PageLayout";

-- 3. Any stored use of the types scheduled for retirement in Stage 07.
SELECT "pageKey" FROM "PageLayout"
WHERE "publishedSections"::text ~ 'detail-hero|detail-body|detail-faq|directory-grid';

-- 4. Any layout exceeding the now-enforced landing caps
--    (rich-text-block max 3, cta-banner max 2 on section:* keys).
SELECT "pageKey", "publishedSections" FROM "PageLayout" WHERE "pageKey" LIKE 'section:%';
```

Expected outcomes and the action each implies:

| Finding | Action |
|---|---|
| 0 rows | deploy as-is; identical to the audited environments |
| Rows exist, no watched property stored | deploy as-is; unset paths are unchanged |
| A `heroImageUrl` / `articleCount` / `title` value **is** stored | that page will begin honouring it. Preview before publishing — this is the fix working, but it is a visible change |
| A `section:*` layout exceeds the landing caps | the next **save** of that page will be rejected. Published output is unaffected until then. Reduce the block count or revisit the cap |
| A retired type is stored | do **not** remove those declarations in Stage 07 without a migration plan for those rows |

---

## 6. Audit integrity

No database was written to. No migration was created or applied in this audit (the test-database migration was a separate, owner-approved Stage 03 action). No credential or stored content value was printed. The two temporary query scripts were deleted after use and are not part of the repository.
