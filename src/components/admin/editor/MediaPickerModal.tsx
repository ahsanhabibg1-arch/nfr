import React, { useState } from 'react';
import { MEDIA_ASSETS } from '../../../data/mockAdminData';
import { AdminModal } from '../AdminModal';

export interface SelectedMediaData {
  url: string;
  seoTitle: string;
  altText: string;
  caption: string;
  credit: string;
  rightsStatus: 'Staff Photo' | 'Editorial Pool' | 'PRCA Archive' | 'Licensed Creative' | 'Unresolved';
}

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: SelectedMediaData) => void;
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const [selectedAssetId, setSelectedAssetId] = useState<string>(MEDIA_ASSETS[0].id);
  const [customUrl, setCustomUrl] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  if (!isOpen) return null;

  const currentAsset = MEDIA_ASSETS.find((m) => m.id === selectedAssetId) || MEDIA_ASSETS[0];

  const handleApply = () => {
    if (useCustom && customUrl.trim()) {
      onSelect({
        url: customUrl.trim(),
        seoTitle: 'Editorial Rodeo Photography',
        altText: 'Editorial action photograph illustrating championship rodeo competition',
        caption: 'Action capture during live arena competition.',
        credit: 'Editorial Media Pool / NFRGuide',
        rightsStatus: 'Licensed Creative',
      });
    } else {
      onSelect({
        url: currentAsset.url,
        seoTitle: currentAsset.seoTitle,
        altText: currentAsset.altText,
        caption: currentAsset.altText,
        credit: currentAsset.credit,
        rightsStatus: currentAsset.rightsStatus,
      });
    }
    onClose();
  };

  return (
    <AdminModal
      isOpen={isOpen}
      title="Select Featured Editorial Media & Verify Rights"
      onClose={onClose}
      className="max-w-4xl"
    >
      <div className="space-y-4 font-sans text-xs">
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xs text-stone-600">
          Select an asset from the verified newsroom media library. Only assets with confirmed usage rights (Staff Photo, Editorial Pool, PRCA Archive, Licensed Creative) satisfy publication safety gates.
        </div>

        {/* Custom URL Toggle */}
        <div className="flex items-center gap-3 pb-2 border-b border-stone-200">
          <label className="flex items-center gap-2 cursor-pointer text-stone-800 font-medium">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => setUseCustom(e.target.checked)}
              className="rounded-xs text-[#D4A757]"
            />
            <span>Provide Custom Image URL</span>
          </label>
        </div>

        {useCustom ? (
          <div className="space-y-2 p-4 bg-stone-50 border border-stone-200 rounded-xs">
            <label className="block text-xs font-mono uppercase text-stone-500 font-medium">
              Image Web URL
            </label>
            <input
              type="text"
              placeholder="https://... / image URL"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
            />
            {customUrl && (
              <img
                src={customUrl}
                alt="Custom preview"
                className="w-full max-h-48 object-cover rounded-xs border border-stone-300 mt-2"
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Asset Grid */}
            <div className="md:col-span-7 grid grid-cols-2 gap-3 max-h-80 overflow-y-auto p-1">
              {MEDIA_ASSETS.map((asset) => {
                const isSelected = asset.id === selectedAssetId;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={`cursor-pointer border-2 rounded-xs overflow-hidden transition-all relative ${
                      isSelected ? 'border-[#D4A757] shadow-md ring-2 ring-[#D4A757]/30' : 'border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <div className="aspect-16/10 bg-stone-900 overflow-hidden relative">
                      <img
                        src={asset.url}
                        alt={asset.altText}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 right-1 text-[9px] font-mono px-1 py-0.2 bg-black/70 text-white rounded-xs">
                        {asset.dimensions}
                      </span>
                    </div>
                    <div className="p-2 bg-white">
                      <span className="font-semibold text-stone-900 block truncate text-[11px]">
                        {asset.seoTitle}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono block">
                        {asset.rightsStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inspector for selected asset */}
            <div className="md:col-span-5 p-3 bg-stone-50 border border-stone-200 rounded-xs space-y-3">
              <span className="text-xs font-mono uppercase text-stone-500 font-semibold block border-b border-stone-200 pb-1">
                Asset Metadata Inspector
              </span>

              <img
                src={currentAsset.url}
                alt={currentAsset.altText}
                className="w-full aspect-16/10 object-cover rounded-xs border border-stone-300"
              />

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase text-stone-400 block">SEO Title:</span>
                  <span className="font-semibold text-stone-800">{currentAsset.seoTitle}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-stone-400 block">ALT Context:</span>
                  <span className="text-stone-600 line-clamp-2">{currentAsset.altText}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-stone-400 block">Photographer Credit:</span>
                  <span className="text-stone-800 font-mono text-[11px]">{currentAsset.credit}</span>
                </div>
                <div className="pt-1">
                  <span className="text-[10px] font-mono uppercase text-stone-400 block">Usage Rights:</span>
                  <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold rounded-xs">
                    {currentAsset.rightsStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors"
          >
            Select &amp; Apply Featured Image
          </button>
        </div>
      </div>
    </AdminModal>
  );
};
