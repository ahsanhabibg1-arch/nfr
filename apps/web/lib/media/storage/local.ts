import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StorageAdapter, StoragePutResult, assertSafeKey } from './adapter';

/**
 * Local filesystem adapter (Batch 05 §3/§5). Dev/test only. Blobs live under a
 * git-ignored root OUTSIDE `/public`; they are served by the visibility-gated
 * route handler `GET /api/media/[...key]`, so draft-only media is never exposed.
 * Root is configurable (`MEDIA_LOCAL_ROOT`) so tests use an isolated directory.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly provider = 'local';
  private root: string;

  constructor(root?: string) {
    // The root is intentionally runtime-configurable for isolated tests and
    // self-hosting; do not make Turbopack trace the entire project from it.
    this.root = path.resolve(/* turbopackIgnore: true */ root || process.env.MEDIA_LOCAL_ROOT || path.join(process.cwd(), 'var', 'media'));
  }

  private full(key: string): string {
    assertSafeKey(key);
    const p = path.resolve(this.root, key);
    // Defense in depth: the resolved path must stay inside the root.
    const rel = path.relative(this.root, p);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Resolved path escapes storage root.');
    return p;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<StoragePutResult> {
    const p = this.full(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
    return { key, size: body.length };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.full(key));
  }

  async delete(key: string): Promise<void> {
    try { await fs.unlink(this.full(key)); } catch { /* already gone — fine */ }
  }

  async exists(key: string): Promise<boolean> {
    try { await fs.access(this.full(key)); return true; } catch { return false; }
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `/api/media/${key}`;
  }
}
