import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { HomeView } from '@/views/HomeView';
import { buildMetadata } from '@/lib/seo';
import { getHeroArticle } from '@/lib/content';
import { getPublishedSections, getDraftSections } from '@/lib/cms/pageLayoutService';
import { resolveHomepageSlots } from '@/lib/cms/homepageData';
import { getActiveBlocksForPlacement } from '@/lib/cms/globalBlockService';
import { getPublished } from '@/lib/cms/siteConfigService';
import type { AppearanceConfig } from '@/lib/cms/siteConfigService';
import { getCurrentUser, userHasPermission } from '@/lib/auth/currentUser';

export const revalidate = 60; // ISR: re-render homepage feeds at most once a minute.

export async function generateMetadata(): Promise<Metadata> {
  const hero = await getHeroArticle();
  return buildMetadata({
    title: 'NFRGuide — Independent Rodeo Editorial & Championship Coverage',
    description:
      'Independent rodeo editorial publication covering the National Finals Rodeo, championship competition, entertainment, and spectator guides.',
    path: '/',
    image: hero?.heroImage,
  });
}

/** Draft preview is only honoured for signed-in staff who can edit the site layout. */
async function isStaffDraftPreview(): Promise<boolean> {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return false;
  return userHasPermission(await getCurrentUser(), 'system.config');
}

export default async function HomePage() {
  const preview = await isStaffDraftPreview();
  const layoutSlots = preview ? await getDraftSections('homepage') : await getPublishedSections('homepage');

  // Announcements are rendered site-wide by the public layout (PublicChrome).
  const [slots, topBlocks, bottomBlocks, appearance, anyArticle] = await Promise.all([
    resolveHomepageSlots(layoutSlots),
    getActiveBlocksForPlacement('homepage-top'),
    getActiveBlocksForPlacement('homepage-bottom'),
    getPublished<AppearanceConfig>('appearance'),
    getHeroArticle(),
  ]);

  if (!anyArticle) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-serif font-bold text-stone-900">No published coverage yet</h1>
        <p className="mt-2 text-sm text-stone-600 font-sans">
          The editorial database has no published articles. Run the seed to load demonstration content.
        </p>
      </div>
    );
  }

  return (
    <HomeView
      slots={slots}
      topBlocks={topBlocks}
      bottomBlocks={bottomBlocks}
      appearance={appearance}
      isDraftPreview={preview}
    />
  );
}
