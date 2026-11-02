import { describe, it, expect } from 'vitest';
import { S3StorageAdapter } from '../lib/media/storage/s3';
import { LocalStorageAdapter } from '../lib/media/storage/local';
import { assertSafeKey, buildKey } from '../lib/media/storage/adapter';

/**
 * Cloudflare R2 / S3 adapter — delivery-security + key-safety unit tests (no network,
 * no credentials). The decisive property (owner-approved architecture): the R2/S3
 * adapter's delivery URL is the GATED proxy path, never a direct bucket URL, so draft/
 * private originals are never exposed even if the bucket has a public URL enabled.
 */
describe('R2/S3 storage adapter — gated delivery + key safety', () => {
  it('R2 publicUrl returns the gated /api/media proxy path (NOT a direct bucket URL)', () => {
    const a = new S3StorageAdapter('r2');
    const url = a.publicUrl('2026/11/abc123.webp');
    expect(url).toBe('/api/media/2026/11/abc123.webp');
    expect(url.startsWith('/api/media/')).toBe(true);
    expect(url).not.toMatch(/^https?:\/\//);           // never absolute/direct-to-bucket
    expect(url).not.toMatch(/r2\.cloudflarestorage|r2\.dev/);
  });

  it('generating a delivery URL needs NO credentials (publicUrl does not touch config/SDK)', () => {
    // No MEDIA_S3_* env set here; publicUrl must still work (credential isolation).
    const a = new S3StorageAdapter('s3');
    expect(() => a.publicUrl('2026/11/x.jpg')).not.toThrow();
  });

  it('R2 and local deliver via the SAME gated path shape (backend-agnostic)', () => {
    const key = '2026/11/id__thumb.webp';
    expect(new S3StorageAdapter('r2').publicUrl(key)).toBe(new LocalStorageAdapter('/tmp/x').publicUrl(key));
  });

  it('records the configured provider id on the asset', () => {
    expect(new S3StorageAdapter('r2').provider).toBe('r2');
    expect(new S3StorageAdapter('s3').provider).toBe('s3');
  });

  it('publicUrl rejects unsafe/traversal keys before building a URL', () => {
    const a = new S3StorageAdapter('r2');
    expect(() => a.publicUrl('../secret')).toThrow();
    expect(() => a.publicUrl('/abs/key')).toThrow();
    expect(() => a.publicUrl('a/../../b')).toThrow();
    expect(() => a.publicUrl('bad key.png')).toThrow();   // space → unsafe char
  });

  it('object-key validation: assertSafeKey + buildKey', () => {
    expect(() => assertSafeKey('2026/11/ok_id.webp')).not.toThrow();
    expect(() => assertSafeKey('2026\\11\\win.webp')).toThrow();
    expect(() => assertSafeKey('..')).toThrow();
    const key = buildKey('abc', 'PNG', '__thumb');
    expect(key).toMatch(/^\d{4}\/\d{2}\/abc__thumb\.png$/);
  });
});
