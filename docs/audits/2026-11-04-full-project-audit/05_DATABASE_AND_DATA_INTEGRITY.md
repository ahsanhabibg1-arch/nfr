# 05 — Database & Data Integrity Audit

**Mode:** READ-ONLY. Evidence: `prisma/schema.prisma` (1,479 lines), `prisma/migrations/*`, `lib/cms/*Service.ts`. Safe check run: `npx prisma validate` → **valid**.

## 1. Models & migrations
- **~70 models, ~30 enums** (enumerated in evidence appendix of report 01). Domain groups: editorial (Article + relations, revisions, workflow history, blocks, SEO), taxonomy (Category/Tag/Author), rodeo (Discipline/Hub/Event/Edition + join tables), **Batch 12** (Venue/Competitor + discipline/participation/media joins), **Batch 14** (CompetitionSession/Result/Standing), media (MediaAsset + per-entity media joins), SEO intel (SeoRule/AuditRun/Finding/Config + EntitySeo/EntityFaq), auth/RBAC (User/Session/Role/Permission/UserRole/RolePermission/AuditLog + StaffInvitation/PasswordResetToken), analytics, monetization, navigation, settings.

### Migration history (12, ordered)
```
20261028000000_init
20261029000000_batch03_auth_rbac
20261029100000_batch04_navigation
20261029200000_batch05_media
20261031000000_batch06_seo
20261031100000_batch07_analytics_search   ← searchVector tsvector + GIN
20261031200000_batch08_monetization
20261031300000_batch09_admin_governance
20261101000000_batch10_rodeo_hub_event
20261101100000_batch11_entity_seo_faq
20261101200000_batch12_venue_competitor
20261102120000_batch14_competition_coverage ← CompetitionSession/Result/Standing + 5 enums
```
- **Batch 14 competition migration is present** (`20261102120000_batch14_competition_coverage/migration.sql` — creates `CoverageStatus`, `CoverageVerification`, `CompetitionSessionStatus`, `CompetitionResultType`, `StandingCategory` enums + the three tables). Verified by direct SQL inspection.
- **Phase 2 (Batches A–D) introduced NO new migration** — migration list ends at Batch 14. A–D were accessibility/CI/hardening + editor option changes, not schema changes (see report 08). Confirmed: no `batch-a..d` migration directories exist.

## 2. Full-text search
`Article.searchVector` is a DB-managed **generated** `tsvector` (weighted: title=A, deck/excerpt=B, subcategory/articleType=C) with a **GIN index** `Article_searchVector_idx`. Evidence: `migrations/…batch07…/migration.sql:155-165`. `to_tsvector` given explicit `'english'::regconfig` (immutable) — correct for a generated column.

## 3. Integrity / constraints
- FKs, uniqueness and indexing declared throughout schema (relations + `@unique`/`@@index`). Cross-table slug uniqueness for hubs/events enforced on write (documented in `config/routes.ts` comments + services).
- **Article ownership / authorship:** `Author` relation + `legacyBylineName`; article→author FK.
- **Revision history:** `ArticleRevision` + `EditorialWorkflowHistory`.
- **Competition correction chains:** `CompetitionResult.correctionOfId` self-relation (`isCorrection` surfaced in service mapper `competitionService.ts:285`). Supports correction lineage.
- **Delete restrictions:** author delete guarded against orphaning articles (Batch 16 orphan guard); referential actions governed by Prisma relation modes in schema.

## 4. Concurrency protection — explicit finding
| Entity | Protection | Evidence |
|--------|-----------|----------|
| **Article** | ✅ Optimistic `version` check | `Article.version Int @default(1)`; `articleService.ts:17`; actions return `{version}` |
| **Competition** (session/result/standing) | ❌ **Last-write-wins** | `competition-actions.ts` has no `version`/`expectedVersion`/conflict handling (grep empty) |

→ **CONFIRMED:** competition editing still uses last-write-wins. Recommend adopting the Article `version` pattern (backlog `P1-CONC-01`). Risk: silent overwrite of a concurrent editor's corrections — material for a results/standings domain where accuracy matters.

## 5. Aiven production application status
- Docs (`MIGRATION_STATUS.md`, `AIVEN_CLOUD_DATABASE_SETUP/VERIFICATION.md`, commit `a3fa9b9`) claim all 12 migrations + full data copy deployed and verified to Aiven.
- **This audit did NOT connect to Aiven** (read-only, no cloud writes/reads). Therefore the applied state on Aiven is **UNVERIFIED here**. Per brief: *never infer a migration is applied to Aiven because the SQL exists in Git.* Treat Aiven applied-state as **claimed-but-unverified** until a read-only `migrate status` is run against it under controlled conditions.

## 6. Backup / restore readiness
- Local→cloud import tooling exists (`scripts/cloud-data-import.mts`) with `pg_dump`/`pg_restore` flow documented (`LOCAL_TO_CLOUD_MIGRATION_*.md`). A **scheduled production backup/PITR policy** for Aiven is a deployment concern — see report 11. Not verified operational here.

## 7. Additive-migration risk assessment (future changes)
- All 12 existing migrations are additive/forward. Future changes should remain **additive** (add nullable columns / new tables; backfill; then tighten) to allow zero-downtime deploy against the live Aiven DB. Avoid destructive column drops/renames in a single step. Any new migration must be `prisma migrate deploy`-applied to Aiven under the existing guarded script, never `db push`/`reset`.

## 8. Limitations
- No row-level data content audited (no production/Aiven read). Constraint enforcement verified at schema level; not exercised against live data in this pass.
