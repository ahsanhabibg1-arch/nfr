import { buildDefaultSlots, getAvailableBlockTypes, getKnownSectionTypes } from '../lib/cms/sectionRegistry';
for (const fam of ['homepage', 'section-landing', 'detail-template', 'directory']) {
  console.log('--- ' + fam);
  console.log('  defaults: ' + buildDefaultSlots(fam).map((s) => s.sectionType).join(', '));
  console.log('  library : ' + getAvailableBlockTypes(fam).map((d) => d.type).join(', '));
  console.log('  known   : ' + [...getKnownSectionTypes(fam).keys()].join(', '));
}
