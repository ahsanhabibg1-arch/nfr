import type { Metadata } from 'next';

// Minimal admin root layout: forces dynamic rendering and noindex for the whole
// /admin tree (including /admin/login). The authenticated shell + auth gate live
// in the (dashboard) route group so the login page renders without them.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NFRGuide CMS',
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
