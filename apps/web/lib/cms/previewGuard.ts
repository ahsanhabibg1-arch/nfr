import 'server-only';
import { draftMode } from 'next/headers';
import { getCurrentUser, userHasPermission } from '@/lib/auth/currentUser';

export async function isStaffDraftPreview(): Promise<boolean> {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return false;
  return userHasPermission(await getCurrentUser(), 'system.config');
}
