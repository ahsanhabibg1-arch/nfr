/**
 * NFRGuide — idempotent seeding of the Batch 10 RodeoHubEvent junction.
 * Links each seeded recurring event to its hub (from the mock data's hubId), without
 * importing any `server-only` module (safe under plain tsx). Create-missing-only; safe
 * to re-run; touches nothing else.
 *
 * Usage: `npx tsx scripts/seed-rodeo-links.mts`
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECURRING_RODEO_EVENTS, RODEO_HUBS } from '../data/mockEditorialData';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function main() {
  const db = new PrismaClient();
  let linked = 0;
  // Map mock hub id (e.g. 'hub-canada') -> seeded hub id (`hub-<slug>`).
  const seededHubId = new Map<string, string>();
  for (const h of RODEO_HUBS as { id: string; slug?: string; title: string }[]) {
    seededHubId.set(h.id, `hub-${h.slug || slugify(h.title)}`);
  }
  try {
    for (const e of RECURRING_RODEO_EVENTS as { slug?: string; name: string; hubId?: string }[]) {
      if (!e.hubId) continue;
      const hubId = seededHubId.get(e.hubId) ?? e.hubId;
      const eventId = `event-${e.slug || slugify(e.name)}`;
      const [hub, event] = await Promise.all([
        db.rodeoHub.findUnique({ where: { id: hubId }, select: { id: true } }),
        db.rodeoEvent.findUnique({ where: { id: eventId }, select: { id: true } }),
      ]);
      if (!hub || !event) continue;
      await db.rodeoHubEvent
        .upsert({ where: { hubId_eventId: { hubId, eventId } }, update: {}, create: { hubId, eventId } })
        .then(() => { linked++; })
        .catch(() => {});
    }
    console.log(`RodeoHubEvent links ensured: ${linked}`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
