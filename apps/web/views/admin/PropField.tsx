'use client';

import React from 'react';
import type { PropDef, SectionDef, SectionSlot, SelectOption } from '@/lib/cms/sectionRegistry';

/**
 * Shared property-field chrome for the Page Builder's properties panel
 * (Stage 04 Task A + F).
 *
 * Extracted from AdminPageLayoutEditor for two reasons:
 *
 *  1. `helpText` previously rendered in only 3 of 9 property-editor branches,
 *     so a declared help string on a `text` property — the type
 *     `quick-access.kicker` uses — never reached the DOM. One shell now
 *     produces the label, the description and their ARIA association, so no
 *     branch can omit them and none can duplicate them.
 *
 *  2. It makes the panel testable. The editor selects a block only in a click
 *     handler, so a static render never includes the properties panel; the
 *     reference false pass in this project was a test that asserted on the
 *     editor's SOURCE TEXT because it could not reach the DOM. These exports
 *     can be rendered directly.
 *
 * The `featured` and `image` types stay in the editor: they need its media and
 * article pickers. They use `PropFieldShell` for identical chrome.
 */

export function propFieldIds(blockId: string, propKey: string): { id: string; helpId: string } {
  const id = `prop-${blockId}-${propKey}`;
  return { id, helpId: `${id}-help` };
}

/**
 * Guidance for a property whose `requires` prerequisites are not yet filled in.
 * Returns null when satisfied or undeclared.
 *
 * Guidance only: the field stays editable and a stored value is never
 * discarded, because a dependency is routinely unsatisfied mid-edit.
 */
export function unmetDependency(slot: SectionSlot, prop: PropDef, def?: SectionDef): string | null {
  if (!prop.requires?.length) return null;
  const missing = prop.requires.filter((k) => {
    const v = slot.props[k];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length === 0) return null;
  const labels = missing.map((k) => def?.editableProps.find((p) => p.key === k)?.label ?? k);
  return `Takes effect once ${labels.join(' and ')} ${labels.length > 1 ? 'are' : 'is'} set.`;
}

interface ShellProps {
  blockId: string;
  prop: PropDef;
  unmet: string | null;
  /** Checkbox-style controls put the label after the control. */
  labelPosition?: 'before' | 'after';
  className?: string;
  children: React.ReactNode;
}

/** Label + control + description, with the description wired to the control. */
export function PropFieldShell({ blockId, prop, unmet, labelPosition = 'before', className = 'space-y-1', children }: ShellProps) {
  const { id, helpId } = propFieldIds(blockId, prop.key);
  const label = (
    <label htmlFor={id} className={labelPosition === 'after' ? 'text-xs text-stone-700' : 'text-[10px] font-mono uppercase text-stone-500'}>
      {prop.label}
    </label>
  );
  const description = prop.helpText || unmet ? (
    <p id={helpId} className="text-[10px] text-stone-400 leading-snug">
      {prop.helpText}
      {prop.helpText && unmet ? ' ' : null}
      {unmet ? <span className="text-amber-600">{unmet}</span> : null}
    </p>
  ) : null;

  if (labelPosition === 'after') {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">{children}{label}</div>
        {description}
      </div>
    );
  }
  return <div className={className}>{label}{children}{description}</div>;
}

/** Whether the shell should emit `aria-describedby` for this property. */
export function describedBy(blockId: string, prop: PropDef, unmet: string | null): string | undefined {
  return prop.helpText || unmet ? propFieldIds(blockId, prop.key).helpId : undefined;
}

interface SimpleFieldProps {
  blockId: string;
  slot: SectionSlot;
  prop: PropDef;
  def?: SectionDef;
  onChange: (key: string, value: string | number | boolean) => void;
}

/**
 * Every property type except `featured` and `image`. Returns null for those two
 * so the editor can render its picker-backed variants with the same chrome.
 */
export function SimplePropField({ blockId, slot, prop, def, onChange }: SimpleFieldProps) {
  if (prop.type === 'featured' || prop.type === 'image') return null;

  const val = slot.props[prop.key];
  const strVal = val === undefined || val === null ? '' : String(val);
  const unmet = unmetDependency(slot, prop, def);
  const { id } = propFieldIds(blockId, prop.key);
  const described = describedBy(blockId, prop, unmet);
  const base = 'w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs';

  if (prop.type === 'number') {
    return (
      <PropFieldShell blockId={blockId} prop={prop} unmet={unmet}>
        <input id={id} type="number" value={strVal} min={prop.min ?? 0} max={prop.max ?? 99}
          aria-describedby={described} className={base}
          onChange={(e) => onChange(prop.key, Number(e.target.value))} />
      </PropFieldShell>
    );
  }

  if (prop.type === 'boolean') {
    return (
      <PropFieldShell blockId={blockId} prop={prop} unmet={unmet} labelPosition="after">
        <input id={id} type="checkbox" checked={!!val} aria-describedby={described}
          className="rounded border-stone-300"
          onChange={(e) => onChange(prop.key, e.target.checked)} />
      </PropFieldShell>
    );
  }

  if (prop.type === 'select') {
    return (
      <PropFieldShell blockId={blockId} prop={prop} unmet={unmet}>
        <select id={id} value={strVal} aria-describedby={described} className={base}
          onChange={(e) => onChange(prop.key, e.target.value)}>
          {(prop.options ?? []).map((opt: SelectOption) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </PropFieldShell>
    );
  }

  if (prop.type === 'textarea' || prop.type === 'richtext') {
    return (
      <PropFieldShell blockId={blockId} prop={prop} unmet={unmet}>
        <textarea id={id} value={strVal} rows={3} aria-describedby={described}
          className={`${base} resize-y`}
          onChange={(e) => onChange(prop.key, e.target.value)} />
      </PropFieldShell>
    );
  }

  if (prop.type === 'color') {
    return (
      <PropFieldShell blockId={blockId} prop={prop} unmet={unmet}>
        <input id={id} type="color" value={strVal || '#000000'} aria-describedby={described}
          className="w-10 h-8 rounded border border-stone-200 cursor-pointer"
          onChange={(e) => onChange(prop.key, e.target.value)} />
      </PropFieldShell>
    );
  }

  // text / url — the branch that previously dropped its declared help text.
  return (
    <PropFieldShell blockId={blockId} prop={prop} unmet={unmet}>
      <input id={id} type={prop.type === 'url' ? 'url' : 'text'} value={strVal}
        placeholder={prop.type === 'url' ? 'https://... or /path/' : ''}
        aria-describedby={described} className={base}
        onChange={(e) => onChange(prop.key, e.target.value)} />
    </PropFieldShell>
  );
}
