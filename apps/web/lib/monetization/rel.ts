import type { AffiliateRelAttribute } from '@prisma/client';

/**
 * Paid-link `rel` policy (Batch 08 §7/§16). Documented, not blanket: affiliate links
 * default to `sponsored nofollow`, always with `noopener noreferrer` for target=_blank
 * safety. Sponsored-content links use `sponsored`. UGC uses `ugc`.
 */
export function relString(rel: AffiliateRelAttribute): string {
  const safety = ['noopener', 'noreferrer'];
  switch (rel) {
    case 'SPONSORED':
      return ['sponsored', ...safety].join(' ');
    case 'NOFOLLOW':
      return ['nofollow', ...safety].join(' ');
    case 'UGC':
      return ['ugc', ...safety].join(' ');
    case 'SPONSORED_NOFOLLOW':
    default:
      return ['sponsored', 'nofollow', ...safety].join(' ');
  }
}

/** Human label for a paid-link attribute (admin display). */
export function relLabel(rel: AffiliateRelAttribute): string {
  return relString(rel)
    .split(' ')
    .filter((t) => t !== 'noopener' && t !== 'noreferrer')
    .join(' ');
}
