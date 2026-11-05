import type { Metadata } from 'next';
import { RegisterForm } from '@/components/account/forms';

export const metadata: Metadata = { title: 'Create account — NFRGuide', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-stone-200 rounded-sm p-8">
        <h1 className="font-serif text-2xl font-bold text-[#0F1115] mb-1">Create your reader account</h1>
        <p className="text-sm text-stone-600 mb-6">Join to comment on NFRGuide articles. Reader accounts have no editorial access.</p>
        <RegisterForm />
      </div>
    </div>
  );
}
