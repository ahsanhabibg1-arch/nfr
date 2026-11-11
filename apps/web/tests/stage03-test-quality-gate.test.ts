import { describe, it, expect } from 'vitest';
import path from 'node:path';
import legacyBaseline from './support/stage03LegacyStructuralTests.json';
import {
  collectViolations,
  assertsOnSourceText,
  sourceVariables,
  bodyAfter,
  BEHAVIOURAL_TITLE,
  STAGE_03_BEHAVIOURAL_TITLE,
  STRUCTURAL_MARKER,
} from './support/testQualityGate';

/**
 * Stage 03 Task H — test quality gate. WIDENED AND SHARPENED IN STAGE 07 TASK J.
 *
 * BEHAVIOUR ENFORCED: a test that claims a behaviour in its NAME may not rest on
 * a source-text assertion. Structural assertions remain legitimate, but must be
 * named as structural so a reader is never misled about what was proven.
 *
 * Why this gate exists. `tests/batch-t4-quick-access-helptext.test.ts` contains
 * a test named "editor renders helpText for text props" whose assertion is
 * `expect(editorSrc).toContain('helpText')` — a search of the WHOLE editor file.
 * The substring is present in three unrelated prop branches, so the test passed
 * while the `text` branch rendered no help text at all. A reported-complete
 * feature was never working.
 *
 * ── WHAT STAGE 07 CHANGED (Task J) ───────────────────────────────────
 *
 * The Stage 06 handover found the gate missed any test whose name claims a
 * BEHAVIOUR rather than a rendering outcome — "numProp clamps to min/max
 * bounds", "idListProp handles array input" — and concluded the registry's 49
 * was "a floor, not a census". Stage 07 measured that before changing it
 * (`scripts/stage07-quality-gate-impact.mts`,
 * `scripts/stage07-gate-compare.mts`):
 *
 *   verbs      level       flagged
 *   Stage 03   file          49    <- the inherited gate; exactly the old baseline
 *   Stage 03   assertion     30
 *   Stage 07   file          78
 *   Stage 07   assertion     53    <- what this gate now enforces
 *
 * Two findings drove the change:
 *
 *  1. 19 of the inherited 49 were FALSE POSITIVES. The gate asked "does this
 *     FILE read source anywhere?" and flagged every behaviourally-named test in
 *     it. Most of these files are mixed, so converting a test to render real
 *     output did not clear it — the gate punished its own remedy. Detection is
 *     now assertion-level: it reads the test's own body.
 *
 *  2. The inherited gate MISSED 23 real violations. Three of the six verbs the
 *     handover nominated were adopted — `clamps`, `handles`, `supports` — because
 *     they claim a computed outcome. `has`, `uses` and `includes` were rejected
 *     on the measurement: together they add ~145 hits that are overwhelmingly
 *     legitimate structural claims ("has pageKey field", "has unique constraint
 *     on (pageKey, revisionNo)"), and registering them would be exactly the
 *     "hundreds of exemptions" the Stage 07 directive forbids.
 *
 * Net: the baseline moves 49 → 53, which is −19 false positives and +23 real
 * findings. It did not grow for convenience; it became a census instead of a
 * floor. The detection logic lives in `tests/support/testQualityGate.ts` so the
 * measurement scripts and this gate cannot disagree.
 *
 * Enforcement model is unchanged. The baseline may SHRINK but never GROW:
 *   - a NEW behaviourally-named source-text test fails this gate;
 *   - a baseline entry that no longer exists fails it too, forcing the baseline
 *     to be trimmed as later stages convert these tests to real assertions.
 */

const TESTS_DIR = path.resolve(__dirname);
const BASELINE = new Set(legacyBaseline as string[]);

describe('Stage 03 Task H — no NEW source-text test may claim a behaviour', () => {
  it('every behaviourally-named source-asserting test is grandfathered', () => {
    const newOnes = collectViolations(TESTS_DIR).filter((v) => !BASELINE.has(v.key));
    expect(
      newOnes.map((v) => v.key),
      'These tests claim a behaviour but read source text to prove it. ' +
      'Either assert real rendered output (renderToStaticMarkup / resolved HTML), ' +
      'or rename the test to state it is structural and add "[structural]" to its title.',
    ).toEqual([]);
  });

  it('the baseline contains no stale entries — it must shrink as tests are converted', () => {
    const present = new Set(collectViolations(TESTS_DIR).map((v) => v.key));
    const stale = [...BASELINE].filter((k) => !present.has(k));
    expect(
      stale,
      'These baseline entries no longer match any test. Remove them from ' +
      'tests/support/stage03LegacyStructuralTests.json so the gate keeps tightening.',
    ).toEqual([]);
  });

  it('records the current debt so progress is measurable', () => {
    // Deliberately asserted, not merely logged: the number must come down, and a
    // change in either direction should be a conscious act. 49 under Stage 03's
    // inaccurate detection; 53 under Stage 07's accurate detection.
    expect(BASELINE.size).toBe(53);
  });

  it('the known false-pass case is still captured in the baseline', () => {
    const t4 = [...BASELINE].filter((k) => k.startsWith('batch-t4-quick-access-helptext'));
    expect(t4.length).toBe(2);
    expect(t4.some((k) => k.includes('renders helpText for text props'))).toBe(true);
  });
});

describe('Stage 03 Task H — the gate detects what it claims to detect', () => {
  it('a behaviourally-named title is recognised', () => {
    for (const t of ['renders the hero', 'shows a banner', 'displays the title', 'button is visible']) {
      expect(BEHAVIOURAL_TITLE.test(t), t).toBe(true);
    }
  });

  it('the three verbs Stage 07 added are recognised', () => {
    for (const t of [
      'numProp clamps to min/max bounds',
      'idListProp handles array input',
      'all resolvers support draft option',
    ]) {
      expect(BEHAVIOURAL_TITLE.test(t), t).toBe(true);
      expect(STAGE_03_BEHAVIOURAL_TITLE.test(t), `${t} was missed by the old list`).toBe(false);
    }
  });

  it('the three verbs Stage 07 REJECTED stay unflagged, on the measurement', () => {
    /**
     * `has`, `uses` and `includes` were measured at ~145 additional hits,
     * overwhelmingly on claims that source text is the right way to prove —
     * schema fields, constraints, module wiring. Adopting them would have
     * registered correct tests as debt.
     */
    for (const t of [
      'has unique constraint on (pageKey, revisionNo)',
      'service Zod schema includes id field',
      'publish uses a transaction',
    ]) {
      expect(BEHAVIOURAL_TITLE.test(t), t).toBe(false);
    }
  });

  it('a structurally-named title is not flagged', () => {
    for (const t of ['registry exports editorial-hero', 'service wraps publish in a transaction', 'schema declares pageKey']) {
      expect(BEHAVIOURAL_TITLE.test(t), t).toBe(false);
    }
  });

  it('an explicit [structural] marker opts a test out', () => {
    expect(STRUCTURAL_MARKER.test('[structural] registry renders nothing by itself')).toBe(true);
  });

  it("Stage 03's own suites introduce no new violations", () => {
    const mine = collectViolations(TESTS_DIR).filter((v) => v.file.startsWith('stage03-'));
    expect(mine.map((v) => v.key)).toEqual([]);
  });

  it("Stage 07's own suites introduce no new violations", () => {
    const mine = collectViolations(TESTS_DIR).filter((v) => v.file.startsWith('stage07-'));
    expect(mine.map((v) => v.key)).toEqual([]);
  });
});

/* ── Assertion-level detection: the Stage 07 mechanism, tested ─────── */

describe('Stage 07 Task J — detection is assertion-level, not file-level', () => {
  it('finds the variable that holds source text, whatever it is named', () => {
    /**
     * The first attempt keyed off names ending in `Src`/`Source` and MISSED two
     * real classes: `expect(src)` (the pattern needed a character before the
     * suffix) and `expect(editor)` (named after its contents, not its nature).
     * Both were genuine violations in the grandfathered set, so an
     * under-detecting gate would have quietly released them. Detection now
     * follows the assignment instead of guessing the name.
     */
    const file = `
      const editor = read('views/admin/AdminPageLayoutEditor.tsx');
      const src = fs.readFileSync(p, 'utf8');
      const alias = editor;
      const html = renderToStaticMarkup(el);
    `;
    const vars = sourceVariables(file);
    expect(vars.has('editor')).toBe(true);
    expect(vars.has('src')).toBe(true);
    expect(vars.has('alias')).toBe(true);
    expect(vars.has('html'), 'rendered output is not source text').toBe(false);
  });

  it('flags a body that asserts on a source variable', () => {
    const vars = new Set(['editor', 'src']);
    expect(assertsOnSourceText("{ expect(editor).toContain('>History<'); }", vars)).toBe(true);
    expect(assertsOnSourceText("{ expect(src).toContain('sanitizeLegalHtml'); }", vars)).toBe(true);
    expect(assertsOnSourceText("{ expect(src.slice(0, 10)).toContain('x'); }", vars)).toBe(true);
    expect(assertsOnSourceText("{ expect(read('a/b.ts')).toContain('x'); }")).toBe(true);
  });

  it('does NOT flag a body that asserts on rendered output', () => {
    const vars = new Set(['editor', 'src']);
    const body = `{
      const html = renderToStaticMarkup(React.createElement(Block, { slot, data }));
      expect(html).toContain('Rodeo Competitors');
    }`;
    expect(assertsOnSourceText(body, vars)).toBe(false);
  });

  it('does NOT flag a test that reads source only as setup', () => {
    // This is the pattern Stage 07's own conversions use, and the reason the
    // file-level gate had to go: it flagged exactly these as violations.
    const vars = new Set(['src']);
    const body = `{
      const expected = src.includes('x') ? 1 : 2;
      const html = renderBlock('directory-grid', {}, {});
      expect(html).toContain('method="get"');
      expect(expected).toBe(2);
    }`;
    expect(assertsOnSourceText(body, vars)).toBe(false);
  });

  it('extracts a balanced test body, so a nested brace does not truncate it', () => {
    const file = "it('x', () => { if (a) { b(); } expect(src).toContain('y'); });";
    const body = bodyAfter(file, file.indexOf('=>'));
    expect(body).toContain("expect(src)");
    expect(body.endsWith('}')).toBe(true);
  });

  it('the assertion-level gate is strictly more accurate than the file-level one', () => {
    /**
     * Measured, not asserted by hand: the inherited gate flagged 19 tests whose
     * bodies never touch source text, and missed 23 that do. Both halves are
     * checked so a regression toward either failure mode fails here.
     */
    const fileLevel = collectViolations(TESTS_DIR, {
      titlePattern: STAGE_03_BEHAVIOURAL_TITLE,
      assertionLevel: false,
    });
    const asrtLevel = collectViolations(TESTS_DIR, {
      titlePattern: STAGE_03_BEHAVIOURAL_TITLE,
      assertionLevel: true,
    });
    const asrtKeys = new Set(asrtLevel.map((v) => v.key));
    const falsePositives = fileLevel.filter((v) => !asrtKeys.has(v.key));
    expect(falsePositives.length, 'the inherited gate had false positives').toBeGreaterThan(0);

    const fileKeys = new Set(fileLevel.map((v) => v.key));
    const missed = collectViolations(TESTS_DIR).filter((v) => !fileKeys.has(v.key));
    expect(missed.length, 'the widened gate finds violations the old one missed').toBeGreaterThan(0);
  });
});
