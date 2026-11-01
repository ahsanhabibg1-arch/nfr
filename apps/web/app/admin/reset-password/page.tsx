import type { Metadata } from 'next';
import { TokenSetupForm } from '@/components/admin/TokenSetupForm';

export const metadata: Metadata = { title: 'Reset Password · NFRGuide CMS', robots: { index: false, follow: false } };

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = str((await searchParams).token);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8] px-4">
      <div className="w-full max-w-sm bg-white border border-stone-200 rounded-sm p-6 space-y-4">
        <h1 className="font-serif text-xl font-black text-stone-900">Reset your password</h1>
        <p className="text-xs text-stone-500">Choose a new password for your NFRGuide CMS account. All existing sessions will be signed out.</p>
        <TokenSetupForm mode="reset" token={token} />
      </div>
    </div>
  );
}
