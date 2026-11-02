import 'server-only';
import { StorageAdapter, StoragePutResult, assertSafeKey } from './adapter';

/**
 * S3-compatible adapter (Batch 05 §3) — targets Cloudflare R2 (owner-approved),
 * AWS S3, or MinIO by configuration. The AWS SDK is imported lazily through a
 * variable specifier so the package is NOT a hard dependency: the local
 * foundation runs without it, and typecheck does not require it. To ACTIVATE:
 *   npm i @aws-sdk/client-s3
 *   set MEDIA_STORAGE_PROVIDER=r2 (or s3) + the MEDIA_S3_* env vars below.
 * This adapter is never exercised until a cloud provider is configured; it does
 * not claim production storage is operational on its own (see STORAGE_PROVIDER_DECISION.md).
 */
// Assembled at runtime so the bundler cannot statically resolve it — the AWS SDK
// is an optional dependency, installed only when a cloud provider is activated.
const SDK_SPECIFIER = ['@aws-sdk', 'client-s3'].join('/');

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
  return {
    bucket,
    endpoint: process.env.MEDIA_S3_ENDPOINT || undefined,
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
    // Variable specifier → not resolved by tsc; requires the SDK at runtime only.
    const spec = SDK_SPECIFIER;
    const sdk = (await import(spec)) as unknown as {
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
