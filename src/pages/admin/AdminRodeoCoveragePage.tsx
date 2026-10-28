import React, { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import { 
  RODEO_HUBS, 
  RECURRING_RODEO_EVENTS, 
  SEVEN_DISCIPLINES 
} from '../../data/mockEditorialData';
import { useSEO } from '../../utils/seo';

type CoverageTab = 'hubs' | 'events' | 'editions' | 'disciplines' | 'venues';

interface VenueItem {
  id: string;
  name: string;
  city: string;
  state: string;
  capacity: string;
  type: string;
  primaryEvent: string;
}

const VENUES: VenueItem[] = [
  {
    id: 'ven-01',
    name: 'Thomas & Mack Center',
    city: 'Las Vegas',
    state: 'NV',
    capacity: '17,000 (Rodeo Configuration)',
    type: 'Indoor Arena',
    primaryEvent: 'National Finals Rodeo (Rounds 1–10)',
  },
  {
    id: 'ven-02',
    name: 'Las Vegas Convention Center',
    city: 'Las Vegas',
    state: 'NV',
    capacity: '500,000 sq ft Expo Floor',
    type: 'Exhibition Hall',
    primaryEvent: 'Cowboy Christmas & Junior World Finals',
  },
  {
    id: 'ven-03',
    name: 'South Point Arena & Equestrian Center',
    city: 'Las Vegas',
    state: 'NV',
    capacity: '4,600 Arena / 1,200 Showroom',
    type: 'Equestrian Complex',
    primaryEvent: 'Miss Rodeo America & Nightly Buckle Presentations',
  },
  {
    id: 'ven-04',
    name: 'Stampede Park Grandstand',
    city: 'Calgary',
    state: 'AB, Canada',
    capacity: '25,000 Outdoor Grandstand',
    type: 'Outdoor Dirt Track',
    primaryEvent: 'The Calgary Stampede',
  },
];

export const AdminRodeoCoveragePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CoverageTab>('hubs');
  const [modalItem, setModalItem] = useState<{ title: string; subtitle: string; content: React.ReactNode } | null>(null);

  useSEO({
    title: 'Rodeo Coverage & Event Taxonomy — CMS',
    description: 'Manage Rodeo Hubs, Recurring Events, Annual Editions, Disciplines, and Venues.',
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Rodeo Coverage &amp; Event Taxonomy"
        description="Preserve the structural relationship between Regional Hubs, Recurring Events, Annual Editions, Disciplines, and Venues without duplicating entities."
        actions={
          <button
            onClick={() => setModalItem({
              title: 'Create New Taxonomy Entity',
              subtitle: 'Select entity type to stage in the demonstration taxonomy database.',
              content: (
                <div className="space-y-3 font-sans text-xs">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Entity Classification</label>
                    <select className="w-full p-2 border border-stone-300 rounded-xs bg-stone-50">
                      <option>Rodeo Hub (Thematic / Geographic)</option>
                      <option>Recurring Rodeo Event (Stable Identity)</option>
                      <option>Event Edition (Annual Specific Window)</option>
                      <option>Venue Location</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Official Name</label>
                    <input type="text" placeholder="e.g. Pendleton Round-Up 2027" className="w-full p-2 border border-stone-300 rounded-xs" />
                  </div>
                </div>
              ),
            })}
            className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors"
          >
            + Add Event / Hub
          </button>
        }
      />

      {/* Tabs */}
      <AdminTabs
        tabs={[
          { id: 'hubs', label: 'Rodeo Hubs', count: RODEO_HUBS.length },
          { id: 'events', label: 'Recurring Events', count: RECURRING_RODEO_EVENTS.length },
          { id: 'editions', label: 'Event Editions', count: RECURRING_RODEO_EVENTS.length },
          { id: 'disciplines', label: 'The 7 Disciplines', count: SEVEN_DISCIPLINES.length },
          { id: 'venues', label: 'Venues', count: VENUES.length },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as CoverageTab)}
      />

      {/* Tab 1: Rodeo Hubs */}
      {activeTab === 'hubs' && (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-stone-200 flex items-center justify-between text-xs text-stone-500 font-sans">
            <span><strong>Rodeo Hubs:</strong> Broad regional and circuit directories that aggregate multiple recurring events.</span>
            <span className="font-mono text-[11px]">3 Circuits Defined</span>
          </div>
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Hub Title &amp; Slug</th>
                <th className="py-3 px-4">Geographic Region</th>
                <th className="py-3 px-4">Circuit / Sanctioning</th>
                <th className="py-3 px-4">Annual Sanctioned Rodeos</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {RODEO_HUBS.map((hub) => (
                <tr key={hub.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-stone-900">
                    <span className="font-serif text-sm block">{hub.title}</span>
                    <span className="text-[10px] font-mono text-stone-400">/rodeo-events/#{hub.slug}</span>
                  </td>
                  <td className="py-3 px-4 text-stone-600">{hub.region}</td>
                  <td className="py-3 px-4 text-stone-700 font-medium">{hub.circuitType}</td>
                  <td className="py-3 px-4 text-stone-600 tabular-nums">{hub.annualEventsCount} events</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => setModalItem({
                        title: `Hub Details: ${hub.title}`,
                        subtitle: `${hub.region} &middot; ${hub.circuitType}`,
                        content: (
                          <div className="space-y-3 font-sans text-xs">
                            <p className="text-stone-700 leading-relaxed">{hub.description}</p>
                            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xs">
                              <span className="font-bold text-stone-900 block mb-1">Associated Multi-Hub Events:</span>
                              <p className="text-stone-600">Events linked to this circuit can also appear in national crown jewel lists without duplication.</p>
                            </div>
                          </div>
                        ),
                      })}
                      className="text-[#8B5E3C] hover:underline font-semibold"
                    >
                      Inspect Hub &rarr;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Recurring Events */}
      {activeTab === 'events' && (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-stone-200 text-xs text-stone-500 font-sans">
            <span><strong>Recurring Events:</strong> Stable entities representing prestigious annual competitions with multi-decade histories.</span>
          </div>
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Recurring Rodeo Name</th>
                <th className="py-3 px-4">Permanent Location</th>
                <th className="py-3 px-4">Calendar Month</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {RECURRING_RODEO_EVENTS.map((evt) => (
                <tr key={evt.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-3 px-4 font-serif text-sm font-bold text-stone-900">
                    {evt.name}
                  </td>
                  <td className="py-3 px-4 text-stone-600">{evt.location}</td>
                  <td className="py-3 px-4 text-stone-600">{evt.traditionalMonth}</td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-xs bg-[#F7F3EA] border border-stone-300 text-stone-800">
                      {evt.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setModalItem({
                        title: `Recurring Event: ${evt.name}`,
                        subtitle: `${evt.location} &middot; Status: ${evt.status}`,
                        content: (
                          <div className="space-y-3 font-sans text-xs">
                            <p className="text-stone-700 leading-relaxed">{evt.description}</p>
                            <div className="p-3 bg-[#F7F3EA] border border-stone-200 rounded-xs">
                              <span className="font-bold text-stone-900 block mb-1">Active Edition (2026):</span>
                              <p className="text-stone-700 font-medium">{evt.currentEdition.dates}</p>
                              <p className="text-stone-500 font-mono mt-0.5">{evt.currentEdition.purseBenchmark}</p>
                            </div>
                          </div>
                        ),
                      })}
                      className="text-[#8B5E3C] hover:underline font-semibold"
                    >
                      View Details &rarr;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Event Editions */}
      {activeTab === 'editions' && (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-stone-200 text-xs text-stone-500 font-sans">
            <span><strong>Event Editions:</strong> Specific annual instances with precise performance dates, purse benchmarks, and contestant rosters.</span>
          </div>
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Edition Identifier</th>
                <th className="py-3 px-4">Parent Event</th>
                <th className="py-3 px-4">Performance Dates</th>
                <th className="py-3 px-4">Purse Benchmark</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {RECURRING_RODEO_EVENTS.map((evt) => (
                <tr key={evt.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs font-bold text-stone-900">
                    {evt.slug}-{evt.currentEdition.year}
                  </td>
                  <td className="py-3 px-4 font-semibold text-stone-800">{evt.name}</td>
                  <td className="py-3 px-4 text-stone-700">{evt.currentEdition.dates}</td>
                  <td className="py-3 px-4 text-stone-600 font-mono text-[11px]">{evt.currentEdition.purseBenchmark}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-xs">
                      Confirmed 2026
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Disciplines */}
      {activeTab === 'disciplines' && (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Discipline Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Livestock Profile</th>
                <th className="py-3 px-4">Historic Benchmark</th>
                <th className="py-3 px-4 text-right">Guide Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {SEVEN_DISCIPLINES.map((d) => (
                <tr key={d.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-3 px-4 font-serif text-sm font-bold text-stone-900">{d.name}</td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-[10px] uppercase font-bold text-[#8B5E3C] bg-stone-100 px-1.5 py-0.5 rounded">
                      {d.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-stone-600 max-w-xs truncate">{d.stockProfile}</td>
                  <td className="py-3 px-4 text-stone-600 max-w-xs truncate">{d.historicBenchmark}</td>
                  <td className="py-3 px-4 text-right">
                    <a
                      href={`/disciplines/${d.slug}/`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#8B5E3C] hover:underline font-semibold"
                    >
                      View Public Guide &rarr;
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 5: Venues */}
      {activeTab === 'venues' && (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Venue Name</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Capacity / Scale</th>
                <th className="py-3 px-4">Primary Championship Event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {VENUES.map((v) => (
                <tr key={v.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-stone-900 font-serif text-sm">{v.name}</td>
                  <td className="py-3 px-4 text-stone-600">{v.city}, {v.state}</td>
                  <td className="py-3 px-4 text-stone-600 font-mono text-[11px]">{v.capacity}</td>
                  <td className="py-3 px-4 text-stone-700">{v.primaryEvent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Details / Create Modal */}
      {modalItem && (
        <AdminModal
          isOpen={true}
          onClose={() => setModalItem(null)}
          title={modalItem.title}
          subtitle={modalItem.subtitle}
          footerActions={
            <button
              onClick={() => setModalItem(null)}
              className="px-4 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs uppercase tracking-wider"
            >
              Close
            </button>
          }
        >
          {modalItem.content}
        </AdminModal>
      )}
    </div>
  );
};
