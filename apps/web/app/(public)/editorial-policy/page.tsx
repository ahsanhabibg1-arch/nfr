import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export const dynamic = 'force-static';
export const metadata = legalPageMetadata('editorial-policy');

export default function Page() {
  return <LegalPageView slug="editorial-policy" />;
}
