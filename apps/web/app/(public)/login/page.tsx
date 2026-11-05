import type { Metadata } from 'next';
import { LoginForm } from '@/components/account/forms';

export const metadata: Metadata = { title: 'Sign in — NFRGuide', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const reset = (await searchParams).reset;
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-stone-200 rounded-sm p-8">
        <h1 className="font-serif text-2xl font-bold text-[#0F1115] mb-1">Sign in</h1>
        <p className="text-sm text-stone-600 mb-6">Access your NFRGuide reader account.</p>
        {reset && <p role="status" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xs px-3 py-2 mb-4">Your password was reset. Please sign in.</p>}
        <LoginForm />
      </div>
    </div>
  );
}
