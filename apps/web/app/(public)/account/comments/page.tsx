import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { listMyComments } from '@/lib/cms/commentService';

export const metadata: Metadata = { title: 'My comments — NFRGuide', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const CSTYLE: Record<string, string> = { APPROVED: 'text-emerald-700', PENDING: 'text-amber-700', REJECTED: 'text-rose-700', HIDDEN: 'text-stone-500' };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login/');
  const comments = await listMyComments(user.id);
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold text-[#0F1115]">My comments</h1>
        <Link href="/account/" className="text-xs text-[#8B5E3C] underline">&larr; Back to account</Link>
      </header>
      <div className="bg-white border border-stone-200 rounded-sm divide-y divide-stone-100">
        {comments.length === 0 ? <p className="p-8 text-center text-sm text-stone-500">You haven&rsquo;t commented yet.</p> : comments.map((c) => (
          <div key={c.id} className="p-4">
            <p className="text-sm text-stone-800 whitespace-pre-wrap break-words">{c.body}</p>
            <p className="text-[11px] text-stone-500 mt-1">
              <span className={`font-mono ${CSTYLE[c.status] ?? ''}`}>{c.status}</span>
              {c.status === 'PENDING' && ' · awaiting moderation'}
              {' · on '}<Link href={`/articles/${c.articleSlug}/`} className="underline">{c.articleTitle}</Link> · {new Date(c.createdAt).toISOString().slice(0, 10)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
