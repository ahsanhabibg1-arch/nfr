/**
 * NFRGuide — legacy repair of the Batch 10 RodeoHubEvent junction for databases that still
 * hold the Phase 0 demo hubs/events (ids `hub-<slug>` / `event-<slug>`).
 *
 * What it does: for each demo event in data/mockEditorialData.ts that names a hub, it links
 * the EXISTING hub and event rows (create-missing-only). It never creates, edits, publishes
 * or deletes any hub, event, edition or article — so no demo text or figures can become
 * public through it. If the rows are absent (e.g. a database seeded with the neutral Batch A
 * seed), it does nothing.
 *
 * Safety (Batch B):
 *  - DRY RUN by default: prints what it would link. Pass `--apply` to write.
 *  - Refuses non-local, cloud and production targets (requireLocalNonProductionDatabase).
 *  - Imports no `server-only` module (safe under plain tsx).
 *
 * Usage: `npx tsx scripts/seed-rodeo-links.mts [--apply]`
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECURRING_RODEO_EVENTS, RODEO_HUBS } from '../data/mockEditorialData';
import { requireLocalNonProductionDatabase } from '../tests/support/testDbGuard';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

let target: string;
try {
  target = requireLocalNonProductionDatabase(process.env, 'seed-rodeo-links');
} catch (e) {
  console.error((e as Error).message);
  process.exit(2);
}
const APPLY = process.argv.includes('--apply');

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Pure plan: which (hubId, eventId) pairs the demo data describes. */
export function plannedLinks(): { hubId: string; eventId: string }[] {
  const seededHubId = new Map<string, string>();
  for (const h of RODEO_HUBS as { id: string; slug?: string; title: string }[]) seededHubId.set(h.id, `hub-${h.slug || slugify(h.title)}`);
  return (RECURRING_RODEO_EVENTS as { slug?: string; name: string; hubId?: string }[])
    .filter((e) => !!e.hubId)
    .map((e) => ({ hubId: seededHubId.get(e.hubId!) ?? e.hubId!, eventId: `event-${e.slug || slugify(e.name)}` }));
}

async function main() {
  const db = new PrismaClient();
  let linked = 0;
  let wouldLink = 0;
  let skipped = 0;
  try {
    for (const { hubId, eventId } of plannedLinks()) {
      const [hub, event] = await Promise.all([
        db.rodeoHub.findUnique({ where: { id: hubId }, select: { id: true } }),
        db.rodeoEvent.findUnique({ where: { id: eventId }, select: { id: true } }),
      ]);
      if (!hub || !event) { skipped++; continue; }
      if (!APPLY) { wouldLink++; console.log(`  would link ${hubId} ↔ ${eventId}`); continue; }
      await db.rodeoHubEvent
        .upsert({ where: { hubId_eventId: { hubId, eventId } }, update: {}, create: { hubId, eventId } })
        .then(() => { linked++; })
        .catch(() => {});
    }
    console.log(APPLY
      ? `RodeoHubEvent links ensured on ${target}: ${linked} (skipped ${skipped} absent pairs)`
      : `DRY RUN on ${target}: would ensure ${wouldLink} link(s), ${skipped} absent pair(s). Re-run with --apply to write.`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
