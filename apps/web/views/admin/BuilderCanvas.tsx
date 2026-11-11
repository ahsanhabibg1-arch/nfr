'use client';

import React from 'react';
import { CANVAS_SOURCE, BUILDER_SOURCE, isValidSlotId } from '@/components/builder/BuilderCanvasBridge';

/**
 * The Page Builder's centre panel: the real draft page (Stage 06 Task 3–5).
 *
 * It mounts `/admin/website/preview?embed=1`, which authenticates, enables
 * draft mode and redirects to the actual public route. So what appears here is
 * produced by the same pages, the same resolvers and the same `PageRenderer`
 * the public site uses — there is no second renderer and no example content.
 *
 * WHAT THE CANVAS SHOWS, PRECISELY: the last SAVED draft. The Builder's tree
 * and inspector hold unsaved edits in React state, and the canvas is a separate
 * document rendered by the server from the database. It therefore cannot show
 * an unsaved change, and the panel says so rather than letting the operator
 * assume otherwise. Saving refreshes it.
 */

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export const DEVICE_WIDTHS: Record<DeviceMode, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

export const DEVICE_LABELS: Record<DeviceMode, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

export interface CanvasMessage {
  source: typeof CANVAS_SOURCE;
  type: 'ready' | 'slot-selected';
  pageKey: string;
  slotId?: string | null;
}

/**
 * Validation for a message arriving FROM the canvas. The canvas is same-origin,
 * which proves only that we served the document — not that this message came
 * from it. Exported so the suite asserts the real predicate.
 */
export function isTrustedCanvasMessage(
  event: { origin: string; source: unknown; data: unknown },
  allowedOrigin: string,
  expectedSource: unknown,
  pageKey: string,
): event is { origin: string; source: unknown; data: CanvasMessage } {
  if (event.origin !== allowedOrigin) return false;
  // A null expected source means the iframe has not loaded; nothing can
  // legitimately be speaking for it yet.
  if (expectedSource === null || expectedSource === undefined) return false;
  if (event.source !== expectedSource) return false;
  const data = event.data;
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Partial<CanvasMessage>;
  if (msg.source !== CANVAS_SOURCE) return false;
  if (msg.type !== 'ready' && msg.type !== 'slot-selected') return false;
  if (typeof msg.pageKey !== 'string' || msg.pageKey !== pageKey) return false;
  if (msg.slotId !== undefined && msg.slotId !== null && !isValidSlotId(msg.slotId)) return false;
  return true;
}

/**
 * Whether a save outcome has earned a canvas reload (Stage 06 Task 6 + 12.9).
 *
 * Extracted as a pure function so the rule is provable. The claim "a failed
 * save does not refresh the canvas, so the panel never implies a change was
 * stored when it was not" was otherwise only inspectable by reading the
 * handler — and a `startTransition` callback cannot be driven from a test
 * runner with no DOM. The editor calls this; `stage06-builder-dom.test.ts`
 * asserts both branches.
 */
export function canvasTokenAfterSave(result: { ok: boolean }, current: number): number {
  return result.ok ? current + 1 : current;
}

interface Props {
  pageKey: string;
  selectedBlockId: string | null;
  onSelectBlock: (slotId: string | null) => void;
  /** Bumping this reloads the canvas — used after a successful save. */
  refreshToken: number;
  /** True while unsaved edits mean the canvas is behind the tree. */
  stale: boolean;
  deviceMode: DeviceMode;
  onDeviceModeChange: (mode: DeviceMode) => void;
}

export const BuilderCanvas: React.FC<Props> = ({
  pageKey,
  selectedBlockId,
  onSelectBlock,
  refreshToken,
  stale,
  deviceMode,
  onDeviceModeChange,
}) => {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // Remembered across a refresh so the operator keeps their place (Task 6).
  const scrollRef = React.useRef(0);

  const src = `/admin/website/preview?pageKey=${encodeURIComponent(pageKey)}&embed=1&t=${refreshToken}`;

  /* Receive selections from the canvas. */
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const allowedOrigin = window.location.origin;

    const onMessage = (e: MessageEvent) => {
      const expected = frameRef.current?.contentWindow ?? null;
      if (!isTrustedCanvasMessage(e, allowedOrigin, expected, pageKey)) return;
      const msg = e.data as CanvasMessage;
      if (msg.type === 'ready') {
        setReady(true);
        setLoading(false);
        return;
      }
      // A click on page chrome rather than a block clears the selection, which
      // is the same meaning a click on empty tree space has.
      onSelectBlock(msg.slotId && isValidSlotId(msg.slotId) ? msg.slotId : null);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pageKey, onSelectBlock]);

  /* Push the tree's selection into the canvas. */
  React.useEffect(() => {
    if (!ready) return;
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(
      { source: BUILDER_SOURCE, type: 'highlight', pageKey, slotId: selectedBlockId },
      window.location.origin, // explicit target origin, never '*'
    );
  }, [selectedBlockId, ready, pageKey]);

  /* Reset transient state when the page or refresh token changes. */
  React.useEffect(() => {
    setLoading(true);
    setReady(false);
    setFailed(false);
  }, [src]);

  const handleLoad = () => {
    setLoading(false);
    // Restore the remembered scroll position. Same-origin, so this is readable;
    // wrapped because a redirect chain can briefly deny access.
    try {
      const win = frameRef.current?.contentWindow;
      if (win && scrollRef.current > 0) win.scrollTo({ top: scrollRef.current });
    } catch {
      /* Not critical — the canvas simply opens at the top. */
    }
  };

  const rememberScroll = () => {
    try {
      const win = frameRef.current?.contentWindow;
      if (win) scrollRef.current = win.scrollY;
    } catch {
      /* ignore */
    }
  };
  React.useEffect(() => {
    rememberScroll();
  }, [refreshToken]);

  const width = DEVICE_WIDTHS[deviceMode];

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded border border-stone-200 bg-white">
      {/* ── Canvas toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">Canvas</h3>
          <span className="text-[10px] text-stone-400">live draft</span>
        </div>

        <div className="flex items-center gap-2">
          <div role="group" aria-label="Preview width" className="flex items-center overflow-hidden rounded border border-stone-300">
            {(Object.keys(DEVICE_WIDTHS) as DeviceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onDeviceModeChange(mode)}
                aria-pressed={deviceMode === mode}
                className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  deviceMode === mode ? 'bg-[#0F1115] text-[#D4A757]' : 'bg-white text-stone-600 hover:bg-stone-100'
                }`}
              >
                {DEVICE_LABELS[mode]}
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px] text-stone-500" aria-live="polite">
            {width}px
          </span>
          <a
            href={`/admin/website/preview?pageKey=${encodeURIComponent(pageKey)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-stone-300 px-2 py-1 text-[10px] font-semibold text-stone-700 hover:bg-stone-100"
            title="Open the draft in a new tab, where links work normally"
          >
            Open page ↗
          </a>
        </div>
      </div>

      {/* ── Honest status strip ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 bg-white px-3 py-1.5">
        {stale ? (
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            Canvas shows the last saved draft — save to see your latest edits here
          </span>
        ) : (
          <span className="text-[10px] text-stone-400">Showing the saved draft. Click a section to select it.</span>
        )}
      </div>

      {/* ── Viewport ───────────────────────────────────────────────── */}
      <div className="relative min-h-[420px] flex-1 overflow-auto bg-stone-100 p-3">
        {loading && !failed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-100/80" role="status">
            <span className="text-xs text-stone-500">Loading the draft page…</span>
          </div>
        )}
        <div className="mx-auto bg-white shadow-sm transition-[width] duration-200" style={{ width, maxWidth: '100%' }}>
          <iframe
            ref={frameRef}
            key={src}
            src={src}
            title={`Draft preview canvas for ${pageKey}`}
            onLoad={handleLoad}
            onError={() => {
              setFailed(true);
              setLoading(false);
            }}
            className="block h-[70vh] min-h-[420px] w-full border-0"
            /**
             * `allow-same-origin` is required: the bridge must read this
             * document and talk to its opener, and the page is ours. Scripts are
             * needed because the public site is a React app. No `allow-popups`,
             * `allow-top-navigation` or `allow-downloads` — the canvas has no
             * business leaving the frame.
             */
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        </div>
        {failed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <p className="max-w-sm rounded border border-rose-200 bg-rose-50 px-4 py-3 text-center text-xs text-rose-800">
              The canvas could not load this page. Use &ldquo;Open page&rdquo; to see the error directly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuilderCanvas;
