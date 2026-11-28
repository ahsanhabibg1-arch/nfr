import { redirect } from 'next/navigation';
import { SiteLogo } from '@/components/SiteLogo';
import { resolveBranding } from '@/lib/cms/branding';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/admin/');

  /**
   * R-06 §12.4 — branding must NEVER be a dependency of being able to sign in.
   * `resolveBranding` already swallows its own failures and returns the
   * wordmark fallback, and this second guard means even an unexpected throw
   * leaves a usable login page rather than an error boundary.
   */
  let branding = null;
  try { branding = await resolveBranding('dark'); } catch { branding = null; }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1115] px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-serif text-3xl font-black text-white tracking-tight uppercase inline-flex items-center">
            <SiteLogo branding={branding} wordmarkLead="NFR" wordmarkAccent="CMS" maxHeight={44} />
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
