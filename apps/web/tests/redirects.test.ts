import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config.mjs';

describe('server-level legacy redirects (§7)', () => {
  it('maps every legacy section path to its canonical trailing-slash target as a permanent redirect', async () => {
    const rules = await (nextConfig as any).redirects();
    const find = (source: string) => rules.find((r: any) => r.source === source);

    const expected: Record<string, string> = {
      '/nfr-competition': '/competition/',
      '/nfr-entertainment': '/entertainment/',
      '/nfr-events-and-shopping': '/events-shopping/',
      '/nfr-plan-and-watch': '/plan-watch/',
      '/more-rodeo': '/rodeo-events/',
    };

    for (const [source, destination] of Object.entries(expected)) {
      const rule = find(source);
      expect(rule, `missing redirect for ${source}`).toBeTruthy();
      expect(rule.destination).toBe(destination);
      expect(rule.permanent).toBe(true);
      // each destination ends with a trailing slash
      expect(destination.endsWith('/')).toBe(true);
    }

    // exact + wildcard variants for each of the 5 legacy routes
    expect(rules.length).toBe(10);
  });

  it('enforces the global trailing-slash policy', () => {
    expect((nextConfig as any).trailingSlash).toBe(true);
  });
});
