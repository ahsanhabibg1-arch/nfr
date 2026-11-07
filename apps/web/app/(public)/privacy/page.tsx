import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export async function generateMetadata() { return legalPageMetadata('privacy'); }

export default function Page() {
  return <LegalPageView slug="privacy" />;
}
