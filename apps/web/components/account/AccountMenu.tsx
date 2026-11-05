'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '../../app/(public)/account/actions';

interface MeUser { name: string; initials: string; isStaff: boolean }

/**
 * Public account menu. The signed-in state is read from `/api/account/me/` (which keeps
 * public pages static). Because this menu lives in the persistent public layout, a soft
 * navigation does NOT remount it — so it MUST revalidate on navigation, or it would show
 * stale state after login/registration/logout (all of which redirect to `/`) and on
 * browser Back/Forward. We therefore refetch whenever the pathname changes and whenever
 * the tab is restored from bfcache or regains focus, and clear optimistically on logout
 * (covering a logout that stays on the same path, e.g. logging out from the home page).
 */
export const AccountMenu: React.FC<{ variant?: 'desktop' | 'mobile' }> = ({ variant = 'desktop' }) => {
  const [user, setUser] = useState<MeUser | null | undefined>(undefined); // undefined = loading
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    fetch('/api/account/me/', { cache: 'no-store' }) // trailing slash: app is trailingSlash:true (avoids a 308)
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, []);

  // Revalidate on every navigation (login/register/logout all redirect to '/'; also Back/Forward).
  useEffect(() => { refresh(); }, [pathname, refresh]);

  // Revalidate when the tab is restored from bfcache (pageshow) or regains focus.
  useEffect(() => {
    const onShow = () => refresh();
    window.addEventListener('pageshow', onShow);
    window.addEventListener('focus', onShow);
    return () => { window.removeEventListener('pageshow', onShow); window.removeEventListener('focus', onShow); };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Server action clears the cookie + redirects to '/'; clear locally too so the menu flips
  // instantly even when logout keeps us on the same path (no navigation to trigger refetch).
  const LogoutForm = ({ className }: { className?: string }) => (
    <form action={logoutAction} onSubmit={() => setUser(null)}>
      <button type="submit" className={className}>Sign out</button>
    </form>
  );

  if (user === undefined) return <span className="w-8 h-8" aria-hidden="true" />; // reserve space while loading

  // ---- Mobile (inline list inside the drawer) ----
  if (variant === 'mobile') {
    return (
      <div className="mt-6 pt-6 border-t border-white/10 space-y-1" data-testid="account-menu-mobile">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">Account</div>
        {!user ? (
          <>
            <Link href="/login/" className="block w-full py-2.5 px-3 text-sm text-stone-200 hover:bg-white/5 rounded">Sign in</Link>
            <Link href="/register/" className="block w-full py-2.5 px-3 text-sm text-[#D4A757] hover:bg-white/5 rounded">Create account</Link>
          </>
        ) : (
          <>
            <Link href="/account/" className="block w-full py-2.5 px-3 text-sm text-stone-200 hover:bg-white/5 rounded">My Profile</Link>
            <Link href="/account/comments/" className="block w-full py-2.5 px-3 text-sm text-stone-200 hover:bg-white/5 rounded">My Comments</Link>
            {user.isStaff && <Link href="/admin/" className="block w-full py-2.5 px-3 text-sm text-[#D4A757] hover:bg-white/5 rounded">Admin Dashboard</Link>}
            <LogoutForm className="block w-full text-left py-2.5 px-3 text-sm text-rose-300 hover:bg-white/5 rounded" />
          </>
        )}
      </div>
    );
  }

  // ---- Desktop (compact dropdown) ----
  if (!user) {
    return (
      <div className="hidden xl:flex items-center gap-2" data-testid="account-signedout">
        <Link href="/login/" className="px-3 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-stone-300 hover:text-white rounded-sm transition-colors">Sign in</Link>
        <Link href="/register/" className="px-3 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-black bg-[#D4A757] hover:bg-[#C59642] rounded-sm transition-colors">Create account</Link>
      </div>
    );
  }
  return (
    <div className="relative hidden xl:block" ref={ref} data-testid="account-signedin">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="account-avatar"
        className="flex items-center gap-2 p-1 rounded-sm hover:bg-white/5 transition-colors"
      >
        <span className="w-8 h-8 rounded-full bg-[#1E293B] text-[#D4A757] font-serif font-bold text-xs flex items-center justify-center">{user.initials}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-52 bg-white border border-stone-200 rounded-xs shadow-lg py-2 z-50 text-xs">
          <div className="px-4 py-2 border-b border-stone-100">
            <p className="font-semibold text-stone-900 truncate">{user.name}</p>
            <p className="text-[10px] text-stone-500 font-mono">{user.isStaff ? 'Staff account' : 'Reader account'}</p>
          </div>
          <Link href="/account/" role="menuitem" className="block px-4 py-2 text-stone-700 hover:bg-stone-50">My Profile</Link>
          <Link href="/account/comments/" role="menuitem" className="block px-4 py-2 text-stone-700 hover:bg-stone-50">My Comments</Link>
          {user.isStaff && <Link href="/admin/" role="menuitem" className="block px-4 py-2 text-[#8B5E3C] font-medium hover:bg-stone-50">Admin Dashboard &rarr;</Link>}
          <div className="border-t border-stone-100 mt-1 pt-1">
            <LogoutForm className="w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 font-medium" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountMenu;
