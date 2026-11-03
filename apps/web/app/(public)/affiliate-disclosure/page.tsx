import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export const dynamic = 'force-static';
export const metadata = legalPageMetadata('affiliate-disclosure');

export default function Page() {
  return <LegalPageView slug="affiliate-disclosure" />;
}
