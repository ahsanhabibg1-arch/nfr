/**
 * NFRGuide — HTTP-level publish / unpublish cache-invalidation check (Batch 04 §3 / §17.25).
 *
 * Drives the REAL HTTP surface of a running server through a full publish →
 * unpublish cycle and asserts, over HTTP, that the public site reflects each
 * state change. It mints an ephemeral administrator + DB session (no password —
 * the same server-side session-minting the integration tests use), creates a
 * throwaway draft, promotes it through the editorial workflow, and GETs the
 * public URLs before/after each transition. All eight observable points are
 * checked; any hard failure exits non-zero. The ephemeral admin + article are
 * always removed in teardown.
 *
 * Caching note: in `next dev` public routes render on demand, so this proves the
 * end-to-end visibility contract (draft hidden → published visible → unpublished
 * hidden) at the HTTP layer. The production ISR cache is busted by the publish
 * Server Action's `revalidatePath()` calls (see app/admin/article-actions.ts),
 * which carry the same observable effect to a built server.
 *
 * Usage: start the app (`npm run dev` or `npm run start`), then
 *   npm run test:cache
 */

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { requireIsolatedScriptDatabase } from '../tests/support/testDbGuard';
import { fileURLToPath } from 'node:url';

// Neutralize `server-only` so the real server modules import cleanly under tsx.
// Must run before the dynamic imports of lib/db / the services below.
register('./server-only-hook.mjs', import.meta.url);

// ---- Load DATABASE_URL from .env into this process (server reads its own env) ----
const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '.env');
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

// Batch A (A8): this script WRITES (users, sessions, articles). It only ever targets an
// explicit isolated test database — never the development or production database.
try {
  process.env.DATABASE_URL = requireIsolatedScriptDatabase(process.env, 'cache-invalidation');
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;
const fails: string[] = [];
function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const rid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll a path until it returns the expected status (tolerates dev on-demand compile). */
async function waitForStatus(pathname: string, expected: number, timeoutMs = 20000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}${pathname}`, { redirect: 'manual', cache: 'no-store' });
      last = res.status;
      if (res.status === expected) return res.status;
    } catch { /* server still compiling */ }
    await sleep(750);
  }
  return last;
}

async function main() {
  console.log(`\nHTTP publish/unpublish cache-invalidation check against ${BASE}\n`);

  // Confirm the server is reachable first.
  try {
    const ping = await fetch(`${BASE}/`, { cache: 'no-store' });
    if (!ping.ok) throw new Error(`status ${ping.status}`);
  } catch (e) {
    console.error(`Server not reachable at ${BASE}. Start it with "npm run dev" (or "npm run start") first.\n${(e as Error).message}`);
    process.exit(2);
  }

  const { prisma } = await import('../lib/db');
  const svc = await import('../lib/cms/articleService');
  const session = await import('../lib/auth/session');
  const roleSync = await import('../lib/auth/roleSync');
  await roleSync.syncRolesAndPermissions(prisma);

  const slug = `cachetest-${rid()}`;
  const publicPath = `/articles/${slug}/`;
  const sectionPath = '/competition/';
  let adminId = '';
  let articleId = '';
  let token = '';

  try {
    // ---- Setup: ephemeral administrator + DB session + draft article ----
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' } });
    const admin = await prisma.user.create({ data: { email: `cachetest-admin-${rid()}@example.com`, name: 'Cache Test Admin', status: 'ACTIVE' } });
    adminId = admin.id;
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
    ({ token } = await session.createSession(admin.id));
    const actor = { id: admin.id, roles: ['administrator'] as const } as unknown as svc.ActorContext;

    const created = await svc.saveArticle(actor, {
      slug,
      title: `Cache Invalidation Probe ${rid()}`,
      excerpt: 'A valid editorial excerpt that is long enough to satisfy the publication gate checks for this probe.',
      blocks: [
        { type: 'paragraph', text: 'Opening paragraph with a reasonable number of words for the publication gate.' },
        { type: 'heading', level: 2, text: 'Probe Section Heading' },
      ],
      categoryName: 'NFR Competition',
      authorName: 'Cache Probe Desk',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured probe photograph.',
    } as svc.ArticleInput);
    articleId = created.id;
    const title = (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).title;

    // ---- 1. Draft is private over HTTP ----
    check('1. draft article is NOT public (HTTP 404)', (await waitForStatus(publicPath, 404, 25000)) === 404);

    // ---- 2. Admin gate (unauthenticated) ----
    {
      const res = await fetch(`${BASE}/admin/`, { redirect: 'manual', cache: 'no-store' });
      const loc = res.headers.get('location') || '';
      check('2. /admin/ without a session is redirected to login', res.status >= 300 && res.status < 400 && loc.includes('/admin/login'), `status ${res.status} loc ${loc}`);
    }

    // ---- 3. Admin dashboard reachable WITH the minted session cookie ----
    {
      const res = await fetch(`${BASE}/admin/`, { headers: { cookie: `nfrguide_session=${token}` }, redirect: 'manual', cache: 'no-store' });
      check('3. /admin/ WITH a valid session returns 200 (session honored over HTTP)', res.status === 200, `status ${res.status}`);
    }

    // ---- Promote through the workflow to PUBLISHED ----
    let v = created.version;
    const r1 = await svc.transitionWorkflow(actor, articleId, 'IN_REVIEW', v); v = r1.version;
    const r2 = await svc.transitionWorkflow(actor, articleId, 'APPROVED', v); v = r2.version;
    const r3 = await svc.transitionWorkflow(actor, articleId, 'PUBLISHED', v); v = r3.version;
    check('   (workflow) transition to PUBLISHED reports becamePublic', r3.becamePublic === true);

    // ---- 4/5. Published article visible over HTTP, with its content ----
    check('4. published article is reachable (HTTP 200)', (await waitForStatus(publicPath, 200, 25000)) === 200);
    {
      const body = await (await fetch(`${BASE}${publicPath}`, { cache: 'no-store' })).text();
      check('5. published article HTML contains its title', body.includes(title), 'title not found in HTML');
    }

    // ---- 6. Section listing reflects the newly published article ----
    {
      let found = false;
      for (let i = 0; i < 10 && !found; i++) {
        const body = await (await fetch(`${BASE}${sectionPath}`, { cache: 'no-store' })).text();
        found = body.includes(slug) || body.includes(title);
        if (!found) await sleep(750);
      }
      check('6. section listing (/competition/) shows the published article', found, 'slug/title not present in section HTML');
    }

    // ---- Unpublish (PUBLISHED → DRAFT) ----
    const r4 = await svc.transitionWorkflow(actor, articleId, 'DRAFT', v); v = r4.version;
    check('   (workflow) transition to DRAFT reports becamePrivate', r4.becamePrivate === true);

    // ---- 7. Unpublished article 404s again over HTTP ----
    check('7. unpublished article is removed from public (HTTP 404)', (await waitForStatus(publicPath, 404, 25000)) === 404);

    // ---- 8. Section listing no longer shows it ----
    {
      let gone = false;
      for (let i = 0; i < 10 && !gone; i++) {
        const body = await (await fetch(`${BASE}${sectionPath}`, { cache: 'no-store' })).text();
        gone = !body.includes(slug);
        if (!gone) await sleep(750);
      }
      check('8. section listing no longer shows the unpublished article', gone, 'slug still present in section HTML after unpublish');
    }
  } finally {
    // ---- Teardown: always remove the ephemeral article + admin (cascades session/roles) ----
    try { if (articleId) await prisma.article.delete({ where: { id: articleId } }); } catch { /* ignore */ }
    try { if (adminId) await prisma.user.delete({ where: { id: adminId } }); } catch { /* ignore */ }
    await prisma.$disconnect();
  }

  console.log(`\nCache-invalidation check: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error('FAILURES:\n' + fails.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => { console.error('Cache-invalidation runner error:', err); process.exit(1); });
