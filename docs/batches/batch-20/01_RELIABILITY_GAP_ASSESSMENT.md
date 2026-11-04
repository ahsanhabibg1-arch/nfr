# Batch 20 §1 — Reliability Gap Assessment

Legend: ✅ adequate · 🛠 gap→addressed · 📋 assessed/deferred · ⛔ blocked.

| Area | Status | Finding |
|------|:------:|---------|
| Admin unsaved-change protection | 🛠 | Article editor had `isDirty` badge + blocked workflow transitions but **no `beforeunload` guard**; competition editors had **no dirty tracking**. → implemented. |
| Public error boundaries | ✅ | `(public)/error.tsx` + `global-error.tsx` (Batch 18). |
| Admin error boundaries | 🛠 | `(dashboard)/error.tsx` (Batch 19) present, but copy **incorrectly guaranteed** "data was not changed". → corrected. |
| Server Action errors | ✅ | `guard.ts toActionError` → typed `ActionResult`; never throws raw to client. |
| API errors | ✅ | media/upload + analytics return structured JSON; health/ready stable. |
| Structured logging | ✅ | `lib/logger.ts` redacts; no tokens/credentials logged (Batch 13). |
| Error digest handling | ✅ | boundaries show only opaque `digest`; full error → `console.error` (operators). |
| Health / readiness | ✅ | `/api/health`, `/api/ready` (verified 200 in Batch 17 finalization). |
| Performance: ISR/static split | ✅ | legal pages `force-static`; home/article/category `revalidate=60`; directories/disciplines/rodeo `revalidate=300`; `generateStaticParams`+`dynamicParams`. |
| Performance: N+1 / query patterns | ✅ | no `for…await prisma` / `map(async…)` loops in services; relations via Prisma `include`. |
| Performance: caching vs freshness | ✅ | ISR windows respect publish visibility; admin/API `no-store`; no stale published/unpublished leak. |
| CSP enforcement | 📋 | report-only (Batch 17); nonce-based enforcement planned, **not switched on**. |
| Dependency security | 📋 | no prod-runtime critical/high; dev-only criticals (vitest→tinypool); CI gate passes; upgrade = major, deferred. |
| Legacy Vite cleanup | 📋 | repo-root Phase-0 files unreferenced by Next; removal deferred to an approved plan (manifest). |
| NFR 2026 content | ⛔ | source-verified human entry; not fabricated. |

## Conclusion
The application's reliability posture is strong. The one real reliability **gap** was unsaved-change protection on long admin forms (addressed), plus a one-line correctness fix to the admin error copy. Everything else is adequate or an intentionally-deferred, approval-gated item.
