/** Stage 07 Task G — emit the 15-page capability matrix from live code. */
import { KNOWN_PAGE_KEYS, getPageFamily, getAvailableBlockTypes, buildDefaultSlots, getKnownSectionTypes, resolveMaxInstances } from '../lib/cms/sectionRegistry';
import { getPageCapability, classifyBlockSupport, BLOCK_SUPPORT_LABELS } from '../lib/cms/pageCapability';

console.log('| Page key | Family | Level | Canvas-selectable blocks | Default layout | Addable (library) | System / fixed |');
console.log('|---|---|---|---|---|---|---|');
for (const key of KNOWN_PAGE_KEYS) {
  const fam = getPageFamily(key);
  const cap = getPageCapability(key);
  const known = [...getKnownSectionTypes(fam).keys()];
  const canvas = known.filter((t) => classifyBlockSupport(t, true) === 'canvas');
  const other = known.filter((t) => classifyBlockSupport(t, true) !== 'canvas')
    .map((t) => `${t} (${BLOCK_SUPPORT_LABELS[classifyBlockSupport(t, true)]})`);
  const defaults = buildDefaultSlots(fam).map((s) => s.sectionType);
  const lib = getAvailableBlockTypes(fam).map((d) => {
    const cap2 = resolveMaxInstances(d, fam);
    return cap2 === undefined ? d.type : `${d.type}×${cap2}`;
  });
  console.log(`| \`${key}\` | ${fam} | ${cap.level} | ${canvas.length}: ${canvas.join(', ')} | ${defaults.join(', ')} | ${lib.join(', ')} | ${other.join(', ') || '—'} |`);
}
