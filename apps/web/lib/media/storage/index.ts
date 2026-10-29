import 'server-only';
import { StorageAdapter } from './adapter';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';

export type { StorageAdapter } from './adapter';
export { assertSafeKey, buildKey } from './adapter';

let cached: StorageAdapter | null = null;

/**
 * Select the active storage adapter by `MEDIA_STORAGE_PROVIDER` (default `local`).
 * The S3/R2 adapter loads the AWS SDK lazily, so selecting `local` needs nothing
 * extra installed. Cached per process.
 */
export function getStorage(): StorageAdapter {
  if (cached) return cached;
  const provider = (process.env.MEDIA_STORAGE_PROVIDER || 'local').toLowerCase();
  switch (provider) {
    case 'local':
      cached = new LocalStorageAdapter();
      break;
    case 'r2':
    case 's3':
      cached = new S3StorageAdapter(provider);
      break;
    default:
      throw new Error(`Unknown MEDIA_STORAGE_PROVIDER "${provider}" (use local | r2 | s3).`);
  }
  return cached;
}

/** For tests: build an isolated local adapter rooted at a temp directory. */
export function makeLocalStorage(root: string): StorageAdapter {
  return new LocalStorageAdapter(root);
}
