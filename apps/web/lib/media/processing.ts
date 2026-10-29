import 'server-only';
import sharp from 'sharp';

/**
 * Image-processing pipeline (Batch 05 §6). Built on sharp/libvips.
 *  - Extracts true dimensions (orientation-aware).
 *  - Generates orientation-corrected WebP derivatives (thumb/md/lg).
 *  - Never upscales (withoutEnlargement) and never mutates the ORIGINAL bytes —
 *    the original is stored as uploaded (preserves embedded attribution/EXIF).
 *  - Derivative keys follow `<originalKeyStem>__<variant>.webp`.
 * If sharp is unavailable/incompatible the caller surfaces the failure rather
 * than silently skipping validation.
 */
export interface DerivativeOutput {
  name: 'thumb' | 'md' | 'lg';
  ext: 'webp';
  buffer: Buffer;
  width: number;
  height: number;
}

export interface ProcessResult {
  width: number;
  height: number;
  derivatives: DerivativeOutput[];
}

const VARIANTS: { name: 'thumb' | 'md' | 'lg'; w: number }[] = [
  { name: 'thumb', w: 320 },
  { name: 'md', w: 768 },
  { name: 'lg', w: 1600 },
];

const QUALITY = Math.min(100, Math.max(40, Number(process.env.MEDIA_WEBP_QUALITY || 72)));

export async function readDimensions(buf: Buffer): Promise<{ width: number; height: number }> {
  const m = await sharp(buf).metadata();
  const w = m.width ?? 0;
  const h = m.height ?? 0;
  // EXIF orientation 5-8 implies a 90° rotation → swap for display dimensions.
  const rotated = (m.orientation ?? 0) >= 5;
  return rotated ? { width: h, height: w } : { width: w, height: h };
}

export async function processImage(buf: Buffer): Promise<ProcessResult> {
  const { width, height } = await readDimensions(buf);
  const derivatives: DerivativeOutput[] = [];
  for (const v of VARIANTS) {
    // Skip variants that would merely duplicate a smaller original, but always
    // produce the thumbnail so the library grid has a lightweight preview.
    if (v.name !== 'thumb' && width > 0 && v.w >= width) continue;
    const out = await sharp(buf)
      .rotate() // auto-orient from EXIF, then the data is upright
      .resize(v.w, null, { withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer({ resolveWithObject: true });
    derivatives.push({ name: v.name, ext: 'webp', buffer: out.data, width: out.info.width, height: out.info.height });
  }
  return { width, height, derivatives };
}
