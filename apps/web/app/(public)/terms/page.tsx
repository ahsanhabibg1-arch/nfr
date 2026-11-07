import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export async function generateMetadata() { return legalPageMetadata('terms'); }

export default function Page() {
  return <LegalPageView slug="terms" />;
}
