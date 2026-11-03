'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import type { StaffRow } from '../../lib/cms/teamService';
import type { PermissionMatrixGroup, RoleKey } from '../../lib/auth/permissions';
import { ALL_ROLES, ROLE_LABELS } from '../../lib/auth/permissions';
import * as actions from '../../app/admin/team-actions';

interface InvitationRow { id: string; email: string; roleKey: string; status: string; expiresAt: string }

export interface AdminTeamPageProps {
  staff: StaffRow[];
  invitations: InvitationRow[];
  matrix: PermissionMatrixGroup[];
  filters: { q?: string; role?: string; status?: string };
  currentUserId: string;
  caps: { canAssign: boolean; isSuperAdmin: boolean };
}

type Tab = 'members' | 'invitations' | 'matrix';

export const AdminTeamPage: React.FC<AdminTeamPageProps> = ({ staff, invitations, matrix, filters, currentUserId, caps }) => {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('members');
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };
  const act = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => { const r = await p; notify(r.ok ? okMsg : `Failed: ${r.error}`); if (r.ok) router.refresh(); });

  const assignable: RoleKey[] = caps.isSuperAdmin ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'super_admin');
  const active = staff.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {toast && <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}

      <AdminPageHeader
        title="Team & Permissions"
        description="Database-backed staff accounts, server-authorized role assignment, session control, and the real role-permission matrix."
        breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Team & Permissions' }]}
        actions={<button onClick={() => { setInviteLink(null); setInviteOpen(true); }} className="px-3.5 py-1.5 text-xs font-sans font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs">Invite Staff</button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard title="Total Staff" value={staff.length.toString()} description={`${active} active`} trend="neutral" />
        <AdminStatCard title="Super Admins" value={staff.filter((s) => s.roles.some((r) => r.key === 'super_admin')).length.toString()} description="Protected: ≥1 active required" trend="neutral" />
        <AdminStatCard title="Pending Invitations" value={invitations.filter((i) => i.status === 'PENDING').length.toString()} description="Single-use, time-limited" trend="neutral" />
        <AdminStatCard title="Suspended" value={staff.filter((s) => s.status === 'SUSPENDED').length.toString()} description="Sessions revoked" trend="neutral" />
      </div>

      <AdminTabs
        tabs={[{ id: 'members', label: 'Staff Directory', count: staff.length }, { id: 'invitations', label: 'Invitations', count: invitations.length }, { id: 'matrix', label: 'Permission Matrix' }]}
        activeTab={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {/* MEMBERS */}
      {tab === 'members' && (
        <div className="space-y-3">
          <form method="get" className="flex flex-wrap gap-2 text-xs">
            <input name="q" type="search" aria-label="Search staff by name or email" defaultValue={filters.q ?? ''} placeholder="Search name/email…" className="px-3 py-1.5 border border-stone-300 rounded-xs bg-white" />
            <select name="role" aria-label="Filter by role" defaultValue={filters.role ?? ''} className="px-2 py-1.5 border border-stone-300 rounded-xs bg-white">
              <option value="">Any role</option>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <select name="status" aria-label="Filter by status" defaultValue={filters.status ?? ''} className="px-2 py-1.5 border border-stone-300 rounded-xs bg-white">
              <option value="">Any status</option>
              {['ACTIVE', 'INVITED', 'SUSPENDED'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button type="submit" className="px-3 py-1.5 bg-stone-800 text-white rounded-xs font-mono">Filter</button>
          </form>

          <div className="bg-white border border-stone-200 rounded-xs overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-stone-50 border-b border-stone-200 text-ink-muted font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Staff</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-center">Sessions</th><th className="px-4 py-2.5">Last Login</th><th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {staff.map((u) => {
                  const self = u.id === currentUserId;
                  const primary = (u.roles[0]?.key as RoleKey) ?? 'author';
                  return (
                    <tr key={u.id} className="hover:bg-stone-50/50">
                      <td className="px-4 py-3"><div className="font-semibold text-stone-900">{u.name}</div><div className="text-[11px] text-ink-muted font-mono">{u.email}</div></td>
                      <td className="px-4 py-3">
                        {caps.canAssign && !self ? (
                          <select
                            aria-label={`Role for ${u.name}`}
                            defaultValue={primary}
                            disabled={pending}
                            onChange={(e) => act(actions.assignRolesAction(u.id, [e.target.value as RoleKey]), 'Role updated (sessions revoked)')}
                            className="px-2 py-1 text-xs border border-stone-300 rounded-xs bg-white"
                          >
                            {assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            {!assignable.includes(primary) && <option value={primary}>{ROLE_LABELS[primary]}</option>}
                          </select>
                        ) : (
                          <span className="text-stone-700">{u.roleLabel}{self && <span className="text-[10px] text-ink-muted ml-1">(you)</span>}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center"><span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : u.status === 'INVITED' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{u.status}</span></td>
                      <td className="px-4 py-3 text-center font-mono">{u.activeSessions}</td>
                      <td className="px-4 py-3 text-ink-muted font-mono text-[11px]">{u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {!self && u.status !== 'INVITED' && (
                          <button disabled={pending} onClick={() => act(actions.setStaffStatusAction(u.id, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'), 'Status updated')} className={`text-[11px] font-mono underline disabled:opacity-40 ${u.status === 'ACTIVE' ? 'text-rose-600' : 'text-emerald-700'}`}>{u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</button>
                        )}
                        {!self && u.activeSessions > 0 && <button disabled={pending} onClick={() => act(actions.revokeStaffSessionsAction(u.id), 'Sessions revoked')} className="text-[11px] font-mono underline text-ink-muted disabled:opacity-40">Revoke sessions</button>}
                        <button disabled={pending} onClick={() => start(async () => { const r = await actions.createPasswordResetAction(u.id); if (r.ok && 'data' in r) { const link = `${location.origin}/admin/reset-password/?token=${r.data.token}`; setInviteLink(link); setInviteOpen(true); } else notify(`Failed: ${(r as { error?: string }).error}`); })} className="text-[11px] font-mono underline text-ink-muted disabled:opacity-40">Reset link</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-muted">Role changes and suspensions revoke the member's sessions immediately. You cannot change your own role/status here. The last active Super Admin is protected.</p>
        </div>
      )}

      {/* INVITATIONS */}
      {tab === 'invitations' && (
        <div className="bg-white border border-stone-200 rounded-xs overflow-x-auto">
          {invitations.length === 0 ? <div className="px-4 py-10 text-center text-xs text-ink-muted">No invitations yet.</div> : (
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-stone-50 border-b border-stone-200 text-ink-muted font-mono text-[11px] uppercase"><tr><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Expires</th><th className="px-4 py-2.5 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-stone-200">
                {invitations.map((i) => (
                  <tr key={i.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium text-stone-900">{i.email}</td>
                    <td className="px-4 py-3 font-mono">{i.roleKey}</td>
                    <td className="px-4 py-3"><span className="text-[10px] font-mono px-2 py-0.5 rounded-xs bg-stone-100 text-stone-700 font-semibold">{i.status}</span></td>
                    <td className="px-4 py-3 text-ink-muted font-mono text-[11px]">{new Date(i.expiresAt).toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right">{i.status === 'PENDING' && <button disabled={pending} onClick={() => act(actions.revokeInvitationAction(i.id), 'Invitation revoked')} className="text-[11px] font-mono underline text-rose-600 disabled:opacity-40">Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* MATRIX (real) */}
      {tab === 'matrix' && (
        <div className="space-y-4">
          {matrix.map((g) => (
            <div key={g.module} className="bg-white border border-stone-200 rounded-xs overflow-x-auto">
              <div className="px-4 py-2 bg-stone-50/50 border-b border-stone-200 text-xs font-mono uppercase tracking-wider text-ink-muted font-semibold">{g.module}</div>
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-stone-50 border-b border-stone-200 text-ink-muted font-mono text-[11px] uppercase"><tr><th className="px-4 py-2">Capability</th>{ALL_ROLES.map((r) => <th key={r} className="px-3 py-2 text-center">{ROLE_LABELS[r].replace(' Admin', '').replace('istrator', 'in')}</th>)}</tr></thead>
                <tbody className="divide-y divide-stone-200">
                  {g.rows.map((row) => (
                    <tr key={row.key}><td className="px-4 py-2 text-stone-800">{row.label}</td>{ALL_ROLES.map((r) => <td key={r} className="px-3 py-2 text-center">{row.roles[r] ? <span className="text-emerald-700 font-bold">✓</span> : <span className="text-stone-300">—</span>}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-[11px] text-ink-muted">This matrix is generated from the enforced server-side RBAC source of truth (not hand-maintained).</p>
        </div>
      )}

      {/* INVITE / LINK MODAL */}
      {inviteOpen && (
        <AdminModal isOpen title={inviteLink ? 'Secure Link (copy now)' : 'Invite Staff Member'} onClose={() => setInviteOpen(false)}>
          {inviteLink ? (
            <div className="space-y-3">
              <p className="text-xs text-stone-600">This single-use, time-limited link is shown once. Share it with the staff member through a secure channel — the app does not send email.</p>
              <textarea readOnly aria-label="Invite link" value={inviteLink} onFocus={(e) => e.currentTarget.select()} rows={3} className="w-full px-3 py-2 text-[11px] font-mono border border-stone-300 rounded-xs bg-stone-50" />
              <div className="flex justify-end"><button onClick={() => setInviteOpen(false)} className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] rounded-xs">Done</button></div>
            </div>
          ) : (
            <InviteForm assignable={assignable} onDone={(link, msg) => { notify(msg); if (link) setInviteLink(link); else setInviteOpen(false); router.refresh(); }} />
          )}
        </AdminModal>
      )}
    </div>
  );
};

function InviteForm({ assignable, onDone }: { assignable: RoleKey[]; onDone: (link: string | null, msg: string) => void }) {
  const [f, setF] = useState({ name: '', email: '', roleKey: 'author' as RoleKey });
  const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await actions.createInvitationAction({ name: f.name, email: f.email, roleKey: f.roleKey });
      if (r.ok && 'data' in r) onDone(`${location.origin}/admin/accept-invitation/?token=${r.data.token}`, 'Invitation created — copy the link');
      else onDone(null, `Failed: ${(r as { error?: string }).error}`);
    }); }} className="space-y-3">
      <div><label htmlFor="invite-name" className="block text-xs font-mono uppercase text-ink-muted mb-1">Name</label><input id="invite-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs" /></div>
      <div><label htmlFor="invite-email" className="block text-xs font-mono uppercase text-ink-muted mb-1">Email</label><input id="invite-email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs" /></div>
      <div><label htmlFor="invite-role" className="block text-xs font-mono uppercase text-ink-muted mb-1">Role</label><select id="invite-role" value={f.roleKey} onChange={(e) => setF({ ...f, roleKey: e.target.value as RoleKey })} className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white">{assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
      <p className="text-[11px] text-ink-muted font-mono bg-stone-50 border border-stone-200 p-2 rounded-xs">No email is sent. You will receive a single-use link to share manually. The account stays INVITED until the link is used to set a password.</p>
      <div className="flex justify-end gap-2 pt-2 border-t border-stone-200"><button type="submit" disabled={pending} className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] rounded-xs disabled:opacity-50">Create Invitation</button></div>
    </form>
  );
}

export default AdminTeamPage;
