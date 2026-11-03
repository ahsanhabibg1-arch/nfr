import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export const dynamic = 'force-static';
export const metadata = legalPageMetadata('about');

export default function Page() {
  return <LegalPageView slug="about" />;
}
