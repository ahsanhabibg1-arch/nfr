# Batch 33 — Gap Analysis

**Date**: 2026-11-07

## Gap Matrix

| Capability | SportingSpy Ref | NFRGuide Current | Required Change | Priority |
|---|---|---|---|---|
| Homepage composition | JSON-driven sections | PageLayout model + section registry (Batch 31-32) | Extend with content source engine | P0 |
| Page/section layouts | Five document types | PageLayout covers 13 page keys, 4 families | Already complete — extend blocks | Done |
| Block instance IDs | N/A | UUID-based IDs, validation (Batch 32) | Already complete | Done |
| Premium block library | N/A | 6 premium blocks + add/dup/drag (Batch 32) | Already complete | Done |
| Three-panel builder | N/A | Canvas + Properties + Add Section (Batch 32) | Already complete | Done |
| Header/navigation | CMS-managed items | NavigationItem model, 4 locations, CRUD, canonical seed | Add mobile label, new-tab control, CMS picker | P1 |
| Footer | CMS-managed columns | SiteFooter renders DB-backed nav links, static brand | Add admin footer editor (tagline, social, columns) | P1 |
| Announcements | Type, priority, dates | **Missing** | New model + admin + public render | P0 |
| Global blocks | Type, placements, dates | **Missing** | New model + admin + public render | P1 |
| Intro banner presets | 10 styles | editorial-hero block with basic props | Add 10 appearance presets + focal points | P0 |
| Content source modes | auto/manual/mixed | Manual-only (featured picker, Batch 32 smart) | Add auto/mixed modes + resolver | P0 |
| Draft/publish | Separate JSON fields | draftSections/publishedSections on PageLayout | Extend to footer/nav/announcements | P1 |
| Scheduled publish | Cron-based activation | **Missing** | Add scheduledAt + activation mechanism | P2 |
| Preview | Auth + noindex + no-cache | preview/route.ts exists (Batch 31) | Already complete | Done |
| Cache invalidation | In-process cache | revalidatePath in all server actions | Already complete | Done |
| RBAC | Permission-gated | system.config + navigation.manage | Already complete | Done |
| Audit logging | Per-mutation logs | AuditLog model, audit() helper | Already complete | Done |
| Concurrency | Version field | **Missing** on PageLayout | Add version field | P1 |
| Validation on write | Zod schemas | SectionSlotSchema + block limits + unique IDs | Already complete | Done |
| Validation on read | Fallback to defaults | getPublishedSections catches errors, returns defaults | Already complete | Done |
| Cross-section dedup | Server-side | **Missing** | Add to content resolver | P1 |
| Entity source types | Articles only | Articles + rodeo hubs (featured picker) | Add events, editions, competitors, venues | P1 |
| Content resolver | Batched queries | **Missing** — each section fetches independently | Build unified resolver | P0 |
| Overview dashboard | Status summary | **Missing** | Build overview tab | P2 |
| Unified admin tabs | 5+ areas | 2 tabs (Navigation, Page Layouts) | Extend to 7 tabs | P1 |

## Summary

- **Already complete**: Page layouts, block IDs, premium blocks, builder UI, preview, RBAC, audit, cache invalidation, validation
- **Partially implemented**: Navigation (needs mobile/external enhancements), footer (needs admin editor), content selection (needs auto/mixed modes)
- **Missing**: Announcements, global blocks, content source engine, intro banner presets, scheduled publish, overview dashboard, concurrency control
- **Not applicable**: SportingSpy Express middleware, sport taxonomies, in-process cache

## Implementation Priority

1. **P0**: Content source engine, intro banner presets, announcements (core user-facing value)
2. **P1**: Navigation enhancements, footer editor, global blocks, unified admin tabs, concurrency
3. **P2**: Scheduled publishing, overview dashboard
