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
 * ── STAGE 08 TASK D: WIRED AND CORRECTED ────────────────────────────────
 *
 * This harness had never been executed. Owner decision D-08 records it as "not
 * executed in Stage 01 or 02", and Stage 08's directive therefore begins Task D
 * with "First wire and verify the existing `test:cache` harness." Running it
 * revealed that it could not pass on either server:
 *
 *   - against `next start` (production), checks 4/5/6 failed. The harness
 *     promotes the article by calling `transitionWorkflow` DIRECTLY, bypassing
 *     the Server Action that calls `revalidatePath`, so the ISR cache was never
 *     busted and the newly published article stayed invisible.
 *   - against `next dev`, checks 1/7 failed. The dev server does not return 404
 *     for `notFound()`, so "a draft is not public" could not be observed.
 *
 * The old header note above asserted the production case worked "by the publish
 * Server Action's revalidatePath() calls" — but the harness never invokes that
 * action, so nothing busted the cache.
 *
 * THE FIX. An out-of-process script cannot call `revalidatePath`; that only
 * works inside a request. The application already exposes exactly one
 * mechanism for an external caller, and the scheduled-publish runner already
 * uses it: the authenticated `POST /api/internal/revalidate` endpoint. The
 * harness now calls it after each transition that changes publicness, which is
 * the same thing the deployed system does for a scheduled publish — no new
 * mechanism, no weakened guard.
 *
 * Usage (PRODUCTION server, which is the mode that proves the real contract):
 *
 *   cd apps/web
 *   export TEST_DATABASE_URL="<from .env>"
 *   export DATABASE_URL="$TEST_DATABASE_URL"
 *   export APP_ENV=test
 *   export INTERNAL_REVALIDATE_SECRET="<any value, same for server and script>"
 *   npx next build && npx next start -p 3100 &
 *   SMOKE_BASE_URL=http://localhost:3100 npm run test:cache
 *
 * Without `INTERNAL_REVALIDATE_SECRET` the harness says so and skips the
 * revalidation call rather than failing silently: the endpoint fails closed by
 * design (Stage 01), and pretending otherwise would be the kind of false green
 * this programme exists to remove.
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

    /**
     * Ask the RUNNING server to revalidate, the way the app does out of process.
     *
     * The endpoint's allow-list permits only '/', which it revalidates as a
     * layout — so this is a whole-site flush. That is correct here: the harness
     * is verifying the end-to-end visibility contract, not the precision of the
     * page-layout invalidation map (that is covered by
     * tests/stage08-cache-scope.test.ts, which asserts the exact calls each
     * Server Action makes).
     */
    const revalidateViaServer = async (why: string): Promise<void> => {
      const secret = process.env.INTERNAL_REVALIDATE_SECRET;
      if (!secret) {
        console.log(`  …  revalidation skipped (${why}): INTERNAL_REVALIDATE_SECRET not set — expect ISR checks to fail on a production server`);
        return;
      }
      try {
        const res = await fetch(`${BASE}/api/internal/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, path: '/' }),
          cache: 'no-store',
        });
        if (!res.ok) console.log(`  …  revalidation request failed (${why}): HTTP ${res.status}`);
      } catch (err) {
        console.log(`  …  revalidation request error (${why}): ${String(err)}`);
      }

      /**
       * Let the server finish regenerating before the next database write.
       *
       * The endpoint's allow-list permits only '/', revalidated as a layout, so
       * a production server regenerates all 69 static pages — each of which
       * queries the database. Without this wait the harness's NEXT interactive
       * transaction competes with that burst for the connection pool and
       * expires at Prisma's 5s default with P2028, which looks like a product
       * failure and is not one.
       *
       * Polling a cheap route until it answers promptly is the signal that the
       * burst has drained. Capped, so a genuinely wedged server still fails the
       * run rather than hanging it.
       */
      for (let i = 0; i < 40; i++) {
        const started = Date.now();
        try {
          await fetch(`${BASE}/robots.txt`, { cache: 'no-store' });
          if (Date.now() - started < 400) return;
        } catch { /* keep waiting */ }
        await sleep(500);
      }
      console.log(`  …  server did not settle after revalidation (${why}); continuing`);
    };

    // ---- Promote through the workflow to PUBLISHED ----
    let v = created.version;
    const r1 = await svc.transitionWorkflow(actor, articleId, 'IN_REVIEW', v); v = r1.version;
    const r2 = await svc.transitionWorkflow(actor, articleId, 'APPROVED', v); v = r2.version;
    const r3 = await svc.transitionWorkflow(actor, articleId, 'PUBLISHED', v); v = r3.version;
    check('   (workflow) transition to PUBLISHED reports becamePublic', r3.becamePublic === true);
    await revalidateViaServer('after PUBLISHED');

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
    await revalidateViaServer('after unpublish');

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
