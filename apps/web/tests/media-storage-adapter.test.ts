import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as MediaSvc from '../lib/cms/mediaService';

/**
 * MED-01A — the R2/S3 storage adapter, and the upload route's status codes.
 *
 * WHY THIS FILE EXISTS. Before it, `tests/r2-storage.test.ts` covered only
 * `publicUrl()` and key validation — one of its tests even asserts that building
 * a delivery URL needs no credentials. `put()`, `get()`, `delete()` and
 * `exists()` had **no test at any level, not even against a mocked SDK**, which
 * is precisely how a production-only failure survived: the adapter's dynamic
 * import of the AWS SDK was compiled into a stub that threw
 * `Cannot find module as expression is too dynamic`, and nothing in the suite
 * ever asked the adapter to talk to a client.
 *
 * Only the AWS SDK is mocked here. Everything else — the adapter, the upload
 * service, its cleanup path, the route — is the real code.
 */

// `vi.hoisted` because the mock factory below is hoisted above these bindings.
const h = vi.hoisted(() => ({
  /** Every command the adapter sent, in order. */
  sent: [] as { name: string; input: Record<string, unknown> }[],
  /** Lets a test make the Nth PutObject fail (0 = never). */
  failPutAtCall: { n: 0 },
  /** Constructor options the S3Client was built with. */
  clientOptions: [] as Record<string, unknown>[],
  putCalls: { n: 0 },
}));

vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  class HeadObjectCommand extends Command {}

  class S3Client {
    constructor(opts: Record<string, unknown>) {
      h.clientOptions.push(opts);
    }
    async send(cmd: Command): Promise<unknown> {
      const name = cmd.constructor.name;
      h.sent.push({ name, input: cmd.input });
      if (name === 'PutObjectCommand') {
        h.putCalls.n += 1;
        if (h.failPutAtCall.n && h.putCalls.n === h.failPutAtCall.n) {
          const e = new Error('Access Denied') as Error & { name: string; Code: string };
          e.name = 'AccessDenied';
          e.Code = 'AccessDenied';
          throw e;
        }
        return {};
      }
      if (name === 'GetObjectCommand') {
        return { Body: { transformToByteArray: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } };
      }
      if (name === 'HeadObjectCommand') {
        if (String(cmd.input.Key).includes('missing')) {
          const e = new Error('Not Found') as Error & { name: string };
          e.name = 'NotFound';
          throw e;
        }
        return { ContentLength: 4 };
      }
      return {};
    }
  }

  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand };
});

const R2_ENV = {
  MEDIA_STORAGE_PROVIDER: 'r2',
  MEDIA_S3_BUCKET: 'nfr-test-bucket',
  MEDIA_S3_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com',
  MEDIA_S3_REGION: 'auto',
  MEDIA_S3_ACCESS_KEY_ID: 'test-key-id',
  MEDIA_S3_SECRET_ACCESS_KEY: 'test-secret',
};
function stubR2Env(over: Record<string, string> = {}): void {
  for (const [k, v] of Object.entries({ ...R2_ENV, ...over })) vi.stubEnv(k, v);
}

function reset(): void {
  h.sent.length = 0;
  h.clientOptions.length = 0;
  h.failPutAtCall.n = 0;
  h.putCalls.n = 0;
}

beforeEach(reset);
afterAll(() => { vi.unstubAllEnvs(); });

const names = (): string[] => h.sent.map((s) => s.name);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

// ---------------------------------------------------------------------------
// 1. The SDK module itself loads from a literal specifier.
// ---------------------------------------------------------------------------

describe('MED-01A (1) AWS SDK module loading', () => {
  it('REGRESSION: a literal dynamic import of the SDK resolves', async () => {
    // The production defect was that this import could not be resolved at all.
    // Here the module registry serves the mock, which still proves the
    // specifier is statically analysable — an unanalysable one cannot be mocked.
    const sdk = await import('@aws-sdk/client-s3');
    for (const key of ['S3Client', 'PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand', 'HeadObjectCommand']) {
      expect(typeof (sdk as unknown as Record<string, unknown>)[key]).toBe('function');
    }
  });

  it('REGRESSION: the adapter source contains no computed module specifier', () => {
    const raw = readFileSync(resolve(__dirname, '../lib/media/storage/s3.ts'), 'utf8');
    // Comments are stripped first: the file deliberately DOCUMENTS the old
    // broken form, and prose explaining a defect must not read as the defect.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    // The exact shape of the old defect, and any near relative of it.
    expect(code).not.toMatch(/await import\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\)/);
    expect(code).not.toMatch(/\[\s*'@aws-sdk'\s*,/);
    expect(code).toContain("await import('@aws-sdk/client-s3')");
  });

  it('the real package is installed as a resolvable dependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
    expect(pkg.dependencies['@aws-sdk/client-s3']).toBeTruthy();
    expect(pkg.devDependencies?.['@aws-sdk/client-s3']).toBeUndefined();
    expect(existsSync(resolve(__dirname, '../node_modules/@aws-sdk/client-s3/package.json'))).toBe(true);
  });

  it('the bundler is told to keep it external rather than bundle it', () => {
    const cfg = readFileSync(resolve(__dirname, '../next.config.mjs'), 'utf8');
    expect(cfg).toMatch(/serverExternalPackages:\s*\[[^\]]*'@aws-sdk\/client-s3'/);
  });
});

// ---------------------------------------------------------------------------
// 2. Adapter initialisation.
// ---------------------------------------------------------------------------

describe('MED-01A (2) S3 adapter initialisation', () => {
  it('builds the client with the configured region, endpoint and credentials', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    await new S3StorageAdapter('r2').put('2026/11/abc.png', PNG_BYTES, 'image/png');
    expect(h.clientOptions).toHaveLength(1);
    expect(h.clientOptions[0]).toMatchObject({
      region: 'auto',
      endpoint: 'https://acct123.r2.cloudflarestorage.com',
      credentials: { accessKeyId: 'test-key-id', secretAccessKey: 'test-secret' },
    });
  });

  it('normalises an endpoint that mistakenly carries a path to its origin', async () => {
    stubR2Env({ MEDIA_S3_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com/nfr-test-bucket/' });
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    await new S3StorageAdapter('r2').put('2026/11/abc.png', PNG_BYTES, 'image/png');
    expect(h.clientOptions[0].endpoint).toBe('https://acct123.r2.cloudflarestorage.com');
  });

  it('defaults the region to auto (correct for R2)', async () => {
    stubR2Env({ MEDIA_S3_REGION: '' });
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    await new S3StorageAdapter('r2').put('2026/11/abc.png', PNG_BYTES, 'image/png');
    expect(h.clientOptions[0].region).toBe('auto');
  });

  it('refuses to initialise — with a NAMED cause — when required config is absent', async () => {
    stubR2Env({ MEDIA_S3_BUCKET: '' });
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    await expect(new S3StorageAdapter('r2').put('2026/11/a.png', PNG_BYTES, 'image/png')).rejects.toThrow(
      /MEDIA_S3_BUCKET/,
    );
    expect(names()).toEqual([]); // nothing was sent
  });

  it('the client is created once and reused across operations', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const a = new S3StorageAdapter('r2');
    await a.put('2026/11/a.png', PNG_BYTES, 'image/png');
    await a.get('2026/11/a.png');
    await a.delete('2026/11/a.png');
    expect(h.clientOptions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3-6. The four storage operations.
// ---------------------------------------------------------------------------

describe('MED-01A (3) PutObject — success', () => {
  it('sends bucket, key, body and content type, and reports the stored size', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const res = await new S3StorageAdapter('r2').put('2026/11/photo.jpg', PNG_BYTES, 'image/jpeg');
    expect(res).toEqual({ key: '2026/11/photo.jpg', size: PNG_BYTES.length });
    expect(names()).toEqual(['PutObjectCommand']);
    expect(h.sent[0].input).toMatchObject({
      Bucket: 'nfr-test-bucket',
      Key: '2026/11/photo.jpg',
      ContentType: 'image/jpeg',
    });
    expect(h.sent[0].input.Body).toBe(PNG_BYTES);
  });

  it('rejects an unsafe key BEFORE sending anything', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const a = new S3StorageAdapter('r2');
    for (const key of ['../secrets.env', '/abs/path.png', '2026/../../x.png']) {
      await expect(a.put(key, PNG_BYTES, 'image/png')).rejects.toThrow();
    }
    expect(names()).toEqual([]);
  });
});

describe('MED-01A (4) PutObject — rejection', () => {
  it('propagates the SDK error so the caller can report and clean up', async () => {
    stubR2Env();
    h.failPutAtCall.n = 1;
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    await expect(new S3StorageAdapter('r2').put('2026/11/a.png', PNG_BYTES, 'image/png')).rejects.toMatchObject({
      name: 'AccessDenied',
    });
    // The error is NOT swallowed: an upload must never look successful.
    expect(names()).toEqual(['PutObjectCommand']);
  });
});

describe('MED-01A (5) GetObject', () => {
  it('returns the object bytes as a Buffer', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const buf = await new S3StorageAdapter('r2').get('2026/11/a.png');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect([...buf]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(h.sent[0].input).toMatchObject({ Bucket: 'nfr-test-bucket', Key: '2026/11/a.png' });
  });
});

describe('MED-01A (6) DeleteObject and HeadObject', () => {
  it('delete sends the command', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    await new S3StorageAdapter('r2').delete('2026/11/a.png');
    expect(names()).toEqual(['DeleteObjectCommand']);
    expect(h.sent[0].input).toMatchObject({ Bucket: 'nfr-test-bucket', Key: '2026/11/a.png' });
  });

  it('delete is best-effort: an SDK failure does not throw (cleanup must not mask the real error)', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const a = new S3StorageAdapter('r2');
    // Force the send to fail by removing the command constructor.
    const broken = a as unknown as { cmds: Record<string, unknown> };
    await a.delete('2026/11/warm.png'); // initialise first
    reset();
    broken.cmds = {};
    await expect(a.delete('2026/11/a.png')).resolves.toBeUndefined();
  });

  it('exists reports true for a present object and false for a missing one', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const a = new S3StorageAdapter('r2');
    await expect(a.exists('2026/11/present.png')).resolves.toBe(true);
    await expect(a.exists('2026/11/missing.png')).resolves.toBe(false);
  });

  it('publicUrl still returns the GATED proxy path, never a bucket URL', async () => {
    stubR2Env();
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const url = new S3StorageAdapter('r2').publicUrl('2026/11/a.png');
    expect(url).toBe('/api/media/2026/11/a.png');
    expect(url).not.toContain('r2.cloudflarestorage.com');
    expect(names()).toEqual([]); // needs no client at all
  });
});

// ---------------------------------------------------------------------------
// 8. Route status classification.
// ---------------------------------------------------------------------------

vi.mock('../lib/cms/guard', () => ({
  getActor: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../lib/auth/rbac', async (orig) => {
  const actual = await orig<typeof import('../lib/auth/rbac')>();
  return { ...actual, roleHasPermission: vi.fn() };
});
vi.mock('../lib/auth/durableRateLimit', () => ({
  checkDurableRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0, storageError: false })),
}));
vi.mock('../lib/cms/mediaService', () => ({
  uploadMedia: vi.fn(),
}));

describe('MED-01A (8) upload route — honest status codes', () => {
  async function callRoute(): Promise<Response> {
    const { POST } = await import('../app/api/admin/media/upload/route');
    const form = new FormData();
    form.append('file', new File([PNG_BYTES], 'photo.png', { type: 'image/png' }));
    const { NextRequest } = await import('next/server');
    return POST(new NextRequest(new Request('https://nfrguide.com/api/admin/media/upload/', { method: 'POST', body: form })));
  }

  async function withServiceError(code: string): Promise<Response> {
    const guard = await import('../lib/cms/guard');
    const rbac = await import('../lib/auth/rbac');
    const svc = await import('../lib/cms/mediaService');
    const { ServiceError } = await import('../lib/cms/articleService');
    vi.mocked(guard.getActor).mockResolvedValue({ id: 'u1', roles: ['administrator'] } as Actor);
    vi.mocked(rbac.roleHasPermission).mockReturnValue(true);
    vi.mocked(svc.uploadMedia).mockRejectedValue(new ServiceError(code as never, `boom:${code}`));
    return callRoute();
  }

  it('REGRESSION: a storage failure is 500, not 400 — it is a server fault', async () => {
    const res = await withServiceError('storage');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: 'storage' });
    expect(body.error).toBe('boom:storage');
  });

  it('a processing failure is 422 (well-formed request, unprocessable content)', async () => {
    expect((await withServiceError('processing')).status).toBe(422);
  });

  it('validation stays 400', async () => {
    expect((await withServiceError('validation')).status).toBe(400);
  });

  it('forbidden stays 403 and not_found stays 404', async () => {
    expect((await withServiceError('forbidden')).status).toBe(403);
    expect((await withServiceError('not_found')).status).toBe(404);
  });

  it('conflict is 409 and rate_limited is 429', async () => {
    expect((await withServiceError('conflict')).status).toBe(409);
    expect((await withServiceError('rate_limited')).status).toBe(429);
  });

  it('an unexpected (non-ServiceError) failure stays a generic 500 with no internals leaked', async () => {
    const guard = await import('../lib/cms/guard');
    const rbac = await import('../lib/auth/rbac');
    const svc = await import('../lib/cms/mediaService');
    vi.mocked(guard.getActor).mockResolvedValue({ id: 'u1', roles: ['administrator'] } as Actor);
    vi.mocked(rbac.roleHasPermission).mockReturnValue(true);
    vi.mocked(svc.uploadMedia).mockRejectedValue(new Error('secret internal detail'));
    const res = await callRoute();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Upload failed.');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });

  it('a successful upload is 200 and returns the asset id', async () => {
    const guard = await import('../lib/cms/guard');
    const rbac = await import('../lib/auth/rbac');
    const svc = await import('../lib/cms/mediaService');
    vi.mocked(guard.getActor).mockResolvedValue({ id: 'u1', roles: ['administrator'] } as Actor);
    vi.mocked(rbac.roleHasPermission).mockReturnValue(true);
    vi.mocked(svc.uploadMedia).mockResolvedValue({ id: 'm1', duplicate: false });
    const res = await callRoute();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, id: 'm1', duplicate: false });
  });
});

// ---------------------------------------------------------------------------
// 9. Authentication and authorization are unchanged.
// ---------------------------------------------------------------------------

describe('MED-01A (9) auth and RBAC on the upload route are unchanged', () => {
  async function call(): Promise<Response> {
    const { POST } = await import('../app/api/admin/media/upload/route');
    const { NextRequest } = await import('next/server');
    const form = new FormData();
    form.append('file', new File([PNG_BYTES], 'photo.png', { type: 'image/png' }));
    return POST(new NextRequest(new Request('https://nfrguide.com/api/admin/media/upload/', { method: 'POST', body: form })));
  }

  it('an unauthenticated request is 401 and never reaches the service', async () => {
    const guard = await import('../lib/cms/guard');
    const svc = await import('../lib/cms/mediaService');
    vi.mocked(guard.getActor).mockResolvedValue(null);
    vi.mocked(svc.uploadMedia).mockClear();
    const res = await call();
    expect(res.status).toBe(401);
    expect(svc.uploadMedia).not.toHaveBeenCalled();
  });

  it('a signed-in user without media.upload is 403 and never reaches the service', async () => {
    const guard = await import('../lib/cms/guard');
    const rbac = await import('../lib/auth/rbac');
    const svc = await import('../lib/cms/mediaService');
    vi.mocked(guard.getActor).mockResolvedValue({ id: 'u2', roles: ['seo_manager'] } as Actor);
    vi.mocked(rbac.roleHasPermission).mockReturnValue(false);
    vi.mocked(svc.uploadMedia).mockClear();
    const res = await call();
    expect(res.status).toBe(403);
    expect(svc.uploadMedia).not.toHaveBeenCalled();
  });

  it('a rate-limiter storage outage is 503 with Retry-After, not a 429', async () => {
    const guard = await import('../lib/cms/guard');
    const rbac = await import('../lib/auth/rbac');
    const rl = await import('../lib/auth/durableRateLimit');
    vi.mocked(guard.getActor).mockResolvedValue({ id: 'u1', roles: ['administrator'] } as Actor);
    vi.mocked(rbac.roleHasPermission).mockReturnValue(true);
    vi.mocked(rl.checkDurableRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30, storageError: true });
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  it('a genuine threshold hit is 429', async () => {
    const guard = await import('../lib/cms/guard');
    const rbac = await import('../lib/auth/rbac');
    const rl = await import('../lib/auth/durableRateLimit');
    vi.mocked(guard.getActor).mockResolvedValue({ id: 'u1', roles: ['administrator'] } as Actor);
    vi.mocked(rbac.roleHasPermission).mockReturnValue(true);
    vi.mocked(rl.checkDurableRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12, storageError: false });
    const res = await call();
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({ code: 'rate_limited' });
  });
});

// ---------------------------------------------------------------------------
// 7 + build. Production-output verification.
// ---------------------------------------------------------------------------

/**
 * A unit test cannot prove the bundler resolved the specifier — the module
 * registry serves a mock either way. So this block inspects the BUILT server
 * output instead, which is the artifact that actually failed in production.
 *
 * It is skipped when `.next/server` is absent (a bare `vitest run` on a clean
 * checkout), and the report records that limitation rather than implying the
 * check always runs. `npm run build` first to exercise it.
 */
const BUILD_DIR = resolve(__dirname, '../.next/server');
const built = existsSync(BUILD_DIR);
const buildSuite = built ? describe : describe.skip;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

buildSuite('MED-01A (build) the SDK is resolvable from the production server output', () => {
  const chunks = built ? walk(BUILD_DIR) : [];

  it('no chunk contains the dynamic-specifier failure marker', () => {
    const offenders = chunks.filter((f) => readFileSync(f, 'utf8').includes('as expression is too dynamic'));
    expect(offenders.map((f) => f.replace(BUILD_DIR, ''))).toEqual([]);
  });

  it('at least one chunk references the SDK by its literal name', () => {
    const hits = chunks.filter((f) => readFileSync(f, 'utf8').includes('@aws-sdk/client-s3'));
    expect(hits.length).toBeGreaterThan(0);
  });

  it('the referenced package actually resolves on disk from the app root', () => {
    // The built server requires it externally, so resolution must succeed here.
    expect(existsSync(resolve(__dirname, '../node_modules/@aws-sdk/client-s3/package.json'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. End-to-end: the real upload service against the mocked SDK, including the
//    cleanup path. DB-gated, self-skipping — mirrors tests/media.test.ts.
// ---------------------------------------------------------------------------

let dbAvailable = false;
let prisma: PrismaClient;
let media: typeof MediaSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
}

const e2e = dbAvailable ? describe : describe.skip;

e2e('MED-01A (7) uploadMedia against the mocked R2 SDK — success and cleanup', () => {
  const createdIds: string[] = [];
  const userIds: string[] = [];
  const rid = () => Math.random().toString(36).slice(2, 8);
  const rc = () => Math.floor(Math.random() * 256);
  const jpg = () =>
    sharp({ create: { width: 1400, height: 900, channels: 3, background: { r: rc(), g: rc(), b: rc() } } })
      .jpeg()
      .toBuffer();

  async function admin(): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' as RoleKey } });
    const u = await prisma.user.create({
      data: { email: `med01a-${rid()}@example.com`, name: 'MED-01A', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: ['administrator' as RoleKey] };
  }

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.mediaAsset.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('REGRESSION: an upload now completes through the R2 adapter end to end', async () => {
    stubR2Env();
    vi.doUnmock('../lib/cms/mediaService');
    vi.resetModules();
    media = await import('../lib/cms/mediaService');
    reset();

    const actor = await admin();
    const res = await media.uploadMedia(actor, { buffer: await jpg(), originalName: 'rodeo.jpg', declaredMime: 'image/jpeg' });
    createdIds.push(res.id);

    expect(res.duplicate).toBe(false);
    // One original plus the derivatives sharp produced — all PutObject, no failure.
    const puts = h.sent.filter((s) => s.name === 'PutObjectCommand');
    expect(puts.length).toBeGreaterThanOrEqual(2);
    expect(h.sent.some((s) => s.name === 'DeleteObjectCommand')).toBe(false);

    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.storageProvider).toBe('r2');
    expect(row.url).toBe(`/api/media/${row.storageKey}`);
    expect(row.visibility).toBe('DRAFT');
    expect(row.rightsConfirmed).toBe(false);
    expect(row.processingStatus).toBe('READY');
    expect(row.width).toBeGreaterThan(0);
  });

  it('REGRESSION: a mid-upload storage rejection cleans up every written object and records no row', async () => {
    stubR2Env();
    reset();
    h.failPutAtCall.n = 2; // the original succeeds, the first derivative is denied

    const actor = await admin();
    const before = await prisma.mediaAsset.count();
    await expect(
      media.uploadMedia(actor, { buffer: await jpg(), originalName: 'denied.jpg', declaredMime: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: 'storage' });

    const puts = h.sent.filter((s) => s.name === 'PutObjectCommand');
    const deletes = h.sent.filter((s) => s.name === 'DeleteObjectCommand');
    expect(puts.length).toBe(2);
    // Exactly the objects that were successfully written get deleted.
    expect(deletes.length).toBe(1);
    expect(deletes[0].input.Key).toBe(puts[0].input.Key);
    // And nothing was persisted.
    expect(await prisma.mediaAsset.count()).toBe(before);
  });

  it('deduplication still short-circuits before any storage write', async () => {
    stubR2Env();
    const actor = await admin();
    const bytes = await jpg();
    reset();
    const first = await media.uploadMedia(actor, { buffer: bytes, originalName: 'dup.jpg', declaredMime: 'image/jpeg' });
    createdIds.push(first.id);
    const writes = h.sent.filter((s) => s.name === 'PutObjectCommand').length;

    reset();
    const second = await media.uploadMedia(actor, { buffer: bytes, originalName: 'dup-again.jpg', declaredMime: 'image/jpeg' });
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(h.sent.filter((s) => s.name === 'PutObjectCommand')).toHaveLength(0);
    expect(writes).toBeGreaterThan(0);
  });
});
