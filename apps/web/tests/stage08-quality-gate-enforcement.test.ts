import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { collectViolations } from './support/testQualityGate';
import legacyBaseline from './support/stage03LegacyStructuralTests.json';

/**
 * Stage 08 Task J — CARRIED-FORWARD MUTATION GAP 2, closed.
 *
 * Stage 03 created the test-quality gate and Stage 07 widened and sharpened it,
 * but both handovers recorded the same gap:
 *
 *   "the test quality gate is self-tested against synthetic titles but no
 *    deliberately-bad test file has proved it blocks one end to end."
 *
 * Every prior test of the gate fed STRINGS to its regexes. That proves the
 * regex matches, not that the gate would actually stop a bad test file landing
 * in `tests/` — which is the only thing anyone cares about. The difference
 * matters: Stage 07 found the detector silently missing `expect(src)` and
 * `expect(editor)` precisely because it had only ever been tested on synthetic
 * titles.
 *
 * This file closes it. Each test WRITES a real test file into `tests/`, runs the
 * real detection over the real directory, and asserts the outcome — then removes
 * the file in `afterEach`, including on failure.
 *
 * It does not invoke a nested Vitest run. The gate's enforcement is
 * `collectViolations(...).filter(not in baseline)` being non-empty, which is
 * exactly what `stage03-test-quality-gate.test.ts` asserts must be `[]`. Showing
 * that a planted file makes that set non-empty shows the gate would fail the
 * suite, without the cost and flakiness of a recursive runner.
 */

const TESTS_DIR = path.resolve(__dirname);
const BASELINE = new Set(legacyBaseline as string[]);

/** Files this suite planted, removed after each test whatever happens. */
const planted: string[] = [];

/**
 * The token `it(` is assembled at runtime, never written literally in this file.
 *
 * This is not a stylistic choice. The gate scans every `tests/*.test.ts` for
 * `it('...')` and this file reads product source, so a planted body written as a
 * literal template string would make the gate flag THIS file's planted titles
 * as real violations — which it duly did on the first run. Composing the token
 * keeps the planted bodies invisible to the scan until they are on disk as
 * their own file, which is the only place they should be seen.
 */
const IT = `${'i'}${'t'}(`;

/** Build a planted test case from a title and a body. */
function testCase(title: string, body: string): string {
  return `  ${IT}'${title}', () => {\n${body}\n  });\n`;
}

function plant(name: string, header: string, cases: string): string {
  const file = path.join(TESTS_DIR, name);
  fs.writeFileSync(file, `${header}\ndescribe('planted', () => {\n${cases}});\n`, 'utf8');
  planted.push(file);
  return name;
}

/** Imports + a source read, the shape of a file the gate inspects. */
function headerReading(relPath: string, varName = 'src'): string {
  return [
    "import { describe, it, expect } from 'vitest';",
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    `const ${varName} = fs.readFileSync(path.join(__dirname, '..', '${relPath}'), 'utf8');`,
  ].join('\n');
}

afterEach(() => {
  while (planted.length) {
    const f = planted.pop()!;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

/** The violations a planted file introduces that the baseline does not excuse. */
function newViolationsIn(fileName: string): string[] {
  return collectViolations(TESTS_DIR)
    .filter((v) => v.file === fileName)
    .filter((v) => !BASELINE.has(v.key))
    .map((v) => v.key);
}

/* ── The gate blocks a genuinely bad file ─────────────────────────── */

describe('Stage 08 Task J — the gate blocks a deliberately-bad test file', () => {
  it('flags a rendering claim proved by a source substring', () => {
    /**
     * The archetype. This is the exact shape of
     * `batch-t4-quick-access-helptext.test.ts`'s false pass: a test named for
     * what a user would SEE, proved by searching a whole file for a string that
     * appears in unrelated branches.
     */
    const name = plant(
      'zz-stage08-planted-bad-render.test.ts',
      headerReading('lib/cms/pageLayoutService.ts'),
      testCase('renders the save button', "    expect(src).toContain('saveDraft');"),
    );
    const found = newViolationsIn(name);
    expect(found, 'the gate must flag this file').toHaveLength(1);
    expect(found[0]).toContain('renders the save button');
  });

  it('flags a behaviour claim proved by a source substring (the Stage 07 widening)', () => {
    // `clamps`, `handles` and `supports` were added in Stage 07 Task J after
    // the Stage 06 handover found the gate blind to them.
    const name = plant(
      'zz-stage08-planted-bad-behaviour.test.ts',
      headerReading('lib/cms/slotProps.ts', 'editor'),
      testCase('numProp clamps to the declared bounds', "    expect(editor).toContain('Math.min');")
        + testCase('idListProp handles an array input', "    expect(editor).toContain('Array.isArray');")
        + testCase('the reader supports a comma string', "    expect(editor).toContain('split');"),
    );
    const found = newViolationsIn(name);
    expect(found, 'all three behavioural verbs must be caught').toHaveLength(3);
    expect(found.join(' ')).toContain('clamps');
    expect(found.join(' ')).toContain('handles');
    expect(found.join(' ')).toContain('supports');
  });

  it('catches the variable-name shapes the first Stage 07 detector missed', () => {
    /**
     * REGRESSION TEST FOR A REAL BUG. Stage 07's first assertion-level detector
     * keyed off names ending in `Src`/`Source` and missed `expect(src)` — the
     * pattern needed a character before the suffix — and `expect(editor)`,
     * named after what it contains rather than what it is. Both were genuine
     * violations already in the register, so an under-detecting gate would have
     * quietly released them.
     */
    const name = plant(
      'zz-stage08-planted-varnames.test.ts',
      headerReading('lib/logger.ts')
        + "\nconst editor = fs.readFileSync(path.join(__dirname, '..', 'lib', 'logger.ts'), 'utf8');",
      testCase('shows the short name', "    expect(src).toContain('log');")
        + testCase('displays the editor name', "    expect(editor).toContain('log');"),
    );
    const found = newViolationsIn(name);
    expect(found, 'both naming shapes must be caught').toHaveLength(2);
  });

  it('flags a file that asserts directly on read(), with no variable at all', () => {
    const name = plant(
      'zz-stage08-planted-direct.test.ts',
      [
        "import { describe, it, expect } from 'vitest';",
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        "const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');",
      ].join('\n'),
      testCase('renders the footer tagline', "    expect(read('components/SiteFooter.tsx')).toContain('tagline');"),
    );
    expect(newViolationsIn(name)).toHaveLength(1);
  });
});

/* ── ...and lets good files through ───────────────────────────────── */

describe('Stage 08 Task J — the gate does NOT block a legitimate file', () => {
  it('passes a behaviourally-named test that asserts rendered output', () => {
    /**
     * The other half of a usable gate, and the half the Stage 03 file-level
     * version got wrong: it flagged Stage 07's own correct conversions, because
     * the FILE read source elsewhere. A gate that punishes the remedy is worse
     * than no gate.
     */
    const name = plant(
      'zz-stage08-planted-good-render.test.ts',
      headerReading('lib/logger.ts'),
      testCase(
        'renders the expected markup',
        [
          // Uses the source read for SETUP only. The first attempt wrote
          // `expect(src.length).toBeGreaterThan(0)`, and the detector flagged it
          // — correctly, because that IS an assertion on source text. A
          // legitimate test may READ source; it may not ASSERT on it.
          "    const marker = src.length > 0 ? 'hello' : 'missing';",
          '    const html = `<p>${marker}</p>`;',
          "    expect(html).toContain('hello');",
        ].join('\n'),
      ),
    );
    expect(newViolationsIn(name), 'asserting on rendered output must not be flagged').toEqual([]);
  });

  it('passes a structural claim that is honestly named', () => {
    const name = plant(
      'zz-stage08-planted-good-structural.test.ts',
      headerReading('prisma/schema.prisma'),
      testCase('schema declares the PageLayout version column', "    expect(src).toContain('version');"),
    );
    expect(newViolationsIn(name)).toEqual([]);
  });

  it('passes a rendering claim that carries the [structural] opt-out', () => {
    const name = plant(
      'zz-stage08-planted-good-optout.test.ts',
      headerReading('lib/logger.ts'),
      testCase('renders a log line [structural]', "    expect(src).toContain('log');"),
    );
    expect(newViolationsIn(name)).toEqual([]);
  });

  it('passes a file that never reads product source', () => {
    const name = plant(
      'zz-stage08-planted-good-nosource.test.ts',
      "import { describe, it, expect } from 'vitest';",
      testCase('renders nothing and reads no source', '    expect(1 + 1).toBe(2);'),
    );
    expect(newViolationsIn(name)).toEqual([]);
  });
});

/* ── The planting mechanism itself is honest ──────────────────────── */

describe('Stage 08 Task J — the harness cannot pass by accident', () => {
  it('leaves no planted file behind', () => {
    // If cleanup failed, a later run of the real gate would fail on a leftover
    // — which would be a confusing way to learn this suite is broken.
    const leftovers = fs.readdirSync(TESTS_DIR).filter((f) => f.startsWith('zz-stage08-planted-'));
    expect(leftovers).toEqual([]);
  });

  it('the real suite currently has no unexcused violations', () => {
    /**
     * The same assertion `stage03-test-quality-gate.test.ts` makes, repeated
     * here as the control: the "blocked" results above mean something only
     * because the un-planted directory is clean.
     */
    const unexcused = collectViolations(TESTS_DIR).filter((v) => !BASELINE.has(v.key));
    expect(unexcused.map((v) => v.key)).toEqual([]);
  });

  it('the baseline still excuses exactly the Stage 07 census', () => {
    expect(BASELINE.size).toBe(53);
  });
});
