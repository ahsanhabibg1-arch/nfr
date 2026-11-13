/**
 * Batch 04-E — Article Type registry bootstrap (CLI).
 *
 *   npm run bootstrap:article-types                 # DRY RUN (default)
 *   npm run bootstrap:article-types -- --execute    # write
 *   npm run bootstrap:article-types -- --verify     # completeness only
 *
 * DRY RUN IS THE DEFAULT and `--execute` is the only way to write, because the
 * step after this one in the rollout is "deploy code that stops needing the
 * fallback" — so an operator must be able to read the plan first.
 *
 * NON-LOCAL TARGETS ARE REFUSED unless
 * `BOOTSTRAP_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP` is set. The guard is about
 * attention, not permission: this writes to a production database, and BKP-01
 * (the restore rehearsal) is a stated blocker for production schema work.
 *
 * It only ever INSERTS missing definitions. Running it twice is a no-op, and it
 * never alters an administrator's later changes, any existing ArticleType row,
 * or any Article row.
 *
 * RUN IT WITH `tsx`, not bare node. It imports the application's own bootstrap
 * module so there is exactly one definition of what "the 23 definitions" means,
 * and that module's import graph reaches `types/index.ts` through extensionless
 * specifiers that Node's ESM resolver cannot follow. `tsx` is already how this
 * repository runs its other TypeScript script (`bootstrap:admin`).
 */
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { bootstrapArticleTypes, verifyArticleTypeRegistry } from '../lib/cms/articleTypeBootstrap';

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
      const v = await verifyArticleTypeRegistry(prisma);
      console.log(`\ncomplete : ${v.ok ? 'YES' : 'NO'}`);
      if (v.missing.length) console.log(`missing  : ${v.missing.join(', ')}`);
      if (v.miscased.length) console.log(`miscased : ${v.miscased.join(', ')}`);
      process.exit(v.ok ? 0 : 2);
    }

    const report = await bootstrapArticleTypes(prisma, { apply: execute });
    console.log('');
    for (const row of report.rows) {
      const mark = row.outcome === 'created' ? (execute ? 'created' : 'would create') : row.outcome;
      console.log(`  ${mark.padEnd(13)} ${row.value}${row.reason ? `  — ${row.reason}` : ''}`);
    }
    console.log('');
    console.log(`created   : ${report.created}${execute ? '' : ' (dry run — nothing written)'}`);
    console.log(`present   : ${report.present}`);
    console.log(`conflicts : ${report.conflicts}`);
    if (report.tombstoned.length) {
      console.log(`tombstoned: ${report.tombstoned.join(', ')} (deleted by an administrator — not recreated)`);
    }
    if (report.unmanaged.length) {
      console.log(`unmanaged : ${report.unmanaged.join(', ')} (administrator additions — left alone)`);
    }
    console.log(`complete  : ${report.complete ? 'YES' : 'NO'}`);

    if (report.conflicts > 0) {
      console.error('\nConflicts present: resolve them by hand. Values are immutable and are never rewritten here.');
      process.exit(2);
    }
    if (!execute) console.log('\nRe-run with --execute to apply.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
