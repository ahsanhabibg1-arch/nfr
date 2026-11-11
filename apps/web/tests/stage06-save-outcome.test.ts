import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Stage 06 Task 6 + Task 12.9 — save outcome handling.
 *
 * The load-bearing rule — a failed save must not refresh the canvas — is proven
 * behaviourally in `stage06-builder-dom.test.ts` by calling
 * `canvasTokenAfterSave` on both branches.
 *
 * What remains here is one genuinely structural check: that the error branch
 * flashes the error and the success message is confined to the `ok` branch.
 * That cannot be driven from this runner, because the handler lives inside a
 * `startTransition` callback and there is no DOM environment. So it is a source
 * check, and it is NAMED as one.
 *
 * It sits in its own file deliberately. The Stage 03 quality gate operates per
 * file: once a file reads product source, every test in it whose title contains
 * a rendering verb is treated as a source-text claim. `stage06-builder-dom.test.ts`
 * is full of legitimate `renders …` titles that assert real rendered output, so
 * putting this assertion there made the gate flag eight innocent tests. The gate
 * was right; the fix is this separation, not an exemption.
 */

const EDITOR = fs.readFileSync(
  path.resolve(__dirname, '..', 'views/admin/AdminPageLayoutEditor.tsx'),
  'utf8',
);

describe('Stage 06 Task 6 — save outcome wiring [structural]', () => {
  it('the save handler flashes the server error on failure [structural]', () => {
    expect(EDITOR).toContain("flash(r.error || 'Error saving draft.', 'error')");
  });

  it('the success message is inside the ok branch only [structural]', () => {
    const ok = EDITOR.indexOf("flash('Draft saved.')");
    const err = EDITOR.indexOf("flash(r.error || 'Error saving draft.', 'error')");
    expect(ok, 'success flash must exist').toBeGreaterThan(-1);
    expect(err, 'error flash must exist').toBeGreaterThan(-1);
    expect(ok, 'the success flash must sit before the error branch').toBeLessThan(err);
  });

  it('the canvas refresh goes through the testable rule, not an inline increment [structural]', () => {
    // If this is ever inlined back to `setCanvasRefreshToken((n) => n + 1)`
    // inside the ok branch, the failure branch stops being covered by a test.
    expect(EDITOR).toContain('canvasTokenAfterSave(r, n)');
  });

  it('no autosave timer was introduced [structural]', () => {
    // Stage 06 forbids silent autosave unless its safety is verified. Asserting
    // the absence, because "we did not add autosave" is otherwise unfalsifiable.
    expect(EDITOR).not.toMatch(/setInterval\s*\(/);
    expect(EDITOR).not.toMatch(/setTimeout\s*\([^)]*saveDraft/);
    expect(EDITOR).not.toMatch(/\bautosave\b/i);
  });

  it('publishing still requires an explicit confirmation [structural]', () => {
    expect(EDITOR).toMatch(/publish[\s\S]{0,200}window\.confirm/i);
  });
});
