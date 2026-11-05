import type { Metadata } from 'next';
import { ForgotForm } from '@/components/account/forms';

export const metadata: Metadata = { title: 'Reset password — NFRGuide', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-stone-200 rounded-sm p-8">
        <h1 className="font-serif text-2xl font-bold text-[#0F1115] mb-1">Forgot your password?</h1>
        <p className="text-sm text-stone-600 mb-6">Enter your email and we&rsquo;ll send a reset link once email delivery is configured.</p>
        <ForgotForm />
      </div>
    </div>
  );
}
