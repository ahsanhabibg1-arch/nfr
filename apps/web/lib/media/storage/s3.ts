import 'server-only';
import { StorageAdapter, StoragePutResult, assertSafeKey } from './adapter';

/**
 * S3-compatible adapter (Batch 05 §3) — targets Cloudflare R2 (owner-approved),
 * AWS S3, or MinIO by configuration. Activated with
 * `MEDIA_STORAGE_PROVIDER=r2` (or `s3`) plus the `MEDIA_S3_*` variables below.
 *
 * MED-01A — the SDK specifier must be a LITERAL.
 *
 * THE DEFECT. This file used to assemble the module name at runtime
 * (`['@aws-sdk', 'client-s3'].join('/')`) and pass that variable to
 * `await import(spec)`. The intent was to keep the AWS SDK an optional
 * dependency the bundler would not try to resolve. What actually happened is
 * that the bundler could not resolve it *at all*: a dynamic specifier it cannot
 * analyse is compiled into a stub that throws at call time. In production every
 * upload failed inside `ensure()` with
 *
 *     [storage] Error: Cannot find module as expression is too dynamic
 *     provider: r2  objectsWritten: 0
 *
 * — i.e. the upload never reached R2. The operator saw only "Upload failed
 * while saving the file.", which reads exactly like a permission problem, and
 * the two are indistinguishable from outside. (`derivativesPlanned: 2` in the
 * same log line also proves `sharp` was working: the image was decoded and its
 * derivatives generated before this point.)
 *
 * THE FIX. `await import('@aws-sdk/client-s3')` — a literal the bundler can
 * resolve. The import stays INSIDE `ensure()`, so loading is still lazy and the
 * `local` provider still never pulls the SDK in; what changes is only that the
 * specifier is statically analysable. `@aws-sdk/client-s3` is a production
 * dependency and is listed in `serverExternalPackages`, so the built server
 * requires it from `node_modules` at call time rather than bundling it.
 *
 * The literal also makes the SDK mockable, which is what lets
 * `tests/media-storage-adapter.test.ts` cover `put`/`get`/`delete`/`exists` —
 * none of which had any test before, in either direction.
 *
 * Do NOT reintroduce a computed specifier here. "The bundler must not see this"
 * and "the bundler must resolve this" are the same requirement for a module
 * that has to load at runtime, and only the literal satisfies it.
 */

interface S3Config {
  bucket: string;
  endpoint?: string; // R2: https://<account>.r2.cloudflarestorage.com
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string; // OPTIONAL future direct-CDN base; delivery uses the gated proxy by default.
}

function readConfig(): S3Config {
  const bucket = process.env.MEDIA_S3_BUCKET;
  const accessKeyId = process.env.MEDIA_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MEDIA_S3_SECRET_ACCESS_KEY;
  // MEDIA_S3_PUBLIC_BASE_URL is NOT required: media is served through the gated
  // /api/media proxy (private bucket), so the bucket's own public URL is never used
  // as the delivery base. The var is reserved for a future, separately-approved public
  // CDN that serves ONLY published derivatives (see CLOUDFLARE_R2_STORAGE_SETUP.md §5).
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3/R2 storage selected but MEDIA_S3_BUCKET / MEDIA_S3_ACCESS_KEY_ID / MEDIA_S3_SECRET_ACCESS_KEY are not configured.');
  }
  // R2/S3 custom endpoints are ORIGIN-only (bucket is addressed separately via `Bucket`).
  // Normalize to the origin so a mistakenly appended path like `…/nfr` cannot double the
  // bucket or break signing.
  let endpoint = process.env.MEDIA_S3_ENDPOINT || undefined;
  if (endpoint) { try { endpoint = new URL(endpoint).origin; } catch { /* leave as-is; SDK will error clearly */ } }
  return {
    bucket,
    endpoint,
    region: process.env.MEDIA_S3_REGION || 'auto',
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: (process.env.MEDIA_S3_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  };
}

export class S3StorageAdapter implements StorageAdapter {
  readonly provider: string;
  private cfg: S3Config | null = null;
  // Typed loosely on purpose — the real client is loaded at call time.
  private client: unknown = null;
  private cmds: Record<string, new (input: unknown) => unknown> = {};

  constructor(provider: 'r2' | 's3') {
    this.provider = provider;
  }

  private async ensure(): Promise<void> {
    if (this.client) return;
    this.cfg = readConfig();
    // Literal specifier: resolvable by the bundler, still loaded lazily (see the
    // note at the top of this file). The cast keeps the adapter's existing loose
    // typing — the client and commands are held as `unknown` by design.
    const sdk = (await import('@aws-sdk/client-s3')) as unknown as {
      S3Client: new (o: unknown) => unknown;
      PutObjectCommand: new (i: unknown) => unknown;
      GetObjectCommand: new (i: unknown) => unknown;
      DeleteObjectCommand: new (i: unknown) => unknown;
      HeadObjectCommand: new (i: unknown) => unknown;
    };
    this.cmds = sdk;
    this.client = new sdk.S3Client({
      region: this.cfg.region,
      endpoint: this.cfg.endpoint,
      credentials: { accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey },
    });
  }

  private send(name: string, input: unknown): Promise<unknown> {
    const Cmd = this.cmds[name];
    return (this.client as { send: (c: unknown) => Promise<unknown> }).send(new Cmd(input));
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoragePutResult> {
    assertSafeKey(key);
    await this.ensure();
    await this.send('PutObjectCommand', { Bucket: this.cfg!.bucket, Key: key, Body: body, ContentType: contentType });
    return { key, size: body.length };
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    await this.ensure();
    const res = (await this.send('GetObjectCommand', { Bucket: this.cfg!.bucket, Key: key })) as { Body: { transformToByteArray: () => Promise<Uint8Array> } };
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.ensure();
    try { await this.send('DeleteObjectCommand', { Bucket: this.cfg!.bucket, Key: key }); } catch { /* best-effort */ }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    await this.ensure();
    try { await this.send('HeadObjectCommand', { Bucket: this.cfg!.bucket, Key: key }); return true; } catch { return false; }
  }

  /**
   * Delivery URL for a stored object. Returns the visibility-GATED proxy path
   * (`/api/media/<key>`), NOT a direct bucket URL — so draft/private originals are
   * never exposed even when the R2 bucket has a public URL enabled. The bucket is kept
   * private and the proxy (`app/api/media/[...key]/route.ts`) streams bytes server-side
   * after enforcing the publication gate. A future public CDN for published derivatives
   * is a separate, approved mechanism (see CLOUDFLARE_R2_STORAGE_SETUP.md §5), not this.
   */
  publicUrl(key: string): string {
    assertSafeKey(key);
    return `/api/media/${key}`;
  }
}
