import { describe, it, expect, vi } from 'vitest';
import { beforeUnloadGuard } from '../lib/hooks/useUnsavedChangesWarning';

/**
 * Batch 20 §2 — unsaved-change beforeunload guard. DOM-free: the guard logic is
 * tested against a fake window so it runs in the node vitest environment.
 */
function fakeWin() {
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  return {
    listeners,
    addEventListener: vi.fn((t: string, h: (e: unknown) => void) => { (listeners[t] ||= []).push(h); }),
    removeEventListener: vi.fn((t: string, h: (e: unknown) => void) => { listeners[t] = (listeners[t] || []).filter((x) => x !== h); }),
  };
}

describe('Batch 20 — unsaved-change beforeunload guard', () => {
  it('registers a beforeunload listener when enabled and removes it on cleanup', () => {
    const win = fakeWin();
    const cleanup = beforeUnloadGuard(true, win as never);
    expect(win.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(win.listeners['beforeunload']).toHaveLength(1);
    cleanup();
    expect(win.listeners['beforeunload']).toHaveLength(0);
  });

  it('does NOT register when disabled (no unnecessary interception)', () => {
    const win = fakeWin();
    beforeUnloadGuard(false, win as never);
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it('the handler triggers the native prompt (preventDefault + returnValue)', () => {
    const win = fakeWin();
    beforeUnloadGuard(true, win as never);
    const handler = win.listeners['beforeunload'][0];
    const e = { preventDefault: vi.fn(), returnValue: undefined as unknown as string };
    handler(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.returnValue).toBe('');
  });

  it('no-ops safely when there is no window (SSR / node)', () => {
    const cleanup = beforeUnloadGuard(true, undefined);
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });
});
