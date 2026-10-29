# Image Processing Pipeline (Batch 05)

> Audience: engineers. The sharp-based processing applied at upload.
> Module: `lib/media/processing.ts`. Dependency: `sharp` 0.33.5 (libvips 8.15.3).

## What it does

For each uploaded JPEG/PNG/WebP (after signature validation):

1. **Dimension extraction** — reads true pixel dimensions, EXIF-orientation aware
   (orientations 5–8 swap width/height for display).
2. **Orientation correction** — derivatives are generated with `.rotate()`
   (auto-orient from EXIF), so stored derivatives are visually upright.
3. **Derivatives** — orientation-corrected **WebP** variants:
   - `thumb` 320w (always produced — lightweight library/grid preview)
   - `md` 768w, `lg` 1600w (produced only when smaller than the original)
   - Quality via `MEDIA_WEBP_QUALITY` (default 72, clamped 40–100).
4. **No upscaling** — `withoutEnlargement`; a variant wider than the original is
   skipped (except the always-present thumbnail, which also won't enlarge).
5. **Original preserved** — the uploaded bytes are stored unmodified (keeps any
   embedded attribution/EXIF; §6 "avoid destructive replacement").

## Derivative naming & storage

- Keys: `yyyy/mm/<assetId>__<variant>.webp` next to the original
  `yyyy/mm/<assetId>.<ext>`.
- Recorded on the asset as `derivatives` JSON: `{ thumb:{key,width,height,bytes},
  md:{…}, lg:{…} }`.
- The library grid and picker use the `thumb` derivative; the public hero uses
  the original url (served with cache headers). Responsive `srcset` from md/lg
  is available for future enhancement.

## Cleanup

- On storage, database, or audit failure after objects were written, all written
  keys are removed (no untracked objects).
- On asset delete, the original + every derivative key is deleted from storage
  (managed providers only; legacy static files are never touched).

## Failure handling

- A corrupt/undecodable image makes `processImage` throw; the service surfaces a
  `processing` error and stores nothing (no silent bypass of validation, §6).
- `sharp` ships prebuilt binaries; verified working on this environment
  (Windows x64, libvips 8.15.3). If a future environment cannot load sharp, the
  upload fails loudly rather than skipping validation.
