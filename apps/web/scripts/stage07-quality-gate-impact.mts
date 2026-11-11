/**
 * Stage 07 Task J — measure the impact of widening the test-quality gate.
 *
 * The Stage 06 handover found that the Stage 03 gate flags a source-text
 * assertion only when the test's NAME claims a RENDERING outcome ("renders",
 * "shows", "displays", "visible"). It does not flag one whose name claims a
 * BEHAVIOUR: "numProp clamps to min/max bounds", "idListProp handles array
 * input", "editor has three-panel layout". All three of those were pure
 * `expect(src).toContain(...)` assertions, and the gate never saw them — so the
 * grandfathered registry of 49 is a floor, not a census.
 *
 * The directive is explicit: "First measure the impact of expanding detection.
 * Do not blindly add hundreds of exemptions or turn unrelated tests red without
 * a migration plan."
 *
 * This script is that measurement. It changes nothing. It reports, per candidate
 * verb, how many currently-unflagged source-reading tests the verb would newly
 * flag, and lists them, so the decision to widen is taken on numbers.
 *
 * Run: npx tsx scripts/stage07-quality-gate-impact.mts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests');

/** The gate as Stage 03 shipped it. */
const CURRENT = /\b(renders?|shows?|displays?|rendered|visible)\b/i;
const READS_SOURCE = /readFileSync|\bread\(/;
const STRUCTURAL_MARKER = /\[structural\]/i;

/** The six verbs the Stage 06 handover nominated, measured one at a time. */
const CANDIDATES: Record<string, RegExp> = {
  clamps: /\bclamps?\b/i,
  handles: /\bhandles?\b/i,
  has: /\b(has|have)\b/i,
  supports: /\bsupports?\b/i,
  uses: /\buses?\b/i,
  includes: /\bincludes?\b/i,
};

interface TestTitle {
  file: string;
  title: string;
  key: string;
}

function collectSourceReadingTests(): TestTitle[] {
  const out: TestTitle[] = [];
  for (const file of fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.ts'))) {
    const src = fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
    if (!READS_SOURCE.test(src)) continue;
    for (const m of src.matchAll(/\bit\(\s*['"`]([^'"`]+)['"`]/g)) {
      const title = m[1];
      if (STRUCTURAL_MARKER.test(title)) continue;
      out.push({ file, title, key: `${file} :: ${title}` });
    }
  }
  return out;
}

const all = collectSourceReadingTests();
const alreadyFlagged = all.filter((t) => CURRENT.test(t.title));
const unflagged = all.filter((t) => !CURRENT.test(t.title));

console.log('=== Stage 07 Task J — quality gate widening impact ===\n');
console.log(`Test files that read product source : ${new Set(all.map((t) => t.file)).size}`);
console.log(`Source-reading test titles total    : ${all.length}`);
console.log(`Already flagged by the Stage 03 gate: ${alreadyFlagged.length}`);
console.log(`Not flagged today                   : ${unflagged.length}\n`);

const perVerb: { verb: string; count: number; hits: TestTitle[] }[] = [];
for (const [verb, re] of Object.entries(CANDIDATES)) {
  const hits = unflagged.filter((t) => re.test(t.title));
  perVerb.push({ verb, count: hits.length, hits });
}
perVerb.sort((a, b) => b.count - a.count);

console.log('--- NEW violations each candidate verb would introduce ---');
for (const { verb, count } of perVerb) {
  console.log(`  ${verb.padEnd(10)} ${String(count).padStart(4)}`);
}

const union = new Set<string>();
for (const { hits } of perVerb) for (const h of hits) union.add(h.key);
console.log(`\n  ALL SIX (union, de-duplicated): ${union.size}`);
console.log(`  Grandfathered baseline today  : 49`);
console.log(`  Baseline if all six adopted   : ${49 + union.size}\n`);

console.log('--- Per-file distribution of the union ---');
const byFile = new Map<string, number>();
for (const key of union) {
  const file = key.split(' :: ')[0];
  byFile.set(file, (byFile.get(file) ?? 0) + 1);
}
for (const [file, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${file}`);
}

/* ─────────────────────────────────────────────────────────────────────
 * The finding that matters more than the verb list
 * ───────────────────────────────────────────────────────────────────── */

/**
 * The Stage 03 gate decides "does this test rest on source text?" at FILE
 * level: if the file calls `readFileSync` or `read(` anywhere, every
 * behaviourally-named test in it is a violation. Many files are mixed — they
 * assert real behaviour in some tests and read source in others — so widening
 * the verb list amplifies false positives rather than finding real ones.
 *
 * This measures an assertion-level variant: look inside each `it(...)` body and
 * flag it only when THAT body actually asserts on source text.
 */
const SOURCE_ASSERTION =
  /expect\(\s*[A-Za-z_$][\w$]*(?:Src|Source|src)\b|expect\(\s*read\(|expect\(\s*fs\.readFileSync|toContain\(\s*['"`][^'"`]*['"`]\s*\)\s*;?\s*$/;

/** Crude but adequate body extraction: balance braces from the `it(` call. */
function bodyOf(src: string, startIdx: number): string {
  let depth = 0;
  let i = src.indexOf('{', startIdx);
  if (i < 0) return '';
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return src.slice(from);
}

interface Scoped extends TestTitle {
  assertsOnSource: boolean;
}

function collectScoped(): Scoped[] {
  const out: Scoped[] = [];
  for (const file of fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.ts'))) {
    const src = fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
    if (!READS_SOURCE.test(src)) continue;
    for (const m of src.matchAll(/\bit\(\s*['"`]([^'"`]+)['"`]/g)) {
      const title = m[1];
      if (STRUCTURAL_MARKER.test(title)) continue;
      const body = bodyOf(src, m.index! + m[0].length);
      out.push({
        file,
        title,
        key: `${file} :: ${title}`,
        assertsOnSource: /expect\([^)]*\b(src|Src|Source)\b/.test(body) || SOURCE_ASSERTION.test(body),
      });
    }
  }
  return out;
}

const scoped = collectScoped();
const WIDE = /\b(renders?|shows?|displays?|rendered|visible|clamps?|handles?|supports?)\b/i;

console.log('\n=== Assertion-level detection (the structural finding) ===\n');
const fileLevelCurrent = scoped.filter((t) => CURRENT.test(t.title));
const asrtLevelCurrent = fileLevelCurrent.filter((t) => t.assertsOnSource);
console.log(`Current verbs, FILE-level      : ${fileLevelCurrent.length}  (today's gate)`);
console.log(`Current verbs, ASSERTION-level : ${asrtLevelCurrent.length}`);
console.log(`  -> false positives removed   : ${fileLevelCurrent.length - asrtLevelCurrent.length}`);

const fileLevelWide = scoped.filter((t) => WIDE.test(t.title));
const asrtLevelWide = fileLevelWide.filter((t) => t.assertsOnSource);
console.log(`\nWidened verbs (+clamps/handles/supports), FILE-level      : ${fileLevelWide.length}`);
console.log(`Widened verbs (+clamps/handles/supports), ASSERTION-level : ${asrtLevelWide.length}`);
console.log(
  `  -> NEW real violations vs today's gate: ${
    asrtLevelWide.filter((t) => !CURRENT.test(t.title)).length
  }`,
);

console.log('\n--- The NEW real violations the widened, assertion-level gate finds ---');
for (const t of asrtLevelWide.filter((x) => !CURRENT.test(x.title))) console.log(`   ${t.key}`);

console.log('\n--- Full list, by verb (file-level, for reference) ---');
for (const { verb, hits } of perVerb) {
  if (hits.length === 0) continue;
  console.log(`\n[${verb}] ${hits.length}`);
  for (const h of hits) console.log(`   ${h.key}`);
}
