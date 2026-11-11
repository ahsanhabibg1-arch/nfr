import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stage 04 Task A + F — editor property-field DOM tests.
 *
 * BEHAVIOUR PROVEN: the admin property panel renders declared `helpText` in the
 * DOM for every property type that declares it — including `text`, the branch
 * that previously dropped it — associates the description with its control, and
 * surfaces guidance when a `requires` dependency is unmet.
 *
 * Why this matters. The programme's reference false pass is
 * `tests/batch-t4-quick-access-helptext.test.ts`, named "editor renders helpText
 * for text props", which asserts `toContain('helpText')` against the whole
 * editor FILE. That substring is present in three unrelated prop branches, so
 * the test passed while the `text` branch rendered no help text at all.
 *
 * It asserted on source text because it could not reach the DOM: the editor
 * selects a block only inside a click handler, so a static render never includes
 * the properties panel. Stage 04 extracted the field chrome into
 * `views/admin/PropField.tsx`, which makes the real rendering path directly
 * renderable — no jsdom, no new dependencies, and no source-text assertions.
 */

const { SimplePropField, PropFieldShell, unmetDependency, propFieldIds, describedBy } =
  await import('../views/admin/PropField');
const { HOMEPAGE_SECTIONS } = await import('../lib/cms/sectionRegistry');
import type { PropDef, SectionDef, SectionSlot } from '../lib/cms/sectionRegistry';

const QUICK_ACCESS = HOMEPAGE_SECTIONS.find((d) => d.type === 'quick-access')! as SectionDef;
const KICKER = QUICK_ACCESS.editableProps.find((p) => p.key === 'kicker')!;

const BLOCK_ID = 'dom-slot-1';

function slot(props: Record<string, unknown>, sectionType = 'quick-access'): SectionSlot {
  return { id: BLOCK_ID, sectionType, visible: true, order: 0, props } as SectionSlot;
}

function renderField(prop: PropDef, s: SectionSlot, def?: SectionDef): string {
  return renderToStaticMarkup(
    React.createElement(SimplePropField, { blockId: BLOCK_ID, slot: s, prop, def, onChange: () => {} }),
  );
}

/** React escapes text children, so expected strings must be escaped to match. */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Task A — helpText reaches the DOM ─────────────────────────────── */

describe('Stage 04 Task A — declared helpText renders in the property panel DOM', () => {
  it('the registry still declares helpText on quick-access.kicker, and it is a `text` prop', () => {
    expect(KICKER.type).toBe('text');
    expect(KICKER.helpText, 'this test depends on that help string existing').toBeTruthy();
  });

  it('renders that help text for a TEXT property — the branch that previously dropped it', () => {
    const html = renderField(KICKER, slot({ ...QUICK_ACCESS.defaultProps }), QUICK_ACCESS);
    expect(html, "quick-access.kicker help text is missing from the DOM").toContain(esc(KICKER.helpText!));
  });

  it('renders it exactly once — no duplicated help text', () => {
    const html = renderField(KICKER, slot({ ...QUICK_ACCESS.defaultProps }), QUICK_ACCESS);
    expect(html.split(esc(KICKER.helpText!)).length - 1).toBe(1);
  });

  it('associates the description with the input via aria-describedby', () => {
    const html = renderField(KICKER, slot({}), QUICK_ACCESS);
    const { id, helpId } = propFieldIds(BLOCK_ID, 'kicker');
    expect(html).toContain(`aria-describedby="${helpId}"`);
    expect(html).toContain(`id="${helpId}"`);
    expect(html).toContain(`id="${id}"`);
  });

  it('binds the label to the input with htmlFor', () => {
    const html = renderField(KICKER, slot({}), QUICK_ACCESS);
    const { id } = propFieldIds(BLOCK_ID, 'kicker');
    expect(html).toContain(`for="${id}"`);
  });

  it('a property with no helpText emits no description element and no aria-describedby', () => {
    const title = QUICK_ACCESS.editableProps.find((p) => p.key === 'title')!;
    expect(title.helpText, 'fixture assumes title declares no help text').toBeFalsy();
    const html = renderField(title, slot({}), QUICK_ACCESS);
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toContain(propFieldIds(BLOCK_ID, 'title').helpId);
  });

  it('renders helpText for EVERY type the shared field handles', () => {
    const types: { prop: PropDef; sentinel: string }[] = [
      { prop: { key: 'p1', label: 'Text', type: 'text', helpText: 'ZzHelpText' }, sentinel: 'ZzHelpText' },
      { prop: { key: 'p2', label: 'Url', type: 'url', helpText: 'ZzHelpUrl' }, sentinel: 'ZzHelpUrl' },
      { prop: { key: 'p3', label: 'Area', type: 'textarea', helpText: 'ZzHelpArea' }, sentinel: 'ZzHelpArea' },
      { prop: { key: 'p4', label: 'Rich', type: 'richtext', helpText: 'ZzHelpRich' }, sentinel: 'ZzHelpRich' },
      { prop: { key: 'p5', label: 'Num', type: 'number', helpText: 'ZzHelpNum' }, sentinel: 'ZzHelpNum' },
      { prop: { key: 'p6', label: 'Bool', type: 'boolean', helpText: 'ZzHelpBool' }, sentinel: 'ZzHelpBool' },
      { prop: { key: 'p7', label: 'Sel', type: 'select', helpText: 'ZzHelpSel', options: [{ value: 'a', label: 'A' }] }, sentinel: 'ZzHelpSel' },
      { prop: { key: 'p8', label: 'Col', type: 'color', helpText: 'ZzHelpColor' }, sentinel: 'ZzHelpColor' },
    ];
    for (const { prop, sentinel } of types) {
      const html = renderField(prop, slot({}));
      expect(html, `${prop.type} dropped its help text`).toContain(sentinel);
      expect(html, `${prop.type} missing aria-describedby`).toContain('aria-describedby');
    }
  });

  it('the boolean variant still places its label after the control', () => {
    const prop: PropDef = { key: 'b1', label: 'ZzBoolLabel', type: 'boolean', helpText: 'ZzBoolHelp' };
    const html = renderField(prop, slot({}));
    expect(html.indexOf('type="checkbox"')).toBeLessThan(html.indexOf('ZzBoolLabel'));
    expect(html).toContain('ZzBoolHelp');
  });

  it('picker-backed types are delegated to the editor, not handled here', () => {
    for (const type of ['featured', 'image'] as const) {
      const html = renderField({ key: 'x', label: 'X', type }, slot({}));
      expect(html, `${type} must be rendered by the editor's picker branch`).toBe('');
    }
  });

  it('renders the stored value, so editing starts from what is saved', () => {
    const html = renderField(KICKER, slot({ kicker: 'ZzStoredKicker' }), QUICK_ACCESS);
    expect(html).toContain('ZzStoredKicker');
  });
});

/* ── Task F — unmet dependency guidance ───────────────────────────── */

describe('Stage 04 Task F — unmet dependency guidance', () => {
  const probe: SectionDef = {
    type: 'probe', label: 'Probe', category: 'content', defaultProps: {},
    editableProps: [
      { key: 'ctaText', label: 'Button text', type: 'text' },
      { key: 'ctaUrl', label: 'Button URL', type: 'url', requires: ['ctaText'] },
    ],
  };
  const dependent = probe.editableProps[1];

  it('unmetDependency reports nothing when the property declares none', () => {
    expect(unmetDependency(slot({}), probe.editableProps[0], probe)).toBeNull();
  });

  it('reports guidance naming the prerequisite by its LABEL, not its key', () => {
    const msg = unmetDependency(slot({ ctaUrl: '/x' }, 'probe'), dependent, probe);
    expect(msg).toContain('Button text');
    expect(msg).not.toContain('ctaText');
  });

  it('treats a whitespace-only prerequisite as unmet', () => {
    expect(unmetDependency(slot({ ctaText: '   ' }, 'probe'), dependent, probe)).toBeTruthy();
  });

  it('clears once the prerequisite holds a value', () => {
    expect(unmetDependency(slot({ ctaText: 'Read more' }, 'probe'), dependent, probe)).toBeNull();
  });

  it('the guidance appears in the rendered field', () => {
    const html = renderField(dependent, slot({ ctaUrl: '/x' }, 'probe'), probe);
    expect(html).toContain('Takes effect once');
    expect(html).toContain('Button URL');
  });

  it('PRESERVES the dependent value while the dependency is unsatisfied', () => {
    // An unmet dependency must never discard what the admin typed.
    const html = renderField(dependent, slot({ ctaUrl: '/zz-kept-value' }, 'probe'), probe);
    expect(html).toContain('/zz-kept-value');
  });

  it('the field stays enabled, so the admin can fill either order', () => {
    const html = renderField(dependent, slot({ ctaUrl: '/x' }, 'probe'), probe);
    expect(html).not.toContain('disabled');
  });

  it('names multiple missing prerequisites together', () => {
    const multi: SectionDef = {
      type: 'probe2', label: 'P2', category: 'content', defaultProps: {},
      editableProps: [
        { key: 'a', label: 'Alpha', type: 'text' },
        { key: 'b', label: 'Beta', type: 'text' },
        { key: 'c', label: 'Gamma', type: 'text', requires: ['a', 'b'] },
      ],
    };
    const msg = unmetDependency(slot({}, 'probe2'), multi.editableProps[2], multi);
    expect(msg).toContain('Alpha and Beta');
    expect(msg).toContain('are set');
  });

  it('combines declared helpText with dependency guidance without losing either', () => {
    const prop: PropDef = { key: 'ctaUrl', label: 'Button URL', type: 'url', helpText: 'ZzOwnHelp', requires: ['ctaText'] };
    const html = renderField(prop, slot({}, 'probe'), probe);
    expect(html).toContain('ZzOwnHelp');
    expect(html).toContain('Takes effect once');
  });

  it('a real registry block surfaces its ctaUrl dependency', () => {
    const cta = HOMEPAGE_SECTIONS.find((d) => d.type === 'cta-banner')! as SectionDef;
    const ctaUrl = cta.editableProps.find((p) => p.key === 'ctaUrl')!;
    const html = renderField(ctaUrl, slot({ ctaUrl: '/x', ctaText: '' }, 'cta-banner'), cta);
    expect(html).toContain('Takes effect once');
  });
});

/* ── Shell contract ───────────────────────────────────────────────── */

describe('Stage 04 — PropFieldShell is the single source of field chrome', () => {
  it('describedBy returns an id only when there is a description', () => {
    expect(describedBy(BLOCK_ID, { key: 'k', label: 'L', type: 'text' }, null)).toBeUndefined();
    expect(describedBy(BLOCK_ID, { key: 'k', label: 'L', type: 'text', helpText: 'h' }, null)).toBe(propFieldIds(BLOCK_ID, 'k').helpId);
    expect(describedBy(BLOCK_ID, { key: 'k', label: 'L', type: 'text' }, 'unmet')).toBe(propFieldIds(BLOCK_ID, 'k').helpId);
  });

  it('wraps arbitrary children with a bound label and description', () => {
    const html = renderToStaticMarkup(
      React.createElement(PropFieldShell, {
        blockId: BLOCK_ID,
        prop: { key: 'custom', label: 'ZzCustomLabel', type: 'image', helpText: 'ZzCustomHelp' },
        unmet: null,
        children: React.createElement('input', { id: propFieldIds(BLOCK_ID, 'custom').id }),
      }),
    );
    expect(html).toContain('ZzCustomLabel');
    expect(html).toContain('ZzCustomHelp');
    expect(html).toContain(`for="${propFieldIds(BLOCK_ID, 'custom').id}"`);
  });
});
