import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetForm } from '@/components/account/forms';

export const metadata: Metadata = { title: 'Set new password — NFRGuide', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-stone-200 rounded-sm p-8">
        <h1 className="font-serif text-2xl font-bold text-[#0F1115] mb-1">Set a new password</h1>
        {token ? (
          <>
            <p className="text-sm text-stone-600 mb-6">Choose a new password for your account.</p>
            <ResetForm token={token} />
          </>
        ) : (
          <p className="text-sm text-stone-600">This page needs a valid reset link. <Link href="/forgot-password/" className="text-[#8B5E3C] underline">Request a new one</Link>.</p>
        )}
      </div>
    </div>
  );
}
