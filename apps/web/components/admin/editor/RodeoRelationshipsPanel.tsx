'use client';

import React, { useState } from 'react';
import type { ArticleRelationshipOptions, RelationshipOption } from '../../../lib/cms/relationshipTypes';

export interface RodeoRelationshipsData {
  disciplineIds: string[];
  hubIds: string[];
  eventIds: string[];
  editionIds: string[];
}

interface RodeoRelationshipsPanelProps {
  relationships: RodeoRelationshipsData;
  /** Database-backed choices (loaded server-side). */
  options: ArticleRelationshipOptions;
  onChange: (updated: RodeoRelationshipsData) => void;
}

type Tab = 'disciplines' | 'hubs' | 'events' | 'editions';
type Key = keyof RodeoRelationshipsData;
const TAB_KEY: Record<Tab, Key> = { disciplines: 'disciplineIds', hubs: 'hubIds', events: 'eventIds', editions: 'editionIds' };
const TAB_LABEL: Record<Tab, string> = { disciplines: 'Disciplines', hubs: 'Rodeo Hubs', events: 'Recurring Events', editions: 'Event Editions' };
const CHIP_LABEL: Record<Tab, string> = { disciplines: 'Discipline', hubs: 'Hub', events: 'Event', editions: 'Edition' };

/**
 * Article ↔ discipline / hub / event / edition associations (Requirements v2.0 §6.1, §7.3).
 * Choices come from the database. An edition can only be selected once its parent event is
 * selected, and removing an event also removes its editions — the server enforces the same
 * rule (ADM-06), this just keeps the UI consistent with it.
 */
export const RodeoRelationshipsPanel: React.FC<RodeoRelationshipsPanelProps> = ({ relationships, options, onChange }) => {
  const [activeTab, setActiveTab] = useState<Tab>('disciplines');

  const byTab: Record<Tab, RelationshipOption[]> = {
    disciplines: options.disciplines,
    hubs: options.hubs,
    events: options.events,
    editions: options.editions.filter((ed) => relationships.eventIds.includes(ed.eventId)),
  };
  const allById = (tab: Tab) => new Map((tab === 'editions' ? options.editions : byTab[tab]).map((o) => [o.id, o]));

  const toggle = (tab: Tab, id: string) => {
    const key = TAB_KEY[tab];
    const has = relationships[key].includes(id);
    const next = { ...relationships, [key]: has ? relationships[key].filter((x) => x !== id) : [...relationships[key], id] };
    if (tab === 'events' && has) {
      // Unlinking an event drops its editions (an edition must match a linked parent event).
      const orphaned = new Set(options.editions.filter((ed) => ed.eventId === id).map((ed) => ed.id));
      next.editionIds = next.editionIds.filter((e) => !orphaned.has(e));
    }
    onChange(next);
  };

  const totalLinked = Object.values(relationships).reduce((n, ids) => n + ids.length, 0);
  const tabs: Tab[] = ['disciplines', 'hubs', 'events', 'editions'];

  return (
    <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div>
          <h4 className="font-serif font-bold text-stone-900 text-sm">Rodeo Entity Relationships</h4>
          <p className="text-[11px] text-ink-muted font-sans">
            Optional. Connect this article to disciplines, hubs, recurring events or a specific edition. Evergreen articles need no edition.
          </p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 bg-stone-100 text-stone-700 rounded-xs font-semibold">{totalLinked} Linked</span>
      </div>

      {totalLinked > 0 ? (
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-stone-50 border border-stone-200 rounded-xs">
          {tabs.flatMap((tab) => {
            const lookup = allById(tab);
            return relationships[TAB_KEY[tab]].map((id) => (
              <span key={`${tab}-${id}`} className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-stone-300 text-stone-900 px-2 py-0.5 rounded-xs">
                <span className="text-ink-muted font-bold">{CHIP_LABEL[tab]}:</span> {lookup.get(id)?.label ?? `Unknown (${id})`}
                <button type="button" onClick={() => toggle(tab, id)} className="text-ink-muted hover:text-rose-600 ml-1" aria-label={`Remove ${CHIP_LABEL[tab]}`}>
                  &times;
                </button>
              </span>
            ));
          })}
        </div>
      ) : (
        <div className="p-2.5 bg-stone-50 border border-dashed border-stone-200 rounded-xs text-[11px] text-ink-muted italic text-center">
          No rodeo entities associated yet.
        </div>
      )}

      <div className="flex border-b border-stone-200 text-xs font-sans" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`py-1.5 px-3 border-b-2 font-medium transition-colors ${
              activeTab === tab ? 'border-[#D4A757] text-stone-900 font-bold' : 'border-transparent text-ink-muted hover:text-stone-800'
            }`}
          >
            {TAB_LABEL[tab]} ({relationships[TAB_KEY[tab]].length})
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {byTab[activeTab].length === 0 ? (
          <p className="text-[11px] text-ink-muted italic p-2">
            {activeTab === 'editions'
              ? 'Select a recurring event first to choose one of its editions.'
              : `No ${TAB_LABEL[activeTab].toLowerCase()} exist yet. Add them in Rodeo Coverage.`}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {byTab[activeTab].map((opt) => {
              const isChecked = relationships[TAB_KEY[activeTab]].includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-2 p-2 rounded-xs border text-xs cursor-pointer transition-colors ${
                    isChecked ? 'bg-[#F7F3EA] border-[#D4A757] text-stone-900 font-semibold' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <input type="checkbox" checked={isChecked} onChange={() => toggle(activeTab, opt.id)} className="mt-0.5 rounded-xs text-[#D4A757]" />
                  <div>
                    <span className="block leading-snug">{opt.label}</span>
                    {opt.detail && <span className="text-[10px] text-ink-muted font-mono font-normal">{opt.detail}</span>}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
