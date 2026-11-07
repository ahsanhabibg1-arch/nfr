import { LegalPageView, legalPageMetadata } from '@/views/LegalPageView';

export async function generateMetadata() { return legalPageMetadata('contact'); }

export default function Page() {
  return <LegalPageView slug="contact" />;
}
