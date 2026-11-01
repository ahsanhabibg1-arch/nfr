/**
 * NFRGuide — authenticated admin-route smoke (Batch 04 regression).
 * Mints an ephemeral super_admin + DB session and GETs each Batch 04 admin
 * module route over HTTP, asserting a 200 render (not a redirect or 500).
 * Confirms the new server pages + client views compile and render with data.
 * Usage: start the app, then `tsx scripts/admin-auth-smoke.mts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

register('./server-only-hook.mjs', import.meta.url);

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

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const ROUTES = ['/admin/', '/admin/articles/', '/admin/rodeo-coverage/', '/admin/editorial-organization/', '/admin/sources/', '/admin/website/', '/admin/media/', '/admin/seo/', '/admin/analytics/', '/admin/monetization/', '/admin/team/', '/admin/settings/', '/admin/account/', '/admin/landing-seo/'];

async function main() {
  const { prisma } = await import('../lib/db');
  const roleSync = await import('../lib/auth/roleSync');
  await roleSync.syncRolesAndPermissions(prisma);

  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  const user = await prisma.user.create({ data: { email: `adminsmoke-${Math.random().toString(36).slice(2, 8)}@example.com`, name: 'Admin Smoke', status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3600_000) } });

  let failed = 0;
  console.log(`\nAuthenticated admin-route smoke against ${BASE}\n`);
  try {
    for (const r of ROUTES) {
      const res = await fetch(`${BASE}${r}`, { headers: { cookie: `nfrguide_session=${token}` }, redirect: 'manual', cache: 'no-store' });
      const ok = res.status === 200;
      if (!ok) failed++;
      console.log(`  ${ok ? '✓' : '✗'} GET ${r} -> ${res.status}`);
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
  console.log(`\nAdmin smoke: ${ROUTES.length - failed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error('Admin smoke error:', e); process.exit(1); });
