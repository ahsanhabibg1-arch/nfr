import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export const dynamic = 'force-static';
export const metadata = legalPageMetadata('terms');

export default function Page() {
  return <LegalPageView slug="terms" />;
}
