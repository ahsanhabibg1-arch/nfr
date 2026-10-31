# SEO Intelligence Architecture (Batch 06)

> Audience: engineers maintaining NFRGuide's SEO engine. How the deterministic,
> database-backed SEO auditing system is structured and how findings persist.

## 1. Design principles

- **Deterministic + explainable.** Every finding is produced by a named rule
  with concrete evidence and a recommendation. No black-box scores.
- **Real data only.** Analyzers read the CMS database; they never fabricate
  rankings, traffic or Google metrics, and never crawl external sites.
- **Advisory.** Findings are diagnostics/recommendations — they do **not** block
  publishing (owner decision §19). The existing publication gate is untouched.
- **Four kinds (§3):** DEFECT, RECOMMENDATION, OPPORTUNITY, NOT_PERFORMED.

## 2. Components

```
 lib/seo-intel/
   types.ts         shared types (Severity/Kind/Category, RawFinding, AuditScope)
   rules.ts         the rule registry (stable codes) + configurable thresholds
   analyzers.ts     pure analyzers over an Inventory (article/editorial/technical/
                    structured-data/internal-link/rodeo/image)
   orchestrator.ts  buildInventory (DB) → runAnalyzers → persist (dedup/reopen/
                    auto-resolve), rule-registry sync, concurrent-run guard
 lib/cms/seoService.ts   RBAC + dashboard + findings list + workflow + config
 app/admin/seo-actions.ts  Server Actions (run/update/recheck/toggle/thresholds)
 views/admin/AdminSEOPage.tsx   dashboard + issue workflow + rules/config UI
 views/admin/ArticleSeoPanel.tsx  advisory diagnostics in the article editor
```

## 3. Audit flow (bounded, synchronous — §17)

1. `runSeoAudit(actor, scope)` requires `seo.audit.run`.
2. **Concurrent-run guard**: refuses if a run with status `running` exists.
3. Sync the rule registry into `SeoRule` (stable `code`).
4. `buildInventory(db)` loads articles (+ SEO, blocks, relations), rodeo
   entities, redirects, categories, media — one bounded pass. (Full-DB scan is
   acceptable at current scale; batching is the documented path for growth.)
5. `runAnalyzers(inv, thresholds, scope)` returns `RawFinding[]`. Disabled rules
   produce nothing.
6. **Persist** each finding by stable `fingerprint = sha1(ruleCode|entityType|
   entityId|discriminator)`:
   - new → create (OPEN);
   - previously RESOLVED and reappearing → **REOPENED**;
   - otherwise → update `lastSeenAt`/evidence (keep manual status).
7. **Verified auto-resolve**: active findings *in scope* not seen this run →
   RESOLVED with a note ("no longer detected"). This is a *verified technical*
   resolution, distinct from a manual status change (§14).
8. Record `SeoAuditRun` (status, counts, triggeredBy) + an `AuditLog` row.
9. The persistence loop tolerates an entity being deleted mid-scan (skips that
   finding) so a long audit never fails on concurrent edits.

## 4. Scopes

`full` (everything), `article` (one article's findings only — reconciliation is
scoped to that article), `rodeo` (entity checks), `technical` (technical +
structured data). Author-triggered views are additionally scoped to their own
articles.

## 5. Dashboard & workflow

`getSeoDashboard` returns active counts by severity/category/status, resolved,
in-progress, recent runs and recently-resolved — all from the database, with an
explicit "not connected" notice for the external metrics (rankings, impressions,
clicks, CTR, traffic, Search Console, AdSense, backlinks) that are out of scope.
Findings move through OPEN → IN_PROGRESS → RESOLVED / IGNORED (dismissed) /
REOPENED. "Recheck" re-runs a scoped audit to get a verified status.

## 6. Security

RBAC (`seo.*`) is enforced in the service on every operation; Authors see only
their own articles' findings; config is `seo.config` only. The engine performs
no network requests (no SSRF surface), does not expose unpublished content
(findings reference URLs/evidence, not article bodies), and audits are bounded.
See [SEO_RBAC_MATRIX.md](SEO_RBAC_MATRIX.md), [TECHNICAL_SEO_AUDIT.md](TECHNICAL_SEO_AUDIT.md).
