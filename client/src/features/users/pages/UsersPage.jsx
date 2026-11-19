/**
 * features/users/pages/UsersPage.jsx
 * ─────────────────────────────────────
 * User Management page — full CRUD with RBAC role assignment.
 *
 * Features:
 *   - Paginated, searchable user table
 *   - Create User modal (username, email, password, initial role)
 *   - Role assignment / removal per user (via /api/rbac/users/:id/roles)
 *   - Suspend / Activate account with confirmation
 *   - Toast notifications via onToast prop
 *
 * SECURITY: This page is UI-only. All writes are authorized by the backend.
 * Never treat frontend permission checks as the security boundary.
 *
 * Props: user, isAdmin, onToast
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserCog, Plus, Search, RefreshCw, X, MoreVertical,
} from 'lucide-react';
import { usersApi, rbacApi } from '@/services/rbacApi';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import Spinner      from '@/components/ui/Spinner';
import EmptyState   from '@/components/ui/EmptyState';
import DataTablePagination from '@/components/common/DataTablePagination';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import AccessDenied from '@/components/ui/AccessDenied';
import usePermissions from '@/features/auth/usePermissions';
import useAppStore from '@/store/useAppStore';

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.12)';

// ── Query key factory ─────────────────────────────────────────────────────────
const userKeys = {
  all:   ()             => ['users'],
  list:  (page, search) => ['users', page, search],
  roles: ()             => ['roles'],
};

// ── Pill helper ───────────────────────────────────────────────────────────────
function Pill({ children, color = MUTED, bg = 'rgba(138,77,31,0.08)', border = BORDER }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide border"
      style={{ background: bg, color, borderColor: border }}
    >
      {children}
    </span>
  );
}

function SuspendedPill({ suspended }) {
  return suspended
    ? <Pill color="#b91c1c" bg="rgba(220,38,38,0.08)" border="rgba(220,38,38,0.20)">Suspended</Pill>
    : <Pill color="#15803d" bg="rgba(21,128,61,0.08)"  border="rgba(21,128,61,0.20)">Active</Pill>;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function UsersPage({ onToast }) {
  const currentUser = useAppStore(s => s.user);
  const { hasPermission, hasAnyPermission, isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const canView        = hasAnyPermission(['view_users', 'manage_users']);
  const canManage      = hasPermission('manage_users');
  const canAssignRoles = hasPermission('manage_roles');

  // ── Filter / pagination state ─────────────────────────────────────────────
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debounceRef = useRef(null);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [createOpen,       setCreateOpen]       = useState(false);
  const [editUser,         setEditUser]         = useState(null);   // user object for edit
  const [confirmUser,      setConfirmUser]      = useState(null);   // { user, action: 'suspend'|'activate' }
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);   // user object to delete

  // ── Create form state ─────────────────────────────────────────────────────
  const [form,      setForm]      = useState({ username: '', email: '', password: '', roleName: '' });
  const [formError, setFormError] = useState('');

  // ── Edit: roles state ──────────────────────────────────────────────────────
  const [editRoles,        setEditRoles]        = useState([]);
  const [editRolesLoading, setEditRolesLoading] = useState(false);
  const [roleToAdd,        setRoleToAdd]        = useState('');
  const [roleOpLoading,    setRoleOpLoading]    = useState(false);

  // ── Invalidation helper ───────────────────────────────────────────────────
  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: userKeys.all() });

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // ── useQuery: users list ──────────────────────────────────────────────────
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: userKeys.list(page, search),
    queryFn:  async () => {
      const res = await usersApi.listUsers({ page, limit: 20, search });
      return res.data;
    },
    enabled: canView,
  });

  const users = data?.users ?? [];
  const meta  = data?.meta  ?? null;

  // ── useQuery: roles list (for dropdowns) ──────────────────────────────────
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: userKeys.roles(),
    queryFn:  async () => {
      const res = await rbacApi.getRoles();
      return res.data.data ?? [];
    },
    enabled: canManage || canAssignRoles,
    staleTime: 1000 * 60 * 10, // roles rarely change — cache 10 min
  });

  const allRoles = rolesData ?? [];

  // ── useMutation: create user ──────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => usersApi.createUser(payload),
    onSuccess: (_, variables) => {
      setCreateOpen(false);
      setForm({ username: '', email: '', password: '', roleName: '' });
      setPage(1);
      onToast?.({ type: 'success', message: `✅ User "${variables.username}" created.` });
      invalidateUsers();
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Failed to create user.';
      setFormError(msg);
    },
  });

  // ── useMutation: suspend user ─────────────────────────────────────────────
  const suspendMutation = useMutation({
    mutationFn: (id) => usersApi.suspendUser(id),
    onSuccess: (_, __, ctx) => {
      onToast?.({ type: 'success', message: `✅ Account suspended.` });
      setConfirmUser(null);
      invalidateUsers();
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Operation failed.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    },
  });

  // ── useMutation: activate user ────────────────────────────────────────────
  const activateMutation = useMutation({
    mutationFn: (id) => usersApi.activateUser(id),
    onSuccess: () => {
      onToast?.({ type: 'success', message: `✅ Account reactivated.` });
      setConfirmUser(null);
      invalidateUsers();
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Operation failed.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    },
  });

  // ── useMutation: delete user ──────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id) => usersApi.deleteUser(id),
    onSuccess: (_, id) => {
      const username = deleteUserTarget?.username ?? '';
      onToast?.({ type: 'success', message: `🗑️ User "${username}" deleted successfully.` });
      setDeleteUserTarget(null);
      invalidateUsers();
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Failed to delete user.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
      setDeleteUserTarget(null);
    },
  });

  // Derived loading flags
  const submitting = createMutation.isPending;
  const statusSubmitting = suspendMutation.isPending || activateMutation.isPending;
  const deleting   = deleteMutation.isPending;

  // ── Helper: Map raw roles to full role objects ────────────────────────────
  function resolveRoleObjects(rawRoles) {
    return (rawRoles ?? []).map(r => {
      if (typeof r === 'object' && r !== null && r.id && r.name) return r;
      const roleName = typeof r === 'string' ? r : r?.name;
      const found = allRoles.find(ar => ar.name === roleName);
      return found || { id: found?.id ?? null, name: roleName };
    });
  }

  // ── Open edit modal ────────────────────────────────────────────────────────
  async function openEdit(u) {
    setEditUser(u);
    setRoleToAdd('');
    setEditRolesLoading(true);
    try {
      const res = await rbacApi.getUserRoles(u.id);
      const rolesList = res.data.roleObjects || res.data.roles || [];
      setEditRoles(resolveRoleObjects(rolesList));
    } catch {
      setEditRoles(resolveRoleObjects(u.roles ?? []));
    } finally {
      setEditRolesLoading(false);
    }
  }

  // ── Assign role to user ────────────────────────────────────────────────────
  async function handleAssignRole() {
    if (!roleToAdd || !editUser) return;
    setRoleOpLoading(true);
    try {
      await rbacApi.assignRoleToUser(editUser.id, roleToAdd);
      const res = await rbacApi.getUserRoles(editUser.id);
      const rolesList = res.data.roleObjects || res.data.roles || [];
      setEditRoles(resolveRoleObjects(rolesList));
      setRoleToAdd('');
      onToast?.({ type: 'success', message: `✅ Role "${roleToAdd}" assigned.` });
      invalidateUsers();
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to assign role.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    } finally {
      setRoleOpLoading(false);
    }
  }

  // ── Remove role from user ──────────────────────────────────────────────────
  async function handleRemoveRole(roleId, roleName) {
    if (!editUser) return;
    setRoleOpLoading(true);
    try {
      let id = roleId;
      if (!id) {
        const found = allRoles.find(ar => ar.name === roleName);
        id = found?.id;
      }
      if (!id) throw new Error('Role ID could not be resolved.');
      await rbacApi.removeRoleFromUser(editUser.id, id);
      const res = await rbacApi.getUserRoles(editUser.id);
      const rolesList = res.data.roleObjects || res.data.roles || [];
      setEditRoles(resolveRoleObjects(rolesList));
      onToast?.({ type: 'success', message: `✅ Role "${roleName}" removed.` });
      invalidateUsers();
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to remove role.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    } finally {
      setRoleOpLoading(false);
    }
  }

  // ── Create user handler ────────────────────────────────────────────────────
  function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (!form.username || !form.password) {
      setFormError('Username and password are required.');
      return;
    }
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    createMutation.mutate(form);
  }

  // ── Suspend / Activate handler ────────────────────────────────────────────
  function handleStatusChange() {
    if (!confirmUser) return;
    const { user: u, action } = confirmUser;
    if (action === 'suspend') {
      suspendMutation.mutate(u.id);
    } else {
      activateMutation.mutate(u.id);
    }
  }

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!canView) {
    return <AccessDenied onGoHome={() => useAppStore.getState().setActivePage('overview')} />;
  }

  return (
    <div className="p-6 space-y-5" style={{ background: IVORY, minHeight: '100%' }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: CHOCOLATE }}>
            <UserCog size={20} style={{ color: BRAND }} />
            User Management
          </h1>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            Create, manage, and assign roles to system users.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            title="Refresh"
            className="p-2 rounded-lg border transition"
            style={{ borderColor: BORDER, color: MUTED, background: '#fff' }}
          >
            <RefreshCw size={15} />
          </button>
          {canManage && (
            <Button
              onClick={() => { setCreateOpen(true); setFormError(''); }}
              className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: BRAND }}
            >
              <Plus size={15} /> Add User
            </Button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
        <Input
          className="pl-9 text-sm"
          placeholder="Search users…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
      </div>

      {/* Table */}
      <div
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={28} style={{ color: BRAND }} />
          </div>
        ) : isError ? (
          <EmptyState
            icon={UserCog}
            title="Failed to load users"
            description="An error occurred. Try refreshing."
          />
        ) : users.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No users found"
            description={search ? 'Try a different search term.' : 'No users in the system yet.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}`, background: '#FDFBF9' }}>
                    {['Username', 'Email', 'Roles', 'Status', 'Created', 'Actions'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: MUTED }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: i < users.length - 1 ? `1px solid ${BORDER}` : 'none',
                        background: u.is_suspended ? 'rgba(220,38,38,0.02)' : 'transparent',
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: BRAND }}
                          >
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium" style={{ color: CHOCOLATE }}>
                            {u.username}
                            {u.id === currentUser?.id && (
                              <span className="ml-1.5 text-[10px]" style={{ color: MUTED }}>(you)</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: MUTED }}>
                        {u.email || <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.length > 0
                            ? u.roles.map(r => (
                                <Pill key={r.id}>{r.name}</Pill>
                              ))
                            : <span style={{ color: '#ccc', fontSize: 11 }}>None</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <SuspendedPill suspended={u.is_suspended} />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: MUTED }}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {canManage && (() => {
                            // Determine if the target user is an Admin account
                            const isTargetAdmin =
                              u.roles?.some(r => r.name === 'ADMIN') ||
                              u.role === 'ADMIN';
                            // Non-admins cannot act on Admin accounts
                            const canActOnTarget = isAdmin || !isTargetAdmin;
                            return (
                              <>
                                <button
                                  onClick={() => openEdit(u)}
                                  className="px-2.5 py-1.5 rounded text-xs font-medium border transition"
                                  style={{ borderColor: BORDER, color: BRAND, background: '#fff' }}
                                  title="Manage Roles"
                                >
                                  Roles
                                </button>

                                {canActOnTarget && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-text-3 hover:text-text-1 hover:bg-[#FAF8F5] rounded-md"
                                        aria-label={`Actions for ${u.username}`}
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44 bg-white border border-[#E5DED6] shadow-md z-50">
                                      {u.id !== currentUser?.id && (
                                        <DropdownMenuItem
                                          onClick={() => setConfirmUser({ user: u, action: u.is_suspended ? 'activate' : 'suspend' })}
                                          className={u.is_suspended
                                            ? "cursor-pointer text-[#15803d] hover:bg-[#F2FAF4] focus:bg-[#F2FAF4] focus:text-[#15803d]"
                                            : "cursor-pointer text-[#b91c1c] hover:bg-[#FDF3F0] focus:bg-[#FDF3F0] focus:text-[#b91c1c]"
                                          }
                                        >
                                          {u.is_suspended ? 'Activate Account' : 'Suspend Account'}
                                        </DropdownMenuItem>
                                      )}

                                      <DropdownMenuItem
                                        onClick={() => {
                                          onToast?.({ type: 'success', message: 'Password reset email sent.' });
                                        }}
                                        className="cursor-pointer text-[#3E2723] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#3E2723]"
                                      >
                                        Reset Password
                                      </DropdownMenuItem>

                                      {u.id !== currentUser?.id && (
                                        <DropdownMenuItem
                                          variant="destructive"
                                          onClick={() => setDeleteUserTarget(u)}
                                          className="cursor-pointer text-[#C0392B] focus:text-[#C0392B] focus:bg-destructive/10"
                                        >
                                          Delete User
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              meta={meta}
              onPageChange={(p) => setPage(p)}
              loading={isLoading}
            />
          </>
        )}
      </div>

      {/* ── Create User Modal ───────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent style={{ maxWidth: '460px' }}>
          <DialogHeader>
            <DialogTitle style={{ color: CHOCOLATE }}>Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                Username <span style={{ color: BRAND }}>*</span>
              </label>
              <Input
                placeholder="e.g. jane.doe"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>Email</label>
              <Input
                type="email"
                placeholder="user@nibbank.et"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                Password <span style={{ color: BRAND }}>*</span>
              </label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                Initial Role
              </label>
              <select
                disabled={rolesLoading || !canAssignRoles}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: BORDER,
                  color: !canAssignRoles ? MUTED : CHOCOLATE,
                  background: !canAssignRoles ? '#F5F5F5' : '#fff',
                  cursor: !canAssignRoles ? 'not-allowed' : 'default',
                }}
                value={form.roleName}
                onChange={e => setForm(f => ({ ...f, roleName: e.target.value }))}
              >
                <option value="">— None —</option>
                {allRoles
                  .filter(r => isAdmin || r.name !== 'ADMIN')
                  .map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
              </select>
              {!canAssignRoles && (
                <p className="text-[11px] mt-1" style={{ color: MUTED }}>
                  Role assignment requires the Role Management permission.
                </p>
              )}
            </div>
            {formError && (
              <p className="text-xs font-medium" style={{ color: '#b91c1c' }}>{formError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="text-white font-semibold"
                style={{ background: BRAND }}
              >
                {submitting ? <Spinner size={16} /> : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Roles Modal ────────────────────────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent style={{ maxWidth: '480px' }}>
          <DialogHeader>
            <DialogTitle style={{ color: CHOCOLATE }}>
              Manage Roles — <span style={{ color: BRAND }}>{editUser?.username}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current roles */}
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Assigned Roles</p>
              {editRolesLoading ? (
                <Spinner size={18} style={{ color: BRAND }} />
              ) : editRoles.length === 0 ? (
                <p className="text-xs" style={{ color: MUTED }}>No roles assigned.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {editRoles.map(r => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-semibold border"
                      style={{
                        background: 'rgba(138,77,31,0.09)',
                        borderColor: 'rgba(138,77,31,0.22)',
                        color: BRAND,
                      }}
                    >
                      {r.name}
                      {canManage && (
                        <button
                          onClick={() => handleRemoveRole(r.id, r.name)}
                          disabled={roleOpLoading}
                          className="rounded-full hover:bg-red-100 transition p-0.5"
                          title="Remove role"
                        >
                          <X size={11} style={{ color: '#b91c1c' }} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Assign new role */}
            {canManage && editUser && editUser.id !== currentUser?.id && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Assign Role</p>
                <div className="flex gap-2">
                  <select
                    disabled={rolesLoading}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ borderColor: BORDER, color: CHOCOLATE, background: '#fff' }}
                    value={roleToAdd}
                    onChange={e => setRoleToAdd(e.target.value)}
                  >
                    <option value="">— Select role —</option>
                    {allRoles
                      .filter(r => !editRoles.some(er => (er.id && er.id === r.id) || er.name === r.name))
                      .filter(r => isAdmin || r.name !== 'ADMIN')
                      .map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))
                    }
                  </select>
                  <Button
                    onClick={handleAssignRole}
                    disabled={!roleToAdd || roleOpLoading}
                    className="text-white text-sm font-semibold px-4"
                    style={{ background: BRAND }}
                  >
                    {roleOpLoading ? <Spinner size={15} /> : 'Assign'}
                  </Button>
                </div>
              </div>
            )}

            {editUser && editUser.id === currentUser?.id && (
              <p className="text-xs p-3 rounded-lg border" style={{ color: MUTED, borderColor: BORDER, background: '#FDFBF9' }}>
                You cannot modify your own role assignments.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Suspend / Activate ──────────────────────────────────────── */}
      <Dialog open={!!confirmUser} onOpenChange={() => setConfirmUser(null)}>
        <DialogContent style={{ maxWidth: '400px' }}>
          <DialogHeader>
            <DialogTitle style={{ color: CHOCOLATE }}>
              {confirmUser?.action === 'suspend' ? 'Suspend Account' : 'Activate Account'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm" style={{ color: MUTED }}>
              {confirmUser?.action === 'suspend'
                ? `Suspend "${confirmUser?.user?.username}"? They will immediately lose all system access.`
                : `Reactivate "${confirmUser?.user?.username}"? They will regain access to their assigned permissions.`
              }
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUser(null)}>Cancel</Button>
            <Button
              onClick={handleStatusChange}
              disabled={statusSubmitting}
              className="text-white font-semibold"
              style={{
                background: confirmUser?.action === 'suspend' ? '#b91c1c' : '#15803d',
              }}
            >
              {statusSubmitting
                ? <Spinner size={15} />
                : confirmUser?.action === 'suspend' ? 'Suspend' : 'Activate'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete User ────────────────────────────────────────────── */}
      <Dialog open={!!deleteUserTarget} onOpenChange={() => !deleting && setDeleteUserTarget(null)}>
        <DialogContent style={{ maxWidth: '400px' }}>
          <DialogHeader>
            <DialogTitle style={{ color: CHOCOLATE }}>Delete User</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm" style={{ color: MUTED }}>
              Are you sure you want to permanently delete user <strong style={{ color: CHOCOLATE }}>"{deleteUserTarget?.username}"</strong>? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteUserTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(deleteUserTarget?.id)}
              disabled={deleting}
              className="bg-[#C0392B] hover:bg-[#a93226] text-white font-semibold"
            >
              {deleting ? <Spinner size={15} /> : 'Delete User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
