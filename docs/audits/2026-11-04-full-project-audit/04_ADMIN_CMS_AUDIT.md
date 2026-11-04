# 04 — Admin CMS Audit

**Mode:** READ-ONLY. Evidence: `app/admin/(dashboard)/*/page.tsx`, `app/admin/*-actions.ts`, `lib/cms/*`.

## 1. Gating (all admin routes)
`app/admin/(dashboard)/layout.tsx` redirects to `/admin/login/` when there is no valid session (header comment confirms + `route-smoke.mts` asserts unauthenticated `/admin/` → 3xx → `/admin/login`). Every Server Action re-authorizes via `requireActor(permission)` in `lib/cms/guard.ts` (default-deny) and writes an `AuditLog` row. Gating is **server-side**, not client-only (a Phase 0 regression that is now fixed).

## 2. Module inventory (17 action files, 22 admin page routes)

| # | Module | Route | Actions file | CRUD | RBAC | Audit | State |
|---|--------|-------|-------------|------|------|-------|-------|
| 1 | Dashboard | `(dashboard)/page.tsx` | — | read | session | n/a | IMPL-NOT-RTV |
| 2 | Articles | `articles/{,new,[id]/edit}` | `article-actions.ts` | full + workflow + revisions | ✓ | ✓ | IMPL-NOT-RTV; **optimistic `version` concurrency ✓** |
| 3 | Taxonomy / Authors | `editorial-organization` | `taxonomy-actions.ts` | full; author CRUD w/ orphan guard | ✓ | ✓ | IMPL-NOT-RTV |
| 4 | Rodeo coverage | `rodeo-coverage` | `rodeo-actions.ts` | full (hub/event/edition) | ✓ | ✓ | IMPL-NOT-RTV |
| 5 | Competitors | `competitors` | `competitor-actions.ts` | full | ✓ | ✓ | IMPL-NOT-RTV |
| 6 | Venues | `venues` | `rodeo-actions.ts`/`competitor-actions.ts` | full | ✓ | ✓ | IMPL-NOT-RTV |
| 7 | Competition | `competition` | `competition-actions.ts` | full (sessions/results/standings) | ✓ | ✓ | **PARTIAL — last-write-wins, no `version` field** |
| 8 | Media Library | `media` | `media-actions.ts` + `api/admin/media/upload` | upload/process/CRUD | ✓ | ✓ | IMPL-NOT-RTV |
| 9 | Sources | `sources` | `source-actions.ts` | full | ✓ | ✓ | IMPL-NOT-RTV |
| 10 | SEO Intelligence | `seo` | `seo-actions.ts` | audit runs/findings/config | ✓ | ✓ | IMPL-NOT-RTV |
| 11 | Landing SEO + FAQ | `landing-seo` | `landing-seo-actions.ts` | full (`EntitySeo`/`EntityFaq`) | ✓ | ✓ | IMPL-NOT-RTV |
| 12 | Website / Navigation | `website` | `navigation-actions.ts` | full | ✓ | ✓ | IMPL-NOT-RTV |
| 13 | Analytics | `analytics` | `analytics-actions.ts` | read/config/provider | ✓ | ✓ | IMPL-NOT-RTV |
| 14 | Monetization | `monetization` | `monetization-actions.ts` | full (partners/links/ads/disclosures) | ✓ | ✓ | IMPL-NOT-RTV |
| 15 | Team & RBAC | `team` | `team-actions.ts`, `invite-actions.ts` | users/roles/invitations | ✓ | ✓ | IMPL-NOT-RTV |
| 16 | Settings | `settings` | `settings-actions.ts` | system settings | ✓ | ✓ | IMPL-NOT-RTV |
| — | Account self-service | `account` | `account-actions.ts` | password/profile | session | ✓ | IMPL-NOT-RTV |

All 17 action files contain real `'use server'` server-side implementations routed through `guard.ts` — no action is a client-only stub (verified by `grep -rl "'use server'"`).

## 3. Editorial workflow (item 3 in brief)
`article-actions.ts` exposes `saveArticleAction`, a status-transition action returning `{status, version}`, and `restoreRevisionAction`. Models `ArticleRevision` + `EditorialWorkflowHistory` + `WorkflowStatus` enum back review/approve/schedule/publish/unpublish. **Optimistic concurrency is implemented for articles** (`articleService.ts:17` — "detects concurrent edits via an optimistic `version` check"; `Article.version Int @default(1)`).

## 4. Phase 0 demo-remnant check
- ✅ "New Article" form: Phase 0 demo auto-population **removed** (Batch 15/16) — blank body/category/author/image/tags, `imageRights` defaults to `Unresolved`. Author dropdown is DB-backed (`Author`), default "Select author…".
- ✅ `AdminTopbar.tsx` — "Demo Stage" badge **removed** (verified: no demo/DEMO markup in current file).
- ✅ `mockEditorialData` import removed from editor shell (Batch 16).
- ⚠️ `KNOWN_LIMITATIONS.md` still *documents* Phase 0 DEMO behavior in its opening sections — documentation stale, code is clean (see report 02 §F).

## 5. Real DB-backed identities & legacy preservation
`Author` model (id/slug/name/role/bio/credentials/articles) is the byline source. Legacy string bylines preserved via `legacyBylineName` on articles (Batch 16). Confirmed by schema + `tests/batch16.test.ts` (not executed this audit).

## 6. Known bugs / missing capabilities
- **Competition concurrency (CONFIRMED, PARTIAL):** `competition-actions.ts` contains no `version`/`expectedVersion` guard — concurrent edits to sessions/results/standings are last-write-wins. Articles already solved this; competition did not adopt the same pattern. → backlog `P1-CONC-01`.
- **No module-level pagination defects** found in source for directories (bounded queries in `batch12Content.ts`).
- Admin tables/forms responsive + a11y state: see report 09 (Phase 2 A–D added axe/Playwright coverage).

## 7. Production readiness (CMS)
Server-side auth ✓, RBAC default-deny ✓, audit logging ✓, real persistence ✓, demo remnants removed ✓. Outstanding: competition optimistic concurrency (P1), credential rotation (P0, infra), and verified content entry (P0, content).
