/**
 * Batch 05 — Discipline Classification registry bootstrap (CLI).
 *
 *   npm run bootstrap:classifications                 # DRY RUN (default)
 *   npm run bootstrap:classifications -- --execute    # write
 *   npm run bootstrap:classifications -- --verify     # completeness only
 *
 * DRY RUN IS THE DEFAULT and `--execute` is the only way to write, so an
 * operator can read the plan before any row changes.
 *
 * NON-LOCAL TARGETS ARE REFUSED unless
 * `BOOTSTRAP_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP` is set — the same guard, for
 * the same reason, as `bootstrap-article-types`: this writes to a production
 * database, and a verified restorable backup (BKP-01) is a stated prerequisite
 * for production schema and data work. The guard is about attention, not
 * permission.
 *
 * It only ever INSERTS classifications and links disciplines whose
 * `classificationId` is still NULL. It never writes `Discipline.category`,
 * never alters an existing classification, and never undoes an administrator's
 * later reassignment.
 *
 * RUN IT WITH `tsx`, not bare node — the same reason as the Article Type
 * script: the imported module graph uses extensionless specifiers that Node's
 * ESM resolver cannot follow.
 */
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import {
  bootstrapDisciplineClassifications,
  verifyClassificationRegistry,
} from '../lib/cms/disciplineClassificationBootstrap';

const argv = process.argv.slice(2);
const execute = argv.includes('--execute');
const verifyOnly = argv.includes('--verify');

function describeTarget(raw: string): { host: string; port: string; db: string; local: boolean } {
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: u.port || '5432',
      db: u.pathname.replace(/^\//, ''),
      local: ['localhost', '127.0.0.1', '::1'].includes(u.hostname),
    };
  } catch {
    return { host: '<unparseable>', port: '?', db: '?', local: false };
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Refusing to run.');
    process.exit(1);
  }
  const target = describeTarget(url);
  console.log(`target : ${target.host}:${target.port}/${target.db}  ${target.local ? '(local)' : '(REMOTE)'}`);
  console.log(`mode   : ${verifyOnly ? 'VERIFY' : execute ? 'EXECUTE' : 'DRY RUN'}`);

  if (execute && !target.local && process.env.BOOTSTRAP_ALLOW_REMOTE !== 'I_HAVE_A_VERIFIED_BACKUP') {
    console.error(
      '\nREFUSING: --execute against a non-local database requires\n' +
        '  BOOTSTRAP_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP\n' +
        'Confirm a verified, restorable backup (BKP-01) before setting it.',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    if (verifyOnly) {
      const v = await verifyClassificationRegistry(prisma);
      console.log(`\ncomplete : ${v.ok ? 'YES' : 'NO'}`);
      if (v.missing.length) console.log(`missing  : ${v.missing.join(', ')}`);
      for (const d of v.danglingLegacy) {
        console.log(`dangling : "${d.category}" on ${d.disciplines} discipline(s) matches no classification`);
      }
      process.exit(v.ok ? 0 : 2);
    }

    const r = await bootstrapDisciplineClassifications(prisma, { apply: execute });
    console.log('');
    console.log(`created          : ${r.created.length ? r.created.join(', ') : 'none (all present)'}`);
    console.log(`attached         : ${r.attached}`);
    console.log(`already attached : ${r.alreadyAttached}`);
    console.log(`unclassified     : ${r.unclassified}  (no classification text — left alone)`);
    for (const u of r.unmatched) {
      console.log(`UNMATCHED        : "${u.category}" on ${u.disciplines} discipline(s) — not created, review manually`);
    }
    console.log('');
    console.log(execute ? 'Applied.' : 'Dry run only — nothing was written. Re-run with --execute to apply.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
