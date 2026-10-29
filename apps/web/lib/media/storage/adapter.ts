/**
 * Provider-independent storage interface (Batch 05 §3). Binaries live behind an
 * adapter; Postgres stores only `storageProvider` + `storageKey`. Plain module
 * (types + pure helpers) so it is safe to import anywhere.
 */
export interface StoragePutResult {
  key: string;
  size: number;
}

export interface StorageAdapter {
  /** Provider id recorded on the asset: 'local' | 'r2' | 's3'. */
  readonly provider: string;
  put(key: string, body: Buffer, contentType: string): Promise<StoragePutResult>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>; // best-effort; tolerate a missing object
  exists(key: string): Promise<boolean>;
  /** Stable, app-usable URL for the key (route handler in dev, CDN in prod). */
  publicUrl(key: string): string;
}

/** A storage key is a forward-slash relative path; reject traversal/absolute. */
export function assertSafeKey(key: string): void {
  if (!key || key.length > 512) throw new Error('Invalid storage key.');
  if (key.startsWith('/') || key.startsWith('\\')) throw new Error('Storage key must be relative.');
  if (/\\/.test(key)) throw new Error('Storage key must use forward slashes.');
  // Reject any `.` or `..` path segment (path-traversal prevention).
  for (const seg of key.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') throw new Error('Unsafe storage key segment.');
    if (!/^[A-Za-z0-9._-]+$/.test(seg)) throw new Error('Unsafe characters in storage key.');
  }
}

/** Build a date-sharded key: `yyyy/mm/<id><suffix>.<ext>`. */
export function buildKey(id: string, ext: string, suffix = ''): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const key = `${yyyy}/${mm}/${id}${suffix}.${safeExt}`;
  assertSafeKey(key);
  return key;
}
