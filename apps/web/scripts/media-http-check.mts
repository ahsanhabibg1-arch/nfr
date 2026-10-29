/**
 * NFRGuide — HTTP media end-to-end check (Batch 05 §17/§19).
 * Drives the real HTTP surface: authenticated upload, visibility-gated serving,
 * and the publish → public-render path. Mints an ephemeral admin + DB session,
 * uploads through POST /api/admin/media/upload, verifies the serve route gates
 * draft media, then confirms rights + publishes an article using the asset and
 * checks the public article page renders it. Cleans up. Run against a running
 * server (dev or `npm run start`).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

register('./server-only-hook.mjs', import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '.env');
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue;
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = '') => { if (ok) { pass++; console.log(`  ✓ ${n}`); } else { fail++; fails.push(`${n}${d ? ` — ${d}` : ''}`); console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const rid = () => Math.random().toString(36).slice(2, 8);

async function main() {
  try { const p = await fetch(`${BASE}/`); if (!p.ok) throw new Error(String(p.status)); }
  catch (e) { console.error(`Server not reachable at ${BASE}: ${(e as Error).message}`); process.exit(2); }

  const { prisma } = await import('../lib/db');
  const media = await import('../lib/cms/mediaService');
  const article = await import('../lib/cms/articleService');
  const roleSync = await import('../lib/auth/roleSync');
  await roleSync.syncRolesAndPermissions(prisma);

  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' } });
  const user = await prisma.user.create({ data: { email: `mediahttp-${rid()}@example.com`, name: 'Media HTTP', status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.session.create({ data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600_000) } });
  const cookie = `nfrguide_session=${token}`;

  const actor = { id: user.id, roles: ['administrator'] as const } as unknown as import('../lib/cms/articleService').ActorContext;
  let mediaId = ''; let slug = ''; let articleId = '';
  console.log(`\nHTTP media end-to-end against ${BASE}\n`);
  try {
    const buf = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 30, g: 120, b: 60 } } }).png().toBuffer();

    // 1. Unauthenticated upload is rejected.
    {
      const fd = new FormData(); fd.append('file', new File([buf], 'p.png', { type: 'image/png' }));
      const res = await fetch(`${BASE}/api/admin/media/upload/`, { method: 'POST', body: fd });
      check('1. upload without a session → 401', res.status === 401, `status ${res.status}`);
    }
    // 2. Authenticated upload succeeds.
    {
      const fd = new FormData(); fd.append('file', new File([buf], 'probe.png', { type: 'image/png' }));
      const res = await fetch(`${BASE}/api/admin/media/upload/`, { method: 'POST', headers: { cookie }, body: fd });
      const j = await res.json().catch(() => ({}));
      check('2. authenticated upload → 200 + id', res.status === 200 && j.ok && !!j.id, `status ${res.status} body ${JSON.stringify(j)}`);
      mediaId = j.id;
      if (!mediaId) { console.error('Upload did not return an id — aborting downstream checks.'); return; }
    }
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    const serveKey = row.storageKey;
    // 3. Draft media: anonymous serve 404, authenticated serve 200.
    {
      const anon = await fetch(`${BASE}/api/media/${serveKey}`);
      check('3a. draft asset not served anonymously → 404', anon.status === 404, `status ${anon.status}`);
      const auth = await fetch(`${BASE}/api/media/${serveKey}`, { headers: { cookie } });
      check('3b. draft asset served to CMS user → 200 image', auth.status === 200 && (auth.headers.get('content-type') || '').startsWith('image/'), `status ${auth.status}`);
    }
    // 4. Confirm rights + publish an article that uses it as the featured image.
    await media.confirmRights({ id: user.id, roles: ['administrator'] }, mediaId, 'OWNED', true);
    slug = `mediahttp-${rid()}`;
    const created = await article.saveArticle(actor, {
      slug, title: 'Media HTTP Featured Dispatch',
      excerpt: 'A valid editorial excerpt long enough to satisfy the publication gate checks for this media HTTP probe.',
      blocks: [{ type: 'paragraph', text: 'Opening paragraph with enough words to pass the publication gate checks.' }, { type: 'heading', level: 2, text: 'Section' }],
      categoryName: 'NFR Competition', authorName: 'Media HTTP Desk',
      imageRightsStatus: 'Staff Photo', imageAltText: 'A descriptive alt text for the featured probe photograph.',
      heroImage: row.url,
    } as import('../lib/cms/articleService').ArticleInput);
    articleId = created.id;
    const r1 = await article.transitionWorkflow(actor, created.id, 'IN_REVIEW', created.version);
    const r2 = await article.transitionWorkflow(actor, created.id, 'APPROVED', r1.version);
    const r3 = await article.transitionWorkflow(actor, created.id, 'PUBLISHED', r2.version);
    check('4. article with the asset as featured image publishes', r3.becamePublic === true);
    // 5. After publish the asset is promoted to PUBLIC and served anonymously.
    {
      const anon = await fetch(`${BASE}/api/media/${serveKey}`, { cache: 'no-store' });
      check('5. published asset now served anonymously → 200', anon.status === 200, `status ${anon.status}`);
    }
    // 6. The public article page renders the asset URL.
    {
      const html = await (await fetch(`${BASE}/articles/${slug}/`, { cache: 'no-store' })).text();
      check('6. public article HTML references the media URL', html.includes(row.url), 'media url not found in article HTML');
    }
  } finally {
    if (articleId) await prisma.article.delete({ where: { id: articleId } }).catch(() => {});
    if (mediaId) await prisma.mediaAsset.delete({ where: { id: mediaId } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(`\nHTTP media check: ${pass} passed, ${fail} failed\n`);
  if (fail) { console.error('FAILURES:\n' + fails.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
}
main().catch((e) => { console.error('runner error:', e); process.exit(1); });
