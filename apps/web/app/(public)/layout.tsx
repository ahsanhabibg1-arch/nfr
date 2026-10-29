import React from 'react';
import { PublicChrome } from '@/components/PublicChrome';
import { getPublishedSearchIndex, getAllDisciplines } from '@/lib/content';
import { getPublicNavigation } from '@/lib/cms/navigationService';

export const revalidate = 300; // Refresh the client search index periodically.

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [searchArticles, searchDisciplines, nav] = await Promise.all([
    getPublishedSearchIndex(),
    getAllDisciplines(),
    getPublicNavigation(),
  ]);

  return (
    <PublicChrome searchArticles={searchArticles} searchDisciplines={searchDisciplines} nav={nav}>
      {children}
    </PublicChrome>
  );
}
