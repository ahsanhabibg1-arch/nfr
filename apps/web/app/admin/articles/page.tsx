import { Suspense } from 'react';
import { AdminArticlesPage } from '@/views/admin/AdminArticlesPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminArticlesPage />
    </Suspense>
  );
}
