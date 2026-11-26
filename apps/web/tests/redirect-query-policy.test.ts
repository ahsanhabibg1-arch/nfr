import { describe, expect, it } from 'vitest';
import { redirectLocation, safeCampaignQuery } from '../lib/redirects/query';

describe('redirect campaign-query policy', () => {
  it('forwards only the explicit campaign allowlist', () => {
    const out = safeCampaignQuery(new URLSearchParams('utm_source=news&utm_campaign=nfr&token=secret&next=https://evil.test'));
    expect(out.toString()).toBe('utm_source=news&utm_campaign=nfr');
  });

  it('uses the first repeated value deterministically', () => {
    expect(safeCampaignQuery(new URLSearchParams('utm_source=first&utm_source=second')).get('utm_source')).toBe('first');
  });

  it('drops oversized and control-character values', () => {
    expect(safeCampaignQuery(new URLSearchParams({ utm_source: 'x'.repeat(257), utm_term: 'bad\r\nvalue' })).toString()).toBe('');
  });

  it('cannot override the validated target or origin', () => {
    const out = redirectLocation('https://nfrguide.com/old/?utm_id=7&redirect=https://evil.test', '/articles/live/');
    expect(out.href).toBe('https://nfrguide.com/articles/live/?utm_id=7');
  });

  it('encodes values safely and strips fragments', () => {
    const out = redirectLocation('https://nfrguide.com/old/?utm_content=a%20b%26c', '/articles/live/#ignored');
    expect(out.pathname).toBe('/articles/live/');
    expect(out.searchParams.get('utm_content')).toBe('a b&c');
    expect(out.hash).toBe('');
  });
});
