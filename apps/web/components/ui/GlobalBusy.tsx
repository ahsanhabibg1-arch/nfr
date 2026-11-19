'use client';

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { usePathname } from 'next/navigation';

/**
 * The one place that knows the application is waiting, and shows it.
 *
 * WHY THIS EXISTS. Pressing a button that runs a server action — saving a
 * draft, publishing, deleting — can take a noticeable moment on a remote
 * database. Until now nothing on screen moved while it did, so the honest
 * reading of the interface was "the click did nothing", and the natural
 * response is to click again. A second click on a save is not harmless.
 *
 * WHAT IT DOES NOT DO. It does not block the page. A modal spinner over a CMS
 * is a heavier promise than the work deserves: a save is usually fast, and
 * locking the screen for it makes the whole application feel slower than it is.
 * This is an ambient indicator at the top of the viewport, in the brand gold,
 * plus a per-button spinner where the click actually happened.
 *
 * TWO TIMINGS MAKE IT FEEL CONSIDERED RATHER THAN BUSY:
 *
 *   - it waits `APPEAR_AFTER_MS` before showing anything, so an action that
 *     finishes quickly never flashes a loading state at all;
 *   - once shown it stays for at least `MINIMUM_VISIBLE_MS`, so a bar that has
 *     appeared is never snatched away mid-animation, which reads as a glitch.
 */

const APPEAR_AFTER_MS = 180;
const MINIMUM_VISIBLE_MS = 420;

interface BusyApi {
  /** Marks one unit of work as started; call the returned function when it ends. */
  begin: () => () => void;
  /** Runs an async action with the indicator raised for its duration. */
  track: <T>(work: () => Promise<T>) => Promise<T>;
  busy: boolean;
}

const BusyContext = createContext<BusyApi | null>(null);

/**
 * Reading the indicator is always safe, even outside the provider.
 *
 * A component that wants to report work should not have to know whether it
 * happens to be mounted inside the admin shell, a modal rendered elsewhere, or
 * a test harness. Outside a provider the calls are no-ops rather than a crash,
 * which keeps the indicator strictly a progressive enhancement.
 */
export function useBusy(): BusyApi {
  const ctx = useContext(BusyContext);
  const fallback = useMemo<BusyApi>(() => ({
    begin: () => () => {},
    track: (work) => work(),
    busy: false,
  }), []);
  return ctx ?? fallback;
}

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(0);
  // `pending` is read inside callbacks that must not be recreated on every
  // change, so the count is also held in a ref.
  const count = useRef(0);

  const begin = useCallback(() => {
    count.current += 1;
    setPending(count.current);
    let ended = false;
    return () => {
      // Guarded: a caller that ends the same unit twice (an error path plus a
      // `finally`, say) must not drive the count negative and leave the
      // indicator stuck on.
      if (ended) return;
      ended = true;
      count.current = Math.max(0, count.current - 1);
      setPending(count.current);
    };
  }, []);

  const track = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    const end = begin();
    try {
      return await work();
    } finally {
      end();
    }
  }, [begin]);

  const api = useMemo<BusyApi>(() => ({ begin, track, busy: pending > 0 }), [begin, track, pending]);

  return (
    <BusyContext.Provider value={api}>
      {children}
      <BusyBar active={pending > 0} />
    </BusyContext.Provider>
  );
}

/** The bar itself: fixed to the top of the viewport, above everything. */
function BusyBar({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (active) {
      timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, APPEAR_AFTER_MS);
    } else if (visible) {
      const elapsed = Date.now() - shownAt.current;
      timer = setTimeout(() => setVisible(false), Math.max(0, MINIMUM_VISIBLE_MS - elapsed));
    }
    return () => clearTimeout(timer);
  }, [active, visible]);

  return (
    <div
      // `aria-hidden` on the bar, with the live region below carrying the
      // message: a screen reader should hear "Working…" once, not have a
      // decorative gradient described to it.
      className={`nfr-busy-bar ${visible ? 'is-visible' : ''}`}
      data-testid="global-busy-bar"
      data-active={visible ? 'true' : 'false'}
      aria-hidden="true"
    >
      <span className="nfr-busy-bar__beam" />
    </div>
  );
}

/**
 * Raises the indicator while a route transition is in flight.
 *
 * Next.js renders the matching `loading.tsx` once the new route starts
 * streaming, but the gap BEFORE that — while the click is being handled and the
 * server is reached — shows nothing at all. This closes that gap: a click on an
 * internal link raises the bar, and the arrival of the new pathname lowers it.
 *
 * The listener is on the document in the capture phase so it sees the click
 * whatever the link is nested inside, and it ignores everything that is not an
 * ordinary same-tab navigation: new-tab clicks, downloads, external hosts,
 * hash links and anything already on the current path. A safety timeout clears
 * the indicator if no navigation follows, so a click that the router declines
 * can never leave the bar running forever.
 */
export function RouteBusy() {
  const pathname = usePathname();
  const { begin } = useBusy();
  const end = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    end.current?.();
    end.current = null;
  }, []);

  // A completed navigation is the signal that the wait is over.
  useEffect(() => { stop(); }, [pathname, stop]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      stop();
      const release = begin();
      end.current = release;
      // The router may never navigate (a guard, a refusal, a dialog). The
      // indicator must not outlive the attempt.
      setTimeout(() => { if (end.current === release) stop(); }, 15_000);
    };

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      stop();
    };
  }, [begin, stop]);

  return null;
}

/**
 * The spinner that goes inside a button while its own action runs.
 *
 * The ambient bar says "the application is working"; this says "the thing YOU
 * pressed is working", which is the question an author actually has. It is
 * sized in `em` so it matches whatever text it sits beside.
 */
export function Spinner({ label }: { label?: string }) {
  return (
    <>
      <span className="nfr-spinner" data-testid="button-spinner" aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

/**
 * The polite announcement that pairs with the bar.
 *
 * Mounted once by the provider's consumer (the shell), so assistive technology
 * is told that work is in progress without every button inventing its own
 * wording.
 */
export function BusyAnnouncer() {
  const { busy } = useBusy();
  return (
    /*
      A LIVE REGION, BUT NOT A `status` LANDMARK.

      `role="status"` would have been the obvious choice, and it was wrong: the
      admin screens already use that role for their own messages — "Verification
      token saved", "That token is not valid" — and code that looks for the
      page's status would then find two. A browser test did exactly that and
      started matching this empty announcer instead of the message it was
      checking.

      `aria-live` alone announces the change without claiming the role, so the
      screens keep their single status region.
    */
    <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="busy-announcer">
      {busy ? 'Working…' : ''}
    </div>
  );
}
