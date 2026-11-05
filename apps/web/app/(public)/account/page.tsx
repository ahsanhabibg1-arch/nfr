import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { prisma } from '@/lib/db';
import { listMyComments } from '@/lib/cms/commentService';
import { ProfileNameForm, ChangePasswordForm } from '@/components/account/forms';

export const metadata: Metadata = { title: 'My account — NFRGuide', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const CSTYLE: Record<string, string> = { APPROVED: 'text-emerald-700', PENDING: 'text-amber-700', REJECTED: 'text-rose-700', HIDDEN: 'text-stone-500' };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect('/login/');
  const [row, comments] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, createdAt: true, emailVerifiedAt: true } }),
    listMyComments(user.id),
  ]);
  const recent = comments.slice(0, 5);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <header>
        <h1 className="font-serif text-3xl font-bold text-[#0F1115]">My account</h1>
        <p className="text-sm text-stone-600 mt-1">Signed in as <span className="font-semibold">{user.name}</span></p>
      </header>

      {/* Account summary */}
      <section className="bg-white border border-stone-200 rounded-sm p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div><div className="text-[11px] font-mono uppercase text-stone-500">Email</div><div className="text-stone-900">{row.email}</div></div>
        <div><div className="text-[11px] font-mono uppercase text-stone-500">Email verification</div><div className="text-stone-900">{row.emailVerifiedAt ? 'Verified' : 'Not verified — email delivery not yet configured'}</div></div>
        <div><div className="text-[11px] font-mono uppercase text-stone-500">Member since</div><div className="text-stone-900">{new Date(row.createdAt).toISOString().slice(0, 10)}</div></div>
        <div><div className="text-[11px] font-mono uppercase text-stone-500">Comments</div><div className="text-stone-900">{comments.length} total · <Link href="/account/comments/" className="text-[#8B5E3C] underline">view all</Link></div></div>
      </section>

      {/* Recent comments */}
      <section className="bg-white border border-stone-200 rounded-sm p-6">
        <h2 className="font-serif text-lg font-bold text-[#0F1115] mb-3">Recent comments</h2>
        {recent.length === 0 ? <p className="text-sm text-stone-500">You haven&rsquo;t commented yet.</p> : (
          <ul className="divide-y divide-stone-100">
            {recent.map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <p className="text-stone-800 line-clamp-2">{c.body}</p>
                <p className="text-[11px] text-stone-500 mt-1">
                  <span className={`font-mono ${CSTYLE[c.status] ?? ''}`}>{c.status}</span> · on <Link href={`/articles/${c.articleSlug}/`} className="underline">{c.articleTitle}</Link> · {new Date(c.createdAt).toISOString().slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Profile + security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white border border-stone-200 rounded-sm p-6">
          <h2 className="font-serif text-lg font-bold text-[#0F1115] mb-4">Profile</h2>
          <ProfileNameForm currentName={user.name} />
        </section>
        <section className="bg-white border border-stone-200 rounded-sm p-6">
          <h2 className="font-serif text-lg font-bold text-[#0F1115] mb-4">Change password</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </div>
  );
}
