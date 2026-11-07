# Batch 32 — Test Results

**Date**: 2026-11-07

## TypeScript
```
tsc --noEmit → 0 errors
```

## Prisma
```
prisma validate → valid ✅
```

## Vitest (Unit + Integration)
```
54 test files | 520 tests passed | 0 failed
```

### Batch 32 unit tests (35 tests in batch32-unit.test.ts):

**Block instance IDs (4 tests):**
- generateBlockId returns unique strings
- buildDefaultSlots assigns unique IDs to every slot
- ensureSlotIds adds IDs to legacy slots without them
- ensureSlotIds preserves existing IDs

**Block categories and metadata (3 tests):**
- Every section definition has a category
- getBlockCategories returns categories for homepage
- getAvailableBlockTypes deduplicates blocks within a family

**Premium block types (5 tests):**
- Homepage has premium blocks: rich-text, image-text, stats, cta-banner, faq, newsletter
- Section-landing has shared premium blocks: rich-text, cta-banner
- Premium blocks are marked as duplicatable
- Premium blocks have maxInstances limits
- Premium blocks have descriptions

**Block instance management (3 tests):**
- countBlockInstances counts correctly
- canAddBlock respects maxInstances
- canAddBlock allows unlimited when maxInstances is undefined

**Property tabs (2 tests):**
- Premium blocks have tab assignments on editableProps
- select-type props have options

**Service security (3 tests):**
- Service validates block instance limits
- Service validates unique block IDs
- Service Zod schema includes id field

**Visual builder UI (6 tests):**
- Editor has three-panel layout: Canvas and Properties
- Editor has Add Section panel with category filters
- Editor supports block instance actions: duplicate and remove
- Editor has drag-and-drop support
- Editor has tabbed property panel
- Editor supports new prop types: select, boolean, color

**Builder metadata (1 test):**
- Editor shows block metadata: category, description, instance count

**Public rendering (2 tests):**
- HomeView renders premium blocks
- Premium block rendering uses slot IDs as keys

**Server data flow (2 tests):**
- Website page passes category and description to registries
- Website page calls ensureSlotIds on layout rows

**Backward compatibility (4 tests):**
- Core page families still resolve correctly
- KNOWN_PAGE_KEYS still has all 13 keys
- All known page keys still have labels
- buildDefaultSlots deduplicates shared block types

## Playwright (E2E)
```
70 tests total | 70 passed | 0 skipped | 0 failed
Duration: ~3.5m
```

### Batch 32 E2E tests (7 total, all passed):
- ✅ Page Layouts tab shows builder with Canvas and Properties headings
- ✅ Add Section button opens block library with category filters
- ✅ Add Section shows premium block types
- ✅ Adding a premium block inserts it into the canvas (DB-backed)
- ✅ Clicking a block shows its properties
- ✅ Save Draft with block IDs persists to database (DB-backed)
- ✅ Drag handle is visible on blocks

## Next.js Build
```
next build → success ✅
All pages generated correctly
```
