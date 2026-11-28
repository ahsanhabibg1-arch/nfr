/**
 * The image-loading ladder, as a pure state machine (Stage 06-R, FC-05B).
 *
 * WHY IT IS A SEPARATE MODULE. `ImageWithCredit` ran this logic inline in two
 * `useState` flags, and the project has no DOM test environment — no jsdom, no
 * Testing Library, and adding one is out of scope. Inline, the only way to
 * prove "a failed derivative falls back to the original, and a second failure
 * shows the panel, and neither loops" would have been to read the component and
 * hope. Extracted, every transition is a one-line assertion.
 *
 * This is the same split the codebase already uses for exactly this reason:
 * `slotProps` out of `slotUtils`, `brandingShared` out of `branding`,
 * `seoSentinel`'s rules out of its runner.
 *
 * THE LADDER, and it only ever goes down:
 *
 *   candidates ──error──▶ original ──error──▶ failed
 *        │                                      ▲
 *        └──────── error, when no srcSet ────────┘
 *
 * `failed` is terminal: a further error event cannot move it, which is what
 * makes a retry loop impossible. Only a NEW image source resets the ladder.
 */

export type ImageAttempt =
  /** Using the responsive `srcset` candidates (or the plain src when there are none). */
  | 'candidates'
  /** A candidate failed; retrying with the original `src` and no `srcset`. */
  | 'original'
  /** Everything failed; the "Image unavailable" panel is shown. */
  | 'failed';

export const INITIAL_IMAGE_ATTEMPT: ImageAttempt = 'candidates';

/**
 * Where one `error` event moves the ladder.
 *
 * With no `srcset` there is no second thing to try, so a failure goes straight
 * to `failed` rather than pointlessly re-requesting the same URL.
 */
export function nextImageAttempt(current: ImageAttempt, hasSrcSet: boolean): ImageAttempt {
  if (current === 'candidates') return hasSrcSet ? 'original' : 'failed';
  return 'failed';
}

/** Responsive candidates are offered only on the first attempt. */
export function usesSrcSet(state: ImageAttempt, hasSrcSet: boolean): boolean {
  return hasSrcSet && state === 'candidates';
}

/** The unavailable panel replaces the image only once the ladder is exhausted. */
export function showsUnavailablePanel(state: ImageAttempt, missingSource: boolean): boolean {
  return missingSource || state === 'failed';
}

/**
 * A changed `src` is a different image, so it gets a fresh ladder.
 *
 * Without this a card that swapped images after one failure would stay stuck on
 * the panel, reporting the previous image's problem about a new one.
 */
export function resetOnSourceChange(previousSrc: string, nextSrc: string, state: ImageAttempt): ImageAttempt {
  return previousSrc === nextSrc ? state : INITIAL_IMAGE_ATTEMPT;
}
