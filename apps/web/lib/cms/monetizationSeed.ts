import type { PrismaClient } from '@prisma/client';

/**
 * Idempotent monetization seed (Batch 08). Create-missing-only. Seeds ONLY reusable
 * disclosure POLICY TEXT (generic, editorially-independent) — never any partner,
 * link, revenue, commission or commercial relationship (§6). Does not touch
 * MonetizationConfiguration (external serving/tracking stay disabled via the config
 * fallback). Safe to re-run; never overwrites admin-edited disclosures.
 */
const DISCLOSURES: { key: string; scope: string; label: string; body: string }[] = [
  {
    key: 'site-affiliate',
    scope: 'site',
    label: 'Affiliate Disclosure',
    body: 'NFRGuide is an independent rodeo editorial publication. Some outbound links are affiliate links; we may earn a commission on qualifying purchases at no additional cost to you. Editorial coverage is independent of commercial relationships.',
  },
  {
    key: 'article-affiliate',
    scope: 'article',
    label: 'Commercial Disclosure',
    body: 'This article may contain affiliate links. NFRGuide may earn a commission on qualifying purchases at no additional cost to you. Commercial partners are not official sources, and recommendations remain editorially independent.',
  },
  {
    key: 'ad-label',
    scope: 'ad',
    label: 'Advertisement',
    body: 'Advertisements are clearly labeled and are separate from editorial content.',
  },
  {
    key: 'sponsored',
    scope: 'sponsored',
    label: 'Sponsored',
    body: 'Sponsored content is produced in partnership with a commercial sponsor and is clearly identified as such, distinct from independent editorial coverage.',
  },
  {
    key: 'non-affiliation',
    scope: 'site',
    label: 'Independence Notice',
    body: 'NFRGuide is not affiliated with, sponsored by, or endorsed by the PRCA, WPRA, the National Finals Rodeo, Las Vegas Events, or the Thomas & Mack Center. Official marks are used solely for descriptive editorial purposes.',
  },
];

export async function seedMonetizationDefaults(db: PrismaClient): Promise<{ disclosures: number }> {
  let created = 0;
  for (const d of DISCLOSURES) {
    const existing = await db.monetizationDisclosure.findUnique({ where: { key: d.key } });
    if (!existing) {
      await db.monetizationDisclosure
        .create({ data: { key: d.key, scope: d.scope, label: d.label, body: d.body, requiredProminent: true, enabled: true } })
        .catch(() => undefined);
      created++;
    }
  }
  return { disclosures: created };
}
