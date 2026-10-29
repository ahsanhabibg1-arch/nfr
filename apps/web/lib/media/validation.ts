/**
 * Upload validation (Batch 05 §5). Pure module (no server-only) so it is unit-
 * testable directly. The browser-supplied MIME is NEVER trusted — the real type
 * is detected from the file's magic bytes. Only JPEG, PNG and WebP are accepted
 * (SVG rejected per the owner decision: active-content/XSS risk).
 */
export class MediaValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface DetectedType {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  ext: 'jpg' | 'png' | 'webp';
  format: 'jpeg' | 'png' | 'webp';
}

export const DEFAULT_MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES || 15 * 1024 * 1024); // 15 MB

/** Detect a supported raster image from its leading bytes; null if unsupported. */
export function detectImageType(buf: Buffer): DetectedType | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', format: 'jpeg' };
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return { mime: 'image/png', ext: 'png', format: 'png' };
  }
  // WebP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp', format: 'webp' };
  }
  return null;
}

/** Sanitize an original filename to a safe basename (no path, no traversal). */
export function sanitizeFilename(name: string): string {
  const base = (name || 'upload').split(/[\\/]/).pop() || 'upload'; // strip any path
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'upload';
  return stem;
}

export interface ValidatedUpload {
  type: DetectedType;
  bytes: number;
  safeStem: string;
}

/**
 * Validate raw upload bytes. Throws MediaValidationError on any failure:
 *  - empty / oversized
 *  - unsupported signature (incl. SVG, GIF, HEIC, PDFs, executables, …)
 *  - declared MIME that contradicts the real signature
 */
export function validateUpload(
  buf: Buffer,
  originalName: string,
  declaredMime: string | null | undefined,
  maxBytes: number = DEFAULT_MAX_BYTES,
): ValidatedUpload {
  if (!buf || buf.length === 0) throw new MediaValidationError('empty', 'The uploaded file is empty.');
  if (buf.length > maxBytes) {
    throw new MediaValidationError('too_large', `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
  }
  const type = detectImageType(buf);
  if (!type) {
    throw new MediaValidationError('unsupported_type', 'Unsupported file type. Allowed: JPEG, PNG, WebP. (SVG and other types are not permitted.)');
  }
  // If the browser declared a MIME, it must not contradict the real signature.
  if (declaredMime && declaredMime.startsWith('image/') && declaredMime !== type.mime) {
    // tolerate image/jpg vs image/jpeg
    const norm = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime;
    if (norm !== type.mime) {
      throw new MediaValidationError('mime_mismatch', `Declared type (${declaredMime}) does not match the actual file content (${type.mime}).`);
    }
  }
  return { type, bytes: buf.length, safeStem: sanitizeFilename(originalName) };
}
