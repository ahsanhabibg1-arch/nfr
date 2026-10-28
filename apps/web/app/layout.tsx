import type { Metadata } from 'next';
import './globals.css';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'NFRGuide — Independent Rodeo Editorial & Championship Coverage',
  description:
    'Independent rodeo editorial publication covering the National Finals Rodeo, championship competition, entertainment, and spectator guides.',
  openGraph: {
    type: 'website',
    siteName: 'NFRGuide',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,600;1,700&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0F1115] text-[#1E293B] antialiased selection:bg-[#D4A757]/30 selection:text-[#0F1115]">
        {children}
      </body>
    </html>
  );
}
