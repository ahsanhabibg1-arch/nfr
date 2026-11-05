import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { isStaff } from '@/lib/auth/rbac';

/**
 * Lightweight session probe for the public header's account menu (Batch 24). Kept as a
 * dynamic, no-store API route so the public pages themselves stay static/ISR — the menu
 * hydrates from here on the client instead of forcing cookies() into the layout.
 * Returns only non-sensitive display fields (never the email or roles list).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { headers: { 'Cache-Control': 'no-store' } });
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
  return NextResponse.json(
    { user: { name: user.name, initials, isStaff: isStaff(user.roles) } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
