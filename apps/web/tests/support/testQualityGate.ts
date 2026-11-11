/**
 * The test-quality gate's detection logic, as one shared implementation
 * (Stage 07 Task J).
 *
 * WHY IT MOVED HERE
 *
 * Stage 03 embedded this logic inside `stage03-test-quality-gate.test.ts`, so
 * the only way to ask "what would a stricter gate flag?" was to edit the gate
 * and run it. Stage 07 had to answer that question before changing anything —
 * the directive requires measuring the impact first — so the detection now
 * lives in a module that both the gate and
 * `scripts/stage07-quality-gate-impact.mts` import. One implementation, so a
 * measurement cannot disagree with enforcement.
 *
 * WHAT STAGE 07 CHANGED, AND WHY
 *
 * 1. DETECTION IS NOW ASSERTION-LEVEL, NOT FILE-LEVEL.
 *
 *    Stage 03 asked "does this FILE call readFileSync anywhere?" and, if so,
 *    flagged every behaviourally-named test in it. Most of these files are
 *    mixed: they assert real rendered output in some tests and read source in
 *    others. Measured over the 29 source-reading files, 22 of the 47 tests the
 *    old gate flagged did not assert on source text at all — they were false
 *    positives, and grandfathering them taught readers to ignore the register.
 *
 *    The pattern that made this undeniable: Stage 07 Task F converted
 *    `batch-e-directory.test.ts`'s misleading tests into real ones that render
 *    blocks through `renderToStaticMarkup`. The old gate flagged those
 *    conversions as violations, because the file still reads source elsewhere.
 *    A gate that punishes the fix it exists to encourage is the wrong gate.
 *
 * 2. THE VERB LIST IS WIDENED BY THREE, NOT SIX.
 *
 *    The Stage 06 handover nominated six: clamps, handles, has, supports, uses,
 *    includes. Measured impact, file-level, over the current suite:
 *
 *      has       75     uses     57     handles  18
 *      includes  13     supports 10     clamps    1
 *      union (de-duplicated): 172, which would take the baseline from 49 to 221
 *
 *    `has`, `uses` and `includes` were rejected on the evidence. Their hits are
 *    overwhelmingly legitimate structural claims about files that are the right
 *    thing to assert in source text — "has pageKey field", "has unique
 *    constraint on (pageKey, revisionNo)", "service Zod schema includes id
 *    field". Flagging them would add ~145 exemptions describing correct tests,
 *    which is precisely the "hundreds of exemptions" the directive forbids.
 *
 *    `clamps`, `handles` and `supports` claim a COMPUTED OUTCOME — that code,
 *    given an input, does a thing. A source substring cannot prove that. These
 *    three add 22 real violations at assertion level, and all three verbs appear
 *    in the examples the Stage 06 handover gave as the gap it had found.
 *
 *    Net effect: the same 47 flagged tests as before, but an accurate 47 instead
 *    of a set that was 47% wrong in both directions.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Verbs whose claim a source substring cannot prove.
 *
 * The first group is Stage 03's: what a user would SEE. The second is Stage 07's
 * addition: what the code DOES with an input.
 */
export const BEHAVIOURAL_TITLE =
  /\b(renders?|shows?|displays?|rendered|visible|clamps?|handles?|supports?)\b/i;

/** Stage 03's original, narrower list. Kept so the widening stays measurable. */
export const STAGE_03_BEHAVIOURAL_TITLE = /\b(renders?|shows?|displays?|rendered|visible)\b/i;

/** How a test file reads product source in order to assert on its text. */
export const READS_SOURCE = /readFileSync|\bread\(/;

/** An explicit opt-out for a test that is deliberately and visibly structural. */
export const STRUCTURAL_MARKER = /\[structural\]/i;

export interface Violation {
  file: string;
  title: string;
  key: string;
}

/**
 * Every identifier in a file that holds product SOURCE TEXT.
 *
 * Found by following the assignment, not by guessing the name. The first
 * implementation keyed off names ending in `src`/`Source` and missed two whole
 * classes of real violation: `expect(src)` — because the pattern required a
 * character before the suffix — and `expect(editor)`, where the variable holding
 * the file contents is named after the thing it contains rather than after what
 * it is. Both were genuine source-text assertions in the grandfathered set, so
 * an under-detecting gate would have quietly let them out of the register.
 *
 * Declarations are collected from the WHOLE file, because these files typically
 * read a file once at `describe` scope and assert on it in many tests.
 */
export function sourceVariables(src: string): Set<string> {
  const names = new Set<string>();
  // const editor = read('views/...')   |   const s = fs.readFileSync(p, 'utf8')
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:read\(|fs\.readFileSync\(|readFileSync\()/g)) {
    names.add(m[1]);
  }
  // Destructured or re-assigned aliases of an already-known source variable.
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g)) {
    if (names.has(m[2])) names.add(m[1]);
  }
  return names;
}

/**
 * Does this test BODY rest on a source-text assertion?
 *
 * True when it asserts directly on a `read(...)` call, or on any variable the
 * file derived from one. A test that reads source to build a fixture but
 * asserts on RENDERED output is not flagged — which is the whole point of
 * moving from file level to assertion level, and what lets a converted test
 * stop being a violation the moment it is converted.
 */
export function assertsOnSourceText(body: string, sourceVars: Set<string> = new Set()): boolean {
  if (/expect\(\s*(?:read\(|fs\.readFileSync|readFileSync\()/.test(body)) return true;
  for (const name of sourceVars) {
    // `expect(editor)`, `expect(src.slice(...))`, `expect(editorSrc, 'msg')`
    const re = new RegExp(`expect\\(\\s*${name}\\b`);
    if (re.test(body)) return true;
  }
  return false;
}

/** Extract the balanced `{ … }` body that follows an `it(` match. */
export function bodyAfter(src: string, fromIndex: number): string {
  let i = src.indexOf('{', fromIndex);
  if (i < 0) return '';
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

export interface CollectOptions {
  /** Which verb list to apply. Defaults to the Stage 07 widened list. */
  titlePattern?: RegExp;
  /**
   * `true` (default) restricts violations to tests whose own body asserts on
   * source text. `false` reproduces Stage 03's file-level behaviour, which the
   * impact script uses for the before/after comparison.
   */
  assertionLevel?: boolean;
}

/** Every test that claims a behaviour it does not actually prove. */
export function collectViolations(testsDir: string, options: CollectOptions = {}): Violation[] {
  const titlePattern = options.titlePattern ?? BEHAVIOURAL_TITLE;
  const assertionLevel = options.assertionLevel ?? true;
  const out: Violation[] = [];

  for (const file of fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.ts'))) {
    const src = fs.readFileSync(path.join(testsDir, file), 'utf8');
    if (!READS_SOURCE.test(src)) continue;
    const sourceVars = sourceVariables(src);
    for (const m of src.matchAll(/\bit\(\s*['"`]([^'"`]+)['"`]/g)) {
      const title = m[1];
      if (!titlePattern.test(title)) continue;
      if (STRUCTURAL_MARKER.test(title)) continue;
      if (assertionLevel && !assertsOnSourceText(bodyAfter(src, m.index! + m[0].length), sourceVars)) continue;
      out.push({ file, title, key: `${file} :: ${title}` });
    }
  }
  return out;
}
