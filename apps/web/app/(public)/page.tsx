import type { Metadata } from 'next';
import { HomeView } from '@/views/HomeView';
import { buildMetadata } from '@/lib/seo';
import { HERO_ARTICLE } from '@/data/mockEditorialData';

export const metadata: Metadata = buildMetadata({
  title: 'NFRGuide — Independent Rodeo Editorial & Championship Coverage',
  description:
    'Independent rodeo editorial publication covering the National Finals Rodeo, championship competition, entertainment, and spectator guides.',
  path: '/',
  image: HERO_ARTICLE.heroImage,
});

export default function HomePage() {
  return <HomeView />;
}
