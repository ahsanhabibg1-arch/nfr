'use client';

import React from 'react';
import { AnnouncementBanner, type PublicAnnouncement } from '../components/public/AnnouncementBanner';
import { GlobalBlockRenderer, type PublicGlobalBlock } from '../components/public/GlobalBlockRenderer';
import { IntroBanner } from '../components/public/IntroBanner';
import { PageRenderer, type RenderedSlot } from '../components/blocks/PageRenderer';
import type { AppearanceConfig } from '../lib/cms/siteConfigService';
import type { MoreRodeoHubCard, MoreRodeoEventCard } from '../components/sections/MoreRodeoSection';
import type { ResolvedHomeSlot } from '../lib/cms/homepageData';

export interface HomeViewProps {
  slots: ResolvedHomeSlot[];
  announcements?: PublicAnnouncement[];
  topBlocks?: PublicGlobalBlock[];
  bottomBlocks?: PublicGlobalBlock[];
  appearance?: AppearanceConfig;
  isDraftPreview?: boolean;
}

export type { MoreRodeoHubCard, MoreRodeoEventCard };

export const HomeView: React.FC<HomeViewProps> = ({
  slots,
  announcements = [],
  topBlocks = [],
  bottomBlocks = [],
  appearance,
  isDraftPreview = false,
}) => {
  return (
    <div className="w-full flex flex-col">
      {isDraftPreview && (
        <div className="w-full bg-[#D4A757] text-[#0F1115] text-xs font-semibold text-center py-1.5" role="status">
          DRAFT PREVIEW — you are seeing unpublished Page Builder changes. Visitors still see the published homepage.
        </div>
      )}
      {announcements.length > 0 && <AnnouncementBanner announcements={announcements} />}
      {topBlocks.length > 0 && <GlobalBlockRenderer blocks={topBlocks} />}
      {appearance?.introBannerStyle && appearance.introBannerHeadline && <IntroBanner config={appearance} />}
      <PageRenderer slots={slots as RenderedSlot[]} />
      {bottomBlocks.length > 0 && <GlobalBlockRenderer blocks={bottomBlocks} />}
    </div>
  );
};

export default HomeView;
