/**
 * Editable copy for a homepage section, supplied from the Page Builder slot props.
 * Any blank field falls back to the section's built-in default text.
 */
export interface SectionCopy {
  kicker?: string;
  title?: string;
  description?: string;
  ctaText?: string;
  ctaUrl?: string;
}

/** Use the builder value when it has text, otherwise the built-in default. */
export function copyOr(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

/** Read the standard copy fields from untyped slot props. */
export function copyFromProps(props: Record<string, unknown>): SectionCopy {
  const s = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : undefined);
  return { kicker: s('kicker'), title: s('title'), description: s('description'), ctaText: s('ctaText'), ctaUrl: s('ctaUrl') };
}
