import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export async function generateMetadata() { return legalPageMetadata('about'); }

export default function Page() {
  return <LegalPageView slug="about" />;
}
