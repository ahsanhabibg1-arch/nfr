import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export async function generateMetadata() { return legalPageMetadata('affiliate-disclosure'); }

export default function Page() {
  return <LegalPageView slug="affiliate-disclosure" />;
}
