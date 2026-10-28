import React from 'react';
import { PublicChrome } from '@/components/PublicChrome';
import { getPublishedSearchIndex, getAllDisciplines } from '@/lib/content';

export const revalidate = 300; // Refresh the client search index periodically.

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [searchArticles, searchDisciplines] = await Promise.all([
    getPublishedSearchIndex(),
    getAllDisciplines(),
  ]);

  return (
    <PublicChrome searchArticles={searchArticles} searchDisciplines={searchDisciplines}>
      {children}
    </PublicChrome>
  );
}
