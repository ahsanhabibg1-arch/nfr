import React, { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import { ADMIN_USERS } from '../../data/mockAdminData';
import { AdminUser, AdminRole } from '../../types/admin';

const PERMISSION_MATRIX = [
  { action: 'Publish Articles Directly to Live Site', superAdmin: true, admin: true, editor: true, author: false, seo: false },
  { action: 'Edit and Review Any Author Content', superAdmin: true, admin: true, editor: true, author: false, seo: false },
  { action: 'Draft & Submit Own Articles', superAdmin: true, admin: true, editor: true, author: true, seo: false },
  { action: 'Permanently Delete Articles or Media', superAdmin: true, admin: true, editor: false, author: false, seo: false },
  { action: 'Manage Rodeo Hubs & Event Editions', superAdmin: true, admin: true, editor: true, author: false, seo: false },
  { action: 'Configure 12-Group SEO & Structured Data', superAdmin: true, admin: true, editor: false, author: false, seo: true },
  { action: 'Manage Affiliate Links & Ad Slots', superAdmin: true, admin: true, editor: false, author: false, seo: false },
  { action: 'Invite Team Members & Assign Roles', superAdmin: true, admin: true, editor: false, author: false, seo: false },
  { action: 'Modify System Settings & Domain DNS', superAdmin: true, admin: false, editor: false, author: false, seo: false },
];

export const AdminTeamPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'members' | 'matrix'>('members');
  const [users, setUsers] = useState<AdminUser[]>(ADMIN_USERS);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  
  // New user form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('Author');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRoleChange = (userId: string, updatedRole: AdminRole) => {
    setUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, role: updatedRole } : u))
    );
    showToast(`Updated role to ${updatedRole}`);
  };

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    const newUser: AdminUser = {
      id: `usr-${Date.now()}`,
      name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
      status: 'invited',
      lastActive: 'Invited just now',
      articlesCount: 0,
    };

    setUsers(prev => [...prev, newUser]);
    setNewName('');
    setNewEmail('');
    setNewRole('Author');
    setInviteModalOpen(false);
    showToast(`Invitation dispatched to ${newUser.email}`);
  };

  const handleToggleStatus = (userId: string) => {
    setUsers(prev =>
      prev.map(u => {
        if (u.id === userId) {
          const nextStatus = u.status === 'active' ? 'suspended' : 'active';
          return { ...u, status: nextStatus };
        }
        return u;
      })
    );
    showToast('User account status toggled');
  };

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono animate-fade-in flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      <AdminPageHeader
        title="Team & Access Permissions"
        description="Oversee editorial staff, assign publishing privileges, and review role-based access control matrices."
        breadcrumbs={[
          { label: 'Admin', path: '/admin/' },
          { label: 'Team & Permissions' },
        ]}
        actions={
          <button
            onClick={() => setInviteModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-sans font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-[#D4A757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite Staff Member
          </button>
        }
      />

      {/* Role Demonstration Disclaimer Banner */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xs text-xs text-amber-900 flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <span className="font-semibold block mb-0.5">Prototype RBAC Demonstration Notice</span>
          Role switching and invitation actions in this interface are client-side UX simulations. Real server-side authorization enforcement, secure passwordless or OAuth credentials, and database-backed permission guards will be integrated in Phase 1.
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          title="Total Staff Users"
          value={users.length.toString()}
          change="5 Active Team Members"
          trend="neutral"
          description="Editorial, Tech & Operations"
        />
        <AdminStatCard
          title="Publishing Editors"
          value={users.filter(u => u.role === 'Editor' || u.role === 'Administrator').length.toString()}
          change="Authorized to publish live"
          trend="up"
          description="Can clear editorial review queue"
        />
        <AdminStatCard
          title="Contributing Authors"
          value={users.filter(u => u.role === 'Author').length.toString()}
          change="Draft submissions enabled"
          trend="neutral"
          description="Can create & edit own stories"
        />
        <AdminStatCard
          title="SEO Intelligence Team"
          value={users.filter(u => u.role === 'SEO Manager').length.toString()}
          change="Full audit controls"
          trend="neutral"
          description="Monitors 12-group compliance"
        />
      </div>

      <AdminTabs
        tabs={[
          { id: 'members', label: 'Staff Directory', count: users.length },
          { id: 'matrix', label: 'Role Permission Matrix' },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
      />

      {/* TAB 1: MEMBERS */}
      {activeTab === 'members' && (
        <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Editorial Staff & Contributors ({users.length})
            </span>
            <span className="text-[11px] text-stone-500 font-mono">
              Role switches take effect immediately in this session
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Staff Member</th>
                  <th className="px-4 py-2.5">Assigned Role</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-right">Articles Authored</th>
                  <th className="px-4 py-2.5">Last Active</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1E293B] text-[#D4A757] flex items-center justify-center font-bold font-mono text-xs shrink-0">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <div className="font-semibold text-stone-900">{user.name}</div>
                          <div className="text-[11px] text-stone-500 font-mono">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as AdminRole)}
                        className="px-2 py-1 text-xs border border-stone-300 rounded-xs bg-white text-stone-800 font-medium focus:outline-none focus:border-[#D4A757]"
                      >
                        <option value="Super Admin">Super Admin</option>
                        <option value="Administrator">Administrator</option>
                        <option value="Editor">Editor</option>
                        <option value="Author">Author</option>
                        <option value="SEO Manager">SEO Manager</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${
                        user.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : user.status === 'invited'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {user.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-stone-800">
                      {user.articlesCount}
                    </td>
                    <td className="px-4 py-3 text-stone-500 font-mono text-[11px]">
                      {user.lastActive}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleStatus(user.id)}
                        className={`text-[11px] font-mono underline ${
                          user.status === 'active' ? 'text-rose-600 hover:text-rose-900' : 'text-emerald-700 hover:text-emerald-900'
                        }`}
                      >
                        {user.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PERMISSION MATRIX */}
      {activeTab === 'matrix' && (
        <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Editorial Role Capability Matrix
            </span>
            <span className="text-[11px] text-stone-500 font-mono">
              Governs what operations each staff member can execute
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">System Capability</th>
                  <th className="px-4 py-2.5 text-center">Super Admin</th>
                  <th className="px-4 py-2.5 text-center">Admin</th>
                  <th className="px-4 py-2.5 text-center">Editor</th>
                  <th className="px-4 py-2.5 text-center">Author</th>
                  <th className="px-4 py-2.5 text-center">SEO Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {PERMISSION_MATRIX.map((perm, idx) => (
                  <tr key={idx} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium text-stone-900">
                      {perm.action}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-emerald-700 font-bold">✓</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {perm.admin ? <span className="text-emerald-700 font-bold">✓</span> : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {perm.editor ? <span className="text-emerald-700 font-bold">✓</span> : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {perm.author ? <span className="text-emerald-700 font-bold">✓</span> : <span className="text-stone-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {perm.seo ? <span className="text-emerald-700 font-bold">✓</span> : <span className="text-stone-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INVITE USER MODAL */}
      {inviteModalOpen && (
        <AdminModal
          isOpen={true}
          title="Invite New Editorial Staff Member"
          onClose={() => setInviteModalOpen(false)}
        >
          <form onSubmit={handleInviteUser} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Full Legal / Byline Name
              </label>
              <input
                type="text"
                placeholder="e.g. Wyatt Holloway"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Staff Corporate Email
              </label>
              <input
                type="email"
                placeholder="w.holloway@nfrguide.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Editorial Role Assignment
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AdminRole)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              >
                <option value="Author">Author (Create & draft own stories)</option>
                <option value="Editor">Editor (Review, approve, and publish)</option>
                <option value="SEO Manager">SEO Manager (Audits & schemas)</option>
                <option value="Administrator">Administrator (Content & user management)</option>
                <option value="Super Admin">Super Admin (Unrestricted system access)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors"
              >
                Send Staff Invitation
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
};
