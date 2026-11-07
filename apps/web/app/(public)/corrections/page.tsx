import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export async function generateMetadata() { return legalPageMetadata('corrections'); }

export default function Page() {
  return <LegalPageView slug="corrections" />;
}
