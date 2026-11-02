/**
 * NFRGuide — Cloudflare R2 activation verification (safe, read/write of ONE temp object).
 *
 * Reads MEDIA_S3_* from apps/web/.env. Verifies bucket access + a full round-trip on a
 * single uniquely-named object under the dedicated `__verify/` prefix, then deletes it.
 * NEVER lists, reads, overwrites or deletes any unrelated object. Redacts all secrets.
 *
 *   npx tsx scripts/r2-verify.mts
 */
import { register } from 'node:module';
register('./server-only-hook.mjs', import.meta.url);
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const envPath = path.join(root, '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const bucket = process.env.MEDIA_S3_BUCKET || '';
let endpoint = process.env.MEDIA_S3_ENDPOINT || '';
try { endpoint = new URL(endpoint).origin; } catch { /* reported below */ }
const region = process.env.MEDIA_S3_REGION || 'auto';

function redactHost(h: string): string { const f = (h.replace(/^https?:\/\//, '').split('.')[0]) || ''; return `${f.slice(0, 6)}….r2.cloudflarestorage.com`; }

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}${d ? ` — ${d}` : ''}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

async function main() {
  console.log('Cloudflare R2 verification (redacted)');
  console.log(`  bucket: ${bucket} | endpoint: ${endpoint ? redactHost(endpoint) : '(invalid)'} | region: ${region}`);
  ok('config present (bucket + endpoint + creds)', !!(bucket && endpoint && process.env.MEDIA_S3_ACCESS_KEY_ID && process.env.MEDIA_S3_SECRET_ACCESS_KEY));
  if (fail) { console.log('\nAborting — configuration incomplete.'); process.exit(2); }

  const { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ region, endpoint, credentials: { accessKeyId: process.env.MEDIA_S3_ACCESS_KEY_ID!, secretAccessKey: process.env.MEDIA_S3_SECRET_ACCESS_KEY! } });

  // 1) Bucket access + auth (HeadBucket — no object data read)
  try { await client.send(new HeadBucketCommand({ Bucket: bucket })); ok('bucket access + credentials valid (HeadBucket)', true); }
  catch (e: unknown) { const name = (e as { name?: string }).name || String(e); ok('bucket access + credentials valid (HeadBucket)', false, name); console.log('\nStopping — cannot access the bucket with these credentials.'); process.exit(1); }

  // 2) Round-trip on ONE unique temp object under __verify/
  const id = crypto.randomUUID();
  const key = `__verify/${id}.txt`;
  const payload = Buffer.from(`nfrguide-r2-verify ${id} ${new Date().toISOString()}`);
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: payload, ContentType: 'text/plain' }));
    ok('upload temp object (PutObject)', true, key);

    const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = Buffer.from(await (got.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
    const gotSha = crypto.createHash('sha256').update(bytes).digest('hex');
    ok('download + byte-for-byte integrity (GetObject, SHA-256 match)', gotSha === sha);

    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    ok('object exists (HeadObject)', true);

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    ok('authorized delete of the temp object (DeleteObject)', true);

    let goneConfirmed = false;
    try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); }
    catch { goneConfirmed = true; }
    ok('temp object is gone after delete', goneConfirmed);
  } catch (e: unknown) {
    const name = (e as { name?: string }).name || String(e);
    ok('round-trip (put/get/delete) on temp object', false, name);
    // Best-effort cleanup so no temp object is left behind.
    try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { /* ignore */ }
  }

  console.log(`\nR2 verification: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('verify error:', (e as Error).message); process.exit(1); });
