import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/admin/');

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1115] px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-serif text-3xl font-black text-white tracking-tight uppercase">
            NFR<span className="text-[#D4A757]">CMS</span>
          </span>
          <p className="mt-2 text-xs font-mono uppercase tracking-widest text-ink-inverse-muted">
            Editorial Management Console
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
