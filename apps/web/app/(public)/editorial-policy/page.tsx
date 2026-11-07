import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export async function generateMetadata() { return legalPageMetadata('editorial-policy'); }

export default function Page() {
  return <LegalPageView slug="editorial-policy" />;
}
