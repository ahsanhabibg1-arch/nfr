#!/usr/bin/env node
/**
 * Issue 04-D — legacy-subcategory backfill CLI.
 *
 * DEFAULT BEHAVIOUR IS A DRY RUN. It reports exactly what it would do and
 * writes nothing. `--execute` is refused unless the mapping file carries a real
 * approval, so the unsafe path cannot be reached by forgetting a flag.
 *
 *   node scripts/backfill-subcategories.mjs                  # dry run
 *   node scripts/backfill-subcategories.mjs --execute        # needs APPROVED mapping
 *   node scripts/backfill-subcategories.mjs --mapping <path>
 *
 * The logic lives in `lib/cms/subcategoryBackfill.ts` so the test suite can
 * exercise it against synthetic fixtures in the isolated test database. This
 * file is only argument handling, the database target guard, and printing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const mappingArg = args[args.indexOf('--mapping') + 1];
const mappingPath = resolve(
  args.includes('--mapping') && mappingArg ? mappingArg : 'prisma/taxonomy/subcategory-mapping.json',
);

function fail(msg) {
  console.error(`\n  REFUSED: ${msg}\n`);
  process.exit(1);
}

/**
 * Target guard. A backfill is a data change, so the database it is pointed at
 * is checked before anything is read — not left to whatever `.env` happens to
 * hold. Production needs an explicit, separate opt-in that an owner must type.
 */
const url = process.env.DATABASE_URL ?? '';
if (!url) fail('DATABASE_URL is not set.');
const host = (url.match(/@([^/:]+)/) ?? [, '(unknown)'])[1];
const dbName = (url.match(/\/([^/?]+)(\?|$)/) ?? [, '(unknown)'])[1];
const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(host);
if (execute && !isLocal && process.env.BACKFILL_ALLOW_REMOTE !== 'I_HAVE_A_VERIFIED_BACKUP') {
  fail(
    `--execute against a NON-LOCAL database (${host}/${dbName}) requires\n` +
    '  BACKFILL_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP, and a verified restore (BKP-01).\n' +
    '  Run the dry run first and read its plan.',
  );
}

const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));

const { PrismaClient } = await import('@prisma/client');
const { runSubcategoryBackfill, BackfillError } = await import('../lib/cms/subcategoryBackfill.ts');
const prisma = new PrismaClient();

console.log('');
console.log(`  mapping : ${mappingPath}`);
console.log(`  database: ${host}/${dbName}${isLocal ? '  (local)' : '  (REMOTE)'}`);
console.log(`  mode    : ${execute ? 'EXECUTE — writes will be committed' : 'DRY RUN — nothing will be written'}`);
console.log(`  approval: ${mapping?.approval?.status ?? '(missing)'}`);
console.log('');

try {
  const report = await runSubcategoryBackfill(prisma, { mapping, dryRun: !execute });
  for (const item of report.plan) {
    const target = item.targetSlug ? ` -> ${item.targetSlug}${item.reusedExisting ? ' (existing)' : ''}` : '';
    console.log(`  ${item.action.padEnd(6)} ${item.categorySlug.padEnd(20)} "${item.legacyLabel}"${target}`);
    for (const s of item.articleSlugs) console.log(`         article: ${s}`);
    if (item.skipped) console.log(`         ${item.skipped}`);
  }
  console.log('');
  console.log(`  subcategories created : ${report.created}`);
  console.log(`  articles attached     : ${report.attached}`);
  console.log(`  articles retained     : ${report.retained}`);
  console.log(`  already attached      : ${report.alreadyAttached}`);
  console.log(`  protected fields unchanged: ${report.fingerprintUnchanged ? 'yes' : 'NO — INVESTIGATE'}`);
  if (report.errors.length) {
    console.log('\n  errors:');
    for (const e of report.errors) console.log(`    - ${e}`);
  }
  if (!execute) console.log('\n  This was a dry run. Nothing was written.\n');
  process.exit(report.fingerprintUnchanged ? 0 : 2);
} catch (e) {
  if (e instanceof BackfillError) fail(e.message);
  throw e;
} finally {
  await prisma.$disconnect();
}
