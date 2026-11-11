import { describe, it, expect } from 'vitest';

/**
 * Stage 06 Task 4 + 11 — canvas/Builder message bridge.
 *
 * BEHAVIOUR PROVEN: every message crossing the frame boundary is validated on
 * origin, sender identity, provenance marker, message type, editor context and
 * slot identity — in BOTH directions — and a message failing any one of those
 * is rejected.
 *
 * These call the real exported predicates the bridge and the canvas component
 * use at runtime. They are not re-implementations: if `isTrustedBuilderMessage`
 * stops checking `event.source`, these tests fail, which is the point. The
 * mutation runs in STAGE_06_TEST_AND_MUTATION_REPORT.md confirm that.
 *
 * Why this is tested so heavily for a same-origin frame: same-origin proves
 * only that WE served the document, not that the sender is the Builder. Any
 * frame that can get a handle to the canvas window can post to it, and the
 * canvas runs with `allow-scripts`.
 */

const {
  isTrustedBuilderMessage, isValidSlotId, readCanvasContext,
  CANVAS_SOURCE, BUILDER_SOURCE, CANVAS_FLAG_PARAM, CANVAS_PAGE_KEY_PARAM,
} = await import('../components/builder/BuilderCanvasBridge');

const { isTrustedCanvasMessage, DEVICE_WIDTHS, DEVICE_LABELS } = await import('../views/admin/BuilderCanvas');

const fs = await import('node:fs');
const bridgeSrc = fs.readFileSync(new URL('../components/builder/BuilderCanvasBridge.tsx', import.meta.url), 'utf8');

const ORIGIN = 'https://nfrguide.test';
const PAGE_KEY = 'homepage';
const PARENT = { id: 'parent-window' };
const IFRAME = { id: 'iframe-window' };

/* ── Child side: messages FROM the Builder ─────────────────────────── */

const goodFromBuilder = {
  origin: ORIGIN,
  source: PARENT,
  data: { source: BUILDER_SOURCE, type: 'highlight', pageKey: PAGE_KEY, slotId: 'slot-abc' },
};

describe('Stage 06 — canvas accepts a well-formed Builder message', () => {
  it('accepts the valid case', () => {
    expect(isTrustedBuilderMessage(goodFromBuilder, ORIGIN, PARENT, PAGE_KEY)).toBe(true);
  });

  it('accepts a null slotId, which means "clear the selection"', () => {
    const msg = { ...goodFromBuilder, data: { ...goodFromBuilder.data, slotId: null } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(true);
  });

  it('accepts a ping', () => {
    const msg = { ...goodFromBuilder, data: { ...goodFromBuilder.data, type: 'ping' } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(true);
  });
});

describe('Stage 06 Task 12.4 — canvas REJECTS a foreign origin', () => {
  it('rejects a different host', () => {
    const msg = { ...goodFromBuilder, origin: 'https://evil.example' };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects a different scheme on the same host', () => {
    const msg = { ...goodFromBuilder, origin: 'http://nfrguide.test' };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects the "null" origin a sandboxed or data: frame presents', () => {
    const msg = { ...goodFromBuilder, origin: 'null' };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects a subdomain of the allowed origin', () => {
    const msg = { ...goodFromBuilder, origin: 'https://admin.nfrguide.test' };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('matches on exact origin, never a prefix', () => {
    const msg = { ...goodFromBuilder, origin: `${ORIGIN}.evil.example` };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });
});

describe('Stage 06 Task 12.5 — canvas REJECTS a message from the wrong sender', () => {
  it('rejects a same-origin sibling frame that is not our parent', () => {
    const sibling = { id: 'sibling-window' };
    expect(isTrustedBuilderMessage({ ...goodFromBuilder, source: sibling }, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects everything when there is no parent — a top-level document', () => {
    // Guards the case where the bridge somehow runs outside a frame: there is
    // no legitimate sender at all, so nothing may be honoured.
    expect(isTrustedBuilderMessage(goodFromBuilder, ORIGIN, null, PAGE_KEY)).toBe(false);
  });

  it('rejects a null source', () => {
    expect(isTrustedBuilderMessage({ ...goodFromBuilder, source: null }, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });
});

describe('Stage 06 — canvas REJECTS malformed or foreign payloads', () => {
  it('rejects a missing provenance marker', () => {
    const msg = { ...goodFromBuilder, data: { type: 'highlight', pageKey: PAGE_KEY } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects a message claiming to be from the canvas itself', () => {
    const msg = { ...goodFromBuilder, data: { ...goodFromBuilder.data, source: CANVAS_SOURCE } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects an unknown message type', () => {
    const msg = { ...goodFromBuilder, data: { ...goodFromBuilder.data, type: 'eval' } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects a string payload', () => {
    expect(isTrustedBuilderMessage({ ...goodFromBuilder, data: 'highlight' }, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects null and undefined payloads', () => {
    expect(isTrustedBuilderMessage({ ...goodFromBuilder, data: null }, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
    expect(isTrustedBuilderMessage({ ...goodFromBuilder, data: undefined }, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });
});

describe('Stage 06 — canvas REJECTS a message aimed at another page', () => {
  it('rejects a mismatched pageKey', () => {
    const msg = { ...goodFromBuilder, data: { ...goodFromBuilder.data, pageKey: 'section:competition' } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });

  it('rejects a missing pageKey', () => {
    const msg = { ...goodFromBuilder, data: { source: BUILDER_SOURCE, type: 'highlight' } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });
});

/* ── Slot identity (Task 12.6) ─────────────────────────────────────── */

describe('Stage 06 Task 12.6 — invalid slot ids are rejected', () => {
  it('accepts a UUID and the fallback blk_ form', () => {
    expect(isValidSlotId('6c972912-55c8-44ad-ac84-bde18f9cc36b')).toBe(true);
    expect(isValidSlotId('blk_1731000000000_a1b2c3')).toBe(true);
  });

  const hostile = [
    ['a selector breakout', 'x"] , script'],
    ['a quote', 'slot"id'],
    ['an HTML tag', '<img src=x onerror=alert(1)>'],
    ['a wildcard selector', '*'],
    ['whitespace', 'slot id'],
    ['an empty string', ''],
    ['a CSS combinator', 'a>b'],
    ['a backslash escape', 'a\\"b'],
  ] as const;

  for (const [label, value] of hostile) {
    it(`rejects ${label}`, () => {
      expect(isValidSlotId(value)).toBe(false);
    });
  }

  it('rejects non-string ids', () => {
    for (const v of [null, undefined, 42, {}, []]) expect(isValidSlotId(v)).toBe(false);
  });

  it('rejects an over-long id', () => {
    expect(isValidSlotId('a'.repeat(65))).toBe(false);
  });

  it('a hostile slotId in an otherwise valid message is rejected', () => {
    const msg = { ...goodFromBuilder, data: { ...goodFromBuilder.data, slotId: '"><img src=x>' } };
    expect(isTrustedBuilderMessage(msg, ORIGIN, PARENT, PAGE_KEY)).toBe(false);
  });
});

/* ── Canvas activation context ─────────────────────────────────────── */

describe('Stage 06 — the bridge only activates inside the Builder canvas', () => {
  it('activates with the canvas flag, a page key and a parent frame', () => {
    const ctx = readCanvasContext(`?${CANVAS_FLAG_PARAM}=1&${CANVAS_PAGE_KEY_PARAM}=homepage`, true);
    expect(ctx.active).toBe(true);
    expect(ctx.pageKey).toBe('homepage');
  });

  it('stays inert in the standalone draft preview, so normal browsing still works', () => {
    // The "Preview Draft" window is in draft mode but carries no canvas flag:
    // suppressing its links would make the preview useless.
    const ctx = readCanvasContext('?_preview=draft&_pk=homepage', true);
    expect(ctx.active).toBe(false);
  });

  it('stays inert when not framed, even with the flag present', () => {
    const ctx = readCanvasContext(`?${CANVAS_FLAG_PARAM}=1&${CANVAS_PAGE_KEY_PARAM}=homepage`, false);
    expect(ctx.active).toBe(false);
  });

  it('stays inert without a page key, since no message could be matched', () => {
    expect(readCanvasContext(`?${CANVAS_FLAG_PARAM}=1`, true).active).toBe(false);
  });

  it('stays inert on a plain public page', () => {
    expect(readCanvasContext('', true).active).toBe(false);
  });
});

/* ── Parent side: messages FROM the canvas ─────────────────────────── */

const goodFromCanvas = {
  origin: ORIGIN,
  source: IFRAME,
  data: { source: CANVAS_SOURCE, type: 'slot-selected', pageKey: PAGE_KEY, slotId: 'slot-abc' },
};

describe('Stage 06 — the Builder validates messages from its own canvas', () => {
  it('accepts a well-formed selection', () => {
    expect(isTrustedCanvasMessage(goodFromCanvas, ORIGIN, IFRAME, PAGE_KEY)).toBe(true);
  });

  it('accepts a ready signal', () => {
    const msg = { ...goodFromCanvas, data: { source: CANVAS_SOURCE, type: 'ready', pageKey: PAGE_KEY } };
    expect(isTrustedCanvasMessage(msg, ORIGIN, IFRAME, PAGE_KEY)).toBe(true);
  });

  it('rejects a foreign origin', () => {
    expect(isTrustedCanvasMessage({ ...goodFromCanvas, origin: 'https://evil.example' }, ORIGIN, IFRAME, PAGE_KEY)).toBe(false);
  });

  it('rejects a window that is not our iframe', () => {
    expect(isTrustedCanvasMessage({ ...goodFromCanvas, source: { id: 'other' } }, ORIGIN, IFRAME, PAGE_KEY)).toBe(false);
  });

  it('rejects everything before the iframe exists', () => {
    expect(isTrustedCanvasMessage(goodFromCanvas, ORIGIN, null, PAGE_KEY)).toBe(false);
    expect(isTrustedCanvasMessage(goodFromCanvas, ORIGIN, undefined, PAGE_KEY)).toBe(false);
  });

  it('rejects a message forged to look like it came from the Builder', () => {
    const msg = { ...goodFromCanvas, data: { ...goodFromCanvas.data, source: BUILDER_SOURCE } };
    expect(isTrustedCanvasMessage(msg, ORIGIN, IFRAME, PAGE_KEY)).toBe(false);
  });

  it('rejects a selection for a different page', () => {
    const msg = { ...goodFromCanvas, data: { ...goodFromCanvas.data, pageKey: 'directory:venues' } };
    expect(isTrustedCanvasMessage(msg, ORIGIN, IFRAME, PAGE_KEY)).toBe(false);
  });

  it('rejects a hostile slot id', () => {
    const msg = { ...goodFromCanvas, data: { ...goodFromCanvas.data, slotId: '*' } };
    expect(isTrustedCanvasMessage(msg, ORIGIN, IFRAME, PAGE_KEY)).toBe(false);
  });

  it('rejects an unknown type', () => {
    const msg = { ...goodFromCanvas, data: { ...goodFromCanvas.data, type: 'save' } };
    expect(isTrustedCanvasMessage(msg, ORIGIN, IFRAME, PAGE_KEY)).toBe(false);
  });
});

/* ── Device widths (Task 12.7) ─────────────────────────────────────── */

describe('Stage 06 Task 12.7 — device widths', () => {
  it('uses the three widths the stage specifies', () => {
    expect(DEVICE_WIDTHS.desktop).toBe(1280);
    expect(DEVICE_WIDTHS.tablet).toBe(768);
    expect(DEVICE_WIDTHS.mobile).toBe(390);
  });

  it('labels all three modes', () => {
    expect(Object.keys(DEVICE_LABELS).sort()).toEqual(['desktop', 'mobile', 'tablet']);
  });
});

/* ── The bridge's own blast radius ─────────────────────────────────── */

describe('Stage 06 Task 11 — the bridge cannot reach privileged code', () => {
  /**
   * A capability check, not a style check: the claim "a forged message cannot
   * write to the database" rests on the bridge having no transport and no
   * server action. If one is ever added, every validation test above becomes
   * insufficient and this fails to say so.
   */
  it('contains no network transport', () => {
    expect(bridgeSrc).not.toMatch(/\bfetch\s*\(/);
    expect(bridgeSrc).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/);
  });

  it('imports no server action or data module', () => {
    const imports = [...bridgeSrc.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['react']);
  });

  it('posts with an explicit target origin and never a wildcard', () => {
    expect(bridgeSrc).toContain('allowedOrigin');
    expect(bridgeSrc).not.toMatch(/postMessage\([^)]*,\s*'\*'/);
  });

  it('never assigns message data into the DOM', () => {
    // The only dangerouslySetInnerHTML is the authored stylesheet constant.
    const danger = [...bridgeSrc.matchAll(/dangerouslySetInnerHTML=\{\{\s*__html:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    expect(danger).toEqual(['CANVAS_STYLES']);
    expect(bridgeSrc).not.toMatch(/\.innerHTML\s*=/);
    expect(bridgeSrc).not.toMatch(/insertAdjacentHTML|document\.write/);
  });
});
