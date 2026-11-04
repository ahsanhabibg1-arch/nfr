import { useEffect } from 'react';

/**
 * Unsaved-change protection (Batch 20 §2).
 *
 * Attaches a `beforeunload` guard while `enabled` is true, so a browser refresh,
 * tab close, or navigation away from the app prompts the native "leave site?"
 * confirmation. This is the reliably-supported subset: the Next.js App Router does
 * not expose a stable API to intercept in-app `<Link>` navigation, so internal
 * client navigation is NOT guarded here (documented limitation). In-app flows
 * already surface a visible "Unsaved Changes" indicator and block risky
 * transitions (e.g. workflow changes) until saved.
 *
 * The listener logic is factored into `beforeUnloadGuard` so it is unit-testable
 * without a DOM, and the hook simply wires it to the component lifecycle.
 */
interface MinimalWindow {
  addEventListener: (type: 'beforeunload', handler: (e: BeforeUnloadEvent) => void) => void;
  removeEventListener: (type: 'beforeunload', handler: (e: BeforeUnloadEvent) => void) => void;
}

/** Registers the guard when enabled; returns a cleanup that always removes it. */
export function beforeUnloadGuard(
  enabled: boolean,
  win: MinimalWindow | undefined = typeof window === 'undefined' ? undefined : (window as unknown as MinimalWindow),
): () => void {
  if (!win) return () => {};
  const handler = (e: BeforeUnloadEvent) => {
    // The spec requires preventDefault + a (now-ignored) returnValue to trigger
    // the browser's native unsaved-changes prompt. The custom string is not shown.
    e.preventDefault();
    e.returnValue = '';
  };
  if (enabled) win.addEventListener('beforeunload', handler);
  return () => win.removeEventListener('beforeunload', handler);
}

export function useUnsavedChangesWarning(enabled: boolean): void {
  useEffect(() => beforeUnloadGuard(enabled), [enabled]);
}
