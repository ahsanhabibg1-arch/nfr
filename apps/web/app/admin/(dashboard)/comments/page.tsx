import { redirect } from 'next/navigation';
import type { CommentStatus } from '@prisma/client';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listForModeration, moderationCounts } from '@/lib/cms/commentService';
import { AdminCommentsPage } from '@/views/admin/AdminCommentsPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'comment.view')) redirect('/admin/?denied=1');
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const status = str(sp.status) as CommentStatus | undefined;
  const q = str(sp.q);
  const [comments, counts] = await Promise.all([
    listForModeration(actor, { status, q }),
    moderationCounts(actor),
  ]);
  return (
    <AdminCommentsPage
      comments={comments}
      counts={counts}
      canDelete={roleHasPermission(user.roles, 'comment.delete')}
      filters={{ status: (status as string) ?? '', q: q ?? '' }}
    />
  );
}
