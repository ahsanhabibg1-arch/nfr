/**
 * Regenerate the test-quality gate's grandfathered baseline (Stage 07 Task J).
 *
 * Writes `tests/support/stage03LegacyStructuralTests.json` from the CURRENT
 * detection. Run it only when the detection itself changes deliberately; a new
 * violation introduced by new work must be fixed, not regenerated away.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectViolations } from '../tests/support/testQualityGate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');
const target = path.join(testsDir, 'support', 'stage03LegacyStructuralTests.json');

const before: string[] = JSON.parse(fs.readFileSync(target, 'utf8'));
const keys = collectViolations(testsDir).map((v) => v.key).sort();

const removed = before.filter((k) => !keys.includes(k));
const added = keys.filter((k) => !before.includes(k));

fs.writeFileSync(target, `${JSON.stringify(keys, null, 2)}\n`, 'utf8');

console.log(`baseline: ${before.length} -> ${keys.length}`);
console.log(`\nREMOVED (${removed.length}) — no longer a violation:`);
for (const k of removed) console.log(`  - ${k}`);
console.log(`\nADDED (${added.length}) — newly detected by the widened, assertion-level gate:`);
for (const k of added) console.log(`  + ${k}`);
