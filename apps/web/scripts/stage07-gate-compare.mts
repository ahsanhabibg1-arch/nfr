/** Stage 07 Task J — the four detection variants, side by side. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectViolations, BEHAVIOURAL_TITLE, STAGE_03_BEHAVIOURAL_TITLE } from '../tests/support/testQualityGate';

const testsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests');
const v = (titlePattern: RegExp, assertionLevel: boolean) =>
  collectViolations(testsDir, { titlePattern, assertionLevel });

const s03File = v(STAGE_03_BEHAVIOURAL_TITLE, false);
const s03Asrt = v(STAGE_03_BEHAVIOURAL_TITLE, true);
const s07File = v(BEHAVIOURAL_TITLE, false);
const s07Asrt = v(BEHAVIOURAL_TITLE, true);

console.log('verbs        level        flagged');
console.log(`Stage 03     file          ${s03File.length}   <- the gate Stage 07 inherited`);
console.log(`Stage 03     assertion     ${s03Asrt.length}`);
console.log(`Stage 07     file          ${s07File.length}`);
console.log(`Stage 07     assertion     ${s07Asrt.length}   <- the gate Stage 07 ships`);

const asrtKeys = new Set(s03Asrt.map((x) => x.key));
const falsePositives = s03File.filter((x) => !asrtKeys.has(x.key));
console.log(`\nFalse positives in the inherited gate (file-level, no source assertion): ${falsePositives.length}`);

const s03Keys = new Set(s03File.map((x) => x.key));
const newlyFound = s07Asrt.filter((x) => !s03Keys.has(x.key));
console.log(`Real violations the inherited gate MISSED: ${newlyFound.length}`);
