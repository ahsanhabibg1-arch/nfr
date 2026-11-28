import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  INITIAL_IMAGE_ATTEMPT,
  nextImageAttempt,
  resetOnSourceChange,
  showsUnavailablePanel,
  usesSrcSet,
  type ImageAttempt,
} from '@/lib/media/imageFallback';
import { ImageWithCredit } from '@/components/ImageWithCredit';

/**
 * Stage 06-R FC-05B — the derivative → original → panel ladder.
 *
 * MED-01 remains an INVESTIGATION closure: the production thumbnail 404s it
 * was raised for did not reproduce, and every advertised media URL returns 200.
 * This fallback was added as resilience, so these tests pin the resilience, not
 * a repair.
 *
 * The transitions are asserted against the pure state machine because this
 * project has no DOM test environment (no jsdom, no Testing Library) and adding
 * one is out of scope. The static render assertions below cover what
 * `renderToStaticMarkup` can genuinely see.
 */

const render = (props: Parameters<typeof ImageWithCredit>[0]) =>
  renderToStaticMarkup(React.createElement(ImageWithCredit, props));

const SRC = '/api/media/2026/11/photo.webp';
const SRCSET = '/api/media/2026/11/photo__thumb.webp 320w, /api/media/2026/11/photo__md.webp 768w';

describe('FC-05B — image fallback ladder', () => {
  it('1. a valid responsive image loads normally, offering its candidates', () => {
    expect(usesSrcSet(INITIAL_IMAGE_ATTEMPT, true)).toBe(true);
    expect(showsUnavailablePanel(INITIAL_IMAGE_ATTEMPT, false)).toBe(false);

    const html = render({ src: SRC, alt: 'Bronc rider', srcSet: SRCSET, sizes: '100vw', credit: 'Pool' });
    expect(html).toContain(`src="${SRC}"`);
    expect(html).toContain('srcSet="/api/media/2026/11/photo__thumb.webp 320w');
    expect(html).toContain('sizes="100vw"');
    expect(html).not.toContain('Image unavailable');
  });

  it('2. a failed derivative falls back to the ORIGINAL exactly once', () => {
    const afterFirst = nextImageAttempt(INITIAL_IMAGE_ATTEMPT, true);
    expect(afterFirst).toBe('original');
    // The retry drops the candidates, which is what forces the original.
    expect(usesSrcSet(afterFirst, true)).toBe(false);
    // And it is still an image, not the panel.
    expect(showsUnavailablePanel(afterFirst, false)).toBe(false);
  });

  it('3. a failure of the ORIGINAL shows the unavailable panel', () => {
    const exhausted = nextImageAttempt('original', true);
    expect(exhausted).toBe('failed');
    expect(showsUnavailablePanel(exhausted, false)).toBe(true);
  });

  it('4. repeated error events cannot create a retry loop', () => {
    let state: ImageAttempt = INITIAL_IMAGE_ATTEMPT;
    const seen: ImageAttempt[] = [state];
    for (let i = 0; i < 25; i++) {
      state = nextImageAttempt(state, true);
      seen.push(state);
    }
    // Strictly descending, then terminal — never back to an earlier rung.
    expect(seen.slice(0, 3)).toEqual(['candidates', 'original', 'failed']);
    expect(seen.slice(2).every((s) => s === 'failed')).toBe(true);
    expect(new Set(seen).size).toBe(3);
  });

  it('4b. with NO srcSet a single failure goes straight to the panel', () => {
    // Nothing else to try, so re-requesting the same URL would be pointless.
    expect(nextImageAttempt(INITIAL_IMAGE_ATTEMPT, false)).toBe('failed');
  });

  it('5. a successful original fallback does NOT show the panel', () => {
    // 'original' is the state while the retry is displayed; it is not a failure.
    expect(showsUnavailablePanel('original', false)).toBe(false);
  });

  it('6. changing the image source resets the ladder', () => {
    expect(resetOnSourceChange(SRC, '/api/media/2026/12/other.webp', 'failed')).toBe('candidates');
    // Same source keeps whatever progress was made.
    expect(resetOnSourceChange(SRC, SRC, 'failed')).toBe('failed');
    expect(resetOnSourceChange(SRC, SRC, 'original')).toBe('original');
  });

  it('7. alternative text and credit survive every rung, including the panel', () => {
    const withCredit = render({ src: SRC, alt: 'Bronc rider', credit: 'Sports Media Pool' });
    expect(withCredit).toContain('alt="Bronc rider"');
    expect(withCredit).toContain('Sports Media Pool');

    // The panel path (missing src) still announces the alt text.
    const panel = render({ src: '', alt: 'Bronc rider', credit: 'Sports Media Pool' });
    expect(panel).toContain('Image unavailable');
    expect(panel).toContain('Bronc rider');
  });

  it('7b. an empty alt stays empty — decorative images are not given a headline', () => {
    const html = render({ src: SRC, alt: '' });
    expect(html).toContain('alt=""');
  });

  it('8. responsive behaviour is unchanged when images load normally', () => {
    const html = render({ src: SRC, alt: 'x', srcSet: SRCSET, sizes: '50vw', width: 1600, height: 1000 });
    expect(html).toContain('srcSet=');
    expect(html).toContain('sizes="50vw"');
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="1000"');
    // No srcSet declared → no sizes emitted, exactly as before.
    expect(render({ src: SRC, alt: 'x', sizes: '50vw' })).not.toContain('sizes=');
  });

  it('a missing source takes the panel path regardless of ladder state', () => {
    for (const s of ['candidates', 'original', 'failed'] as ImageAttempt[]) {
      expect(showsUnavailablePanel(s, true)).toBe(true);
    }
  });
});
