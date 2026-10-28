import React, { useState } from 'react';
import { RODEO_HUBS, RECURRING_RODEO_EVENTS, SEVEN_DISCIPLINES } from '../../../data/mockEditorialData';

export interface RodeoRelationshipsData {
  disciplineIds: string[];
  hubIds: string[];
  eventIds: string[];
  editionIds: string[];
}

interface RodeoRelationshipsPanelProps {
  relationships: RodeoRelationshipsData;
  onChange: (updated: RodeoRelationshipsData) => void;
}

const EVENT_EDITIONS = [
  { id: 'nfr-2026', name: '2026 National Finals Rodeo (68th Edition)', eventId: 'nfr-championship', dates: 'Dec 3–12, 2026' },
  { id: 'nfr-2025', name: '2025 National Finals Rodeo (67th Edition)', eventId: 'nfr-championship', dates: 'Dec 4–13, 2025' },
  { id: 'calgary-2026', name: '2026 Calgary Stampede', eventId: 'calgary-stampede', dates: 'July 3–12, 2026' },
  { id: 'cheyenne-2026', name: '2026 Cheyenne Frontier Days', eventId: 'cheyenne-frontier-days', dates: 'July 17–26, 2026' },
];

export const RodeoRelationshipsPanel: React.FC<RodeoRelationshipsPanelProps> = ({
  relationships,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<'disciplines' | 'hubs' | 'events' | 'editions'>('disciplines');
  const [filterQuery, setFilterQuery] = useState('');

  const toggleDiscipline = (id: string) => {
    const next = relationships.disciplineIds.includes(id)
      ? relationships.disciplineIds.filter((d) => d !== id)
      : [...relationships.disciplineIds, id];
    onChange({ ...relationships, disciplineIds: next });
  };

  const toggleHub = (id: string) => {
    const next = relationships.hubIds.includes(id)
      ? relationships.hubIds.filter((h) => h !== id)
      : [...relationships.hubIds, id];
    onChange({ ...relationships, hubIds: next });
  };

  const toggleEvent = (id: string) => {
    const next = relationships.eventIds.includes(id)
      ? relationships.eventIds.filter((e) => e !== id)
      : [...relationships.eventIds, id];
    onChange({ ...relationships, eventIds: next });
  };

  const toggleEdition = (id: string) => {
    const next = relationships.editionIds.includes(id)
      ? relationships.editionIds.filter((e) => e !== id)
      : [...relationships.editionIds, id];
    onChange({ ...relationships, editionIds: next });
  };

  const totalLinked =
    relationships.disciplineIds.length +
    relationships.hubIds.length +
    relationships.eventIds.length +
    relationships.editionIds.length;

  return (
    <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div>
          <h4 className="font-serif font-bold text-stone-900 text-sm">
            Rodeo Entity Relationships
          </h4>
          <p className="text-[11px] text-stone-500 font-sans">
            Connect this article to specific disciplines, geographic hubs, recurring events, or calendar editions.
          </p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 bg-stone-100 text-stone-700 rounded-xs font-semibold">
          {totalLinked} Linked
        </span>
      </div>

      {/* Selected Entity Chips Summary */}
      {totalLinked > 0 ? (
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-stone-50 border border-stone-200 rounded-xs">
          {relationships.disciplineIds.map((id) => {
            const disc = SEVEN_DISCIPLINES.find((d) => d.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-[#D4A757]/40 text-stone-900 px-2 py-0.5 rounded-xs"
              >
                <span className="text-[#8B5E3C] font-bold">Discipline:</span> {disc?.name || id}
                <button
                  type="button"
                  onClick={() => toggleDiscipline(id)}
                  className="text-stone-400 hover:text-rose-600 ml-1"
                >
                  &times;
                </button>
              </span>
            );
          })}

          {relationships.hubIds.map((id) => {
            const hub = RODEO_HUBS.find((h) => h.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-stone-300 text-stone-900 px-2 py-0.5 rounded-xs"
              >
                <span className="text-stone-500 font-bold">Hub:</span> {hub?.title || id}
                <button
                  type="button"
                  onClick={() => toggleHub(id)}
                  className="text-stone-400 hover:text-rose-600 ml-1"
                >
                  &times;
                </button>
              </span>
            );
          })}

          {relationships.eventIds.map((id) => {
            const ev = RECURRING_RODEO_EVENTS.find((e) => e.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-stone-300 text-stone-900 px-2 py-0.5 rounded-xs"
              >
                <span className="text-stone-500 font-bold">Event:</span> {ev?.name || id}
                <button
                  type="button"
                  onClick={() => toggleEvent(id)}
                  className="text-stone-400 hover:text-rose-600 ml-1"
                >
                  &times;
                </button>
              </span>
            );
          })}

          {relationships.editionIds.map((id) => {
            const ed = EVENT_EDITIONS.find((e) => e.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-stone-300 text-stone-900 px-2 py-0.5 rounded-xs"
              >
                <span className="text-stone-500 font-bold">Edition:</span> {ed?.name.slice(0, 20) || id}...
                <button
                  type="button"
                  onClick={() => toggleEdition(id)}
                  className="text-stone-400 hover:text-rose-600 ml-1"
                >
                  &times;
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="p-2.5 bg-stone-50 border border-dashed border-stone-200 rounded-xs text-[11px] text-stone-500 italic text-center">
          No rodeo entities associated yet. Select disciplines or events below.
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex border-b border-stone-200 text-xs font-sans">
        <button
          type="button"
          onClick={() => setActiveTab('disciplines')}
          className={`py-1.5 px-3 border-b-2 font-medium transition-colors ${
            activeTab === 'disciplines'
              ? 'border-[#D4A757] text-stone-900 font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          Disciplines ({relationships.disciplineIds.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('hubs')}
          className={`py-1.5 px-3 border-b-2 font-medium transition-colors ${
            activeTab === 'hubs'
              ? 'border-[#D4A757] text-stone-900 font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          Rodeo Hubs ({relationships.hubIds.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`py-1.5 px-3 border-b-2 font-medium transition-colors ${
            activeTab === 'events'
              ? 'border-[#D4A757] text-stone-900 font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          Recurring Events ({relationships.eventIds.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('editions')}
          className={`py-1.5 px-3 border-b-2 font-medium transition-colors ${
            activeTab === 'editions'
              ? 'border-[#D4A757] text-stone-900 font-bold'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          Event Editions ({relationships.editionIds.length})
        </button>
      </div>

      {/* Tab Selectors */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {activeTab === 'disciplines' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SEVEN_DISCIPLINES.map((disc) => {
              const isChecked = relationships.disciplineIds.includes(disc.id);
              return (
                <label
                  key={disc.id}
                  className={`flex items-start gap-2 p-2 rounded-xs border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[#F7F3EA] border-[#D4A757] text-stone-900 font-semibold'
                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleDiscipline(disc.id)}
                    className="mt-0.5 rounded-xs text-[#D4A757]"
                  />
                  <div>
                    <span className="block leading-snug">{disc.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono font-normal">
                      {disc.category}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {activeTab === 'hubs' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RODEO_HUBS.map((hub) => {
              const isChecked = relationships.hubIds.includes(hub.id);
              return (
                <label
                  key={hub.id}
                  className={`flex items-start gap-2 p-2 rounded-xs border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[#F7F3EA] border-[#D4A757] text-stone-900 font-semibold'
                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleHub(hub.id)}
                    className="mt-0.5 rounded-xs text-[#D4A757]"
                  />
                  <div>
                    <span className="block leading-snug">{hub.title}</span>
                    <span className="text-[10px] text-stone-400 font-mono font-normal">
                      {hub.region}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RECURRING_RODEO_EVENTS.map((ev) => {
              const isChecked = relationships.eventIds.includes(ev.id);
              return (
                <label
                  key={ev.id}
                  className={`flex items-start gap-2 p-2 rounded-xs border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[#F7F3EA] border-[#D4A757] text-stone-900 font-semibold'
                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleEvent(ev.id)}
                    className="mt-0.5 rounded-xs text-[#D4A757]"
                  />
                  <div>
                    <span className="block leading-snug">{ev.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono font-normal">
                      {ev.traditionalMonth} &bull; {ev.location}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {activeTab === 'editions' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EVENT_EDITIONS.map((ed) => {
              const isChecked = relationships.editionIds.includes(ed.id);
              return (
                <label
                  key={ed.id}
                  className={`flex items-start gap-2 p-2 rounded-xs border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[#F7F3EA] border-[#D4A757] text-stone-900 font-semibold'
                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleEdition(ed.id)}
                    className="mt-0.5 rounded-xs text-[#D4A757]"
                  />
                  <div>
                    <span className="block leading-snug">{ed.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono font-normal">
                      {ed.dates}
                    </span>
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
