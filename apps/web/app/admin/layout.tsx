import type { Metadata } from 'next';
import { AdminLayout } from '@/components/admin/AdminLayout';

// The admin CMS is a prototype with NO real authentication/authorization
// (Batch 01 §9). It must never be indexed and must stay out of static export.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NFRGuide CMS (Prototype)',
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
