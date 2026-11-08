import type { Metadata } from 'next';
import { getLegalPage, LEGAL_PAGES } from '@/config/legalPages';
import { getPublishedInfoPage, listInfoPages } from '@/lib/cms/infoPageService';
import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const legacySlugs = LEGAL_PAGES.map((p) => ({ slug: p.slug }));
  const dbPages = await listInfoPages();
  const dbSlugs = dbPages
    .filter((p) => p.status === 'PUBLISHED')
    .map((p) => ({ slug: p.slug }));
  const seen = new Set(legacySlugs.map((p) => p.slug));
  for (const s of dbSlugs) {
    if (!seen.has(s.slug)) legacySlugs.push(s);
  }
  return legacySlugs;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return legalPageMetadata(slug);
}

export default async function InfoPage({ params }: Props) {
  const { slug } = await params;
  return <LegalPageView slug={slug} />;
}
