/**
 * features/roles/pages/RolesPage.jsx
 * ─────────────────────────────────────
 * Role Management page — full CRUD with permission matrix.
 *
 * Features:
 *   - List all roles: name, isSystem badge, permission count, actions
 *   - Create Role modal: name, description, initial permission selection
 *   - Edit Role: add/remove permissions (blocked for system roles)
 *   - Delete Role: confirmation dialog, blocked for system roles
 *   - Permission matrix grouped by module using live /api/rbac/permissions catalog
 *
 * SECURITY: UI-only. Backend enforces all permission checks.
 *
 * Props: user, isAdmin, onToast
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Plus, RefreshCw, Trash2, Settings2, X, Check,
} from 'lucide-react';
import { rbacApi } from '@/services/rbacApi';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import Spinner     from '@/components/ui/Spinner';
import EmptyState  from '@/components/ui/EmptyState';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import AccessDenied  from '@/components/ui/AccessDenied';
import usePermissions from '@/features/auth/usePermissions';
import useAppStore    from '@/store/useAppStore';

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.12)';

// ── Query key factory ─────────────────────────────────────────────────────────
const rolesKeys = {
  all:  () => ['roles-data'],
};

// ── Permission module groupings ───────────────────────────────────────────────
const MODULE_GROUPS = {
  Dashboard:          ['view_dashboard'],
  Agents:             ['view_agents', 'manage_agents'],
  Campaigns:          ['view_campaigns', 'manage_campaigns'],
  Referrals:          ['view_referrals', 'manage_referrals'],
  'Integration Logs': ['view_logs', 'manage_logs'],
  Finance:            ['view_finance', 'manage_finance'],
  Users:              ['view_users', 'manage_users'],
  Roles:              ['view_roles', 'manage_roles'],
  'Settings & System': ['view_settings', 'manage_system'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function SystemBadge({ isSystem }) {
  return isSystem ? (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide border"
      style={{ background: 'rgba(212,175,55,0.15)', color: '#8A5D00', borderColor: 'rgba(212,175,55,0.35)' }}
    >
      System
    </span>
  ) : (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide border"
      style={{ background: 'rgba(138,77,31,0.08)', color: BRAND, borderColor: BORDER }}
    >
      Custom
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RolesPage({ onToast }) {
  const { hasPermission, hasAnyPermission } = usePermissions();
  const queryClient = useQueryClient();

  const canView   = hasAnyPermission(['view_roles', 'manage_roles']);
  const canManage = hasPermission('manage_roles');

  // ── Create modal ───────────────────────────────────────────────────────────
  const [createOpen,    setCreateOpen]    = useState(false);
  const [createForm,    setCreateForm]    = useState({ name: '', description: '' });
  const [createPerms,   setCreatePerms]   = useState(new Set());
  const [createError,   setCreateError]   = useState('');

  // ── Edit modal ─────────────────────────────────────────────────────────────
  const [editRole,      setEditRole]      = useState(null);
  const [editPerms,     setEditPerms]     = useState([]);   // current assigned perm keys
  const [editLoading,   setEditLoading]   = useState(false);
  const [permOpLoading, setPermOpLoading] = useState(false);

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const [deleteRole, setDeleteRole] = useState(null);

  // ── Invalidation helper ───────────────────────────────────────────────────
  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: rolesKeys.all() });

  // ── useQuery: roles + permissions catalog ─────────────────────────────────
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: rolesKeys.all(),
    queryFn:  async () => {
      const [rolesRes, permsRes] = await Promise.all([
        rbacApi.getRoles(),
        rbacApi.getPermissions(),
      ]);
      return {
        roles:       rolesRes.data.data ?? [],
        permissions: permsRes.data.data ?? [],
      };
    },
    enabled: canView,
  });

  const roles       = data?.roles       ?? [];
  const permissions = data?.permissions ?? [];

  // ── useMutation: create role ──────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const res     = await rbacApi.createRole(payload.meta);
      const newRole = res.data.role;
      // Assign selected permissions sequentially
      for (const permKey of payload.perms) {
        try { await rbacApi.addPermissionToRole(newRole.id, permKey); } catch {}
      }
      return newRole;
    },
    onSuccess: (newRole) => {
      onToast?.({ type: 'success', message: `✅ Role "${newRole.name}" created.` });
      setCreateOpen(false);
      setCreateForm({ name: '', description: '' });
      setCreatePerms(new Set());
      invalidateRoles();
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Failed to create role.';
      setCreateError(msg);
    },
  });

  // ── useMutation: delete role ──────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id) => rbacApi.deleteRole(id),
    onSuccess: () => {
      onToast?.({ type: 'success', message: `✅ Role "${deleteRole?.name}" deleted.` });
      setDeleteRole(null);
      invalidateRoles();
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Failed to delete role.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    },
  });

  // ── Open edit — load role's current permissions ────────────────────────────
  async function openEdit(role) {
    setEditRole(role);
    setEditLoading(true);
    try {
      const permKeys = (role.permissions ?? []).map(p => typeof p === 'string' ? p : p.key);
      setEditPerms(permKeys);
    } finally {
      setEditLoading(false);
    }
  }

  // ── Create role handler ────────────────────────────────────────────────────
  function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    if (!createForm.name.trim()) {
      setCreateError('Role name is required.');
      return;
    }
    createMutation.mutate({
      meta: {
        name:        createForm.name.trim(),
        description: createForm.description.trim() || null,
      },
      perms: Array.from(createPerms),
    });
  }

  // ── Add permission to role (local async — updates editPerms optimistically) ─
  async function handleAddPerm(permKey) {
    if (!editRole || permOpLoading) return;
    setPermOpLoading(true);
    try {
      await rbacApi.addPermissionToRole(editRole.id, permKey);
      setEditPerms(prev => [...prev, permKey]);
      onToast?.({ type: 'success', message: `✅ Permission "${permKey}" added.` });
      invalidateRoles();
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to add permission.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    } finally {
      setPermOpLoading(false);
    }
  }

  // ── Remove permission from role ────────────────────────────────────────────
  async function handleRemovePerm(permKey) {
    if (!editRole || permOpLoading) return;
    setPermOpLoading(true);
    try {
      await rbacApi.removePermissionFromRole(editRole.id, permKey);
      setEditPerms(prev => prev.filter(p => p !== permKey));
      onToast?.({ type: 'success', message: `✅ Permission "${permKey}" removed.` });
      invalidateRoles();
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Failed to remove permission.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    } finally {
      setPermOpLoading(false);
    }
  }

  // ── Permission Matrix sub-component ───────────────────────────────────────
  function PermissionMatrix({ assignedKeys = new Set(), onToggle, readOnly = false }) {
    return (
      <div className="space-y-4">
        {Object.entries(MODULE_GROUPS).map(([module, keys]) => (
          <div key={module}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: MUTED }}>
              {module}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {keys.map(key => {
                const perm    = permissions.find(p => p.key === key);
                const checked = assignedKeys.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={readOnly || permOpLoading}
                    onClick={() => onToggle && onToggle(key, checked)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition"
                    style={{
                      borderColor: checked ? BRAND : BORDER,
                      background:  checked ? 'rgba(138,77,31,0.07)' : '#FDFBF9',
                      cursor:      readOnly ? 'default' : 'pointer',
                      opacity:     permOpLoading ? 0.6 : 1,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: checked ? BRAND : BORDER,
                        background:  checked ? BRAND : 'transparent',
                      }}
                    >
                      {checked && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-none" style={{ color: CHOCOLATE }}>
                        {key}
                      </p>
                      {perm?.description && (
                        <p className="text-[10px] mt-0.5 leading-tight" style={{ color: MUTED }}>
                          {perm.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
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
            <Shield size={20} style={{ color: BRAND }} />
            Role Management
          </h1>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            Define custom roles and control their permission sets dynamically.
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
              onClick={() => { setCreateOpen(true); setCreateError(''); setCreateForm({ name: '', description: '' }); setCreatePerms(new Set()); }}
              className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: BRAND }}
            >
              <Plus size={15} /> Create Role
            </Button>
          )}
        </div>
      </div>

      {/* Roles grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={28} style={{ color: BRAND }} />
        </div>
      ) : isError ? (
        <EmptyState icon={Shield} title="Failed to load roles" description="An error occurred. Try refreshing." />
      ) : roles.length === 0 ? (
        <EmptyState icon={Shield} title="No roles found" description="Create your first role above." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map(role => {
            const permCount = role.permissions?.length ?? 0;
            return (
              <div
                key={role.id}
                className="bg-white rounded-xl shadow-sm flex flex-col"
                style={{ border: `1px solid ${BORDER}` }}
              >
                <div className="p-4 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm truncate" style={{ color: CHOCOLATE }}>
                        {role.name}
                      </h3>
                      <SystemBadge isSystem={role.isSystem} />
                    </div>
                    {role.description && (
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: MUTED }}>
                        {role.description}
                      </p>
                    )}
                    <p className="text-xs mt-2 font-medium" style={{ color: MUTED }}>
                      {permCount} permission{permCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Permission tags (top 5 preview) */}
                {permCount > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {(role.permissions ?? []).slice(0, 5).map(p => (
                      <span
                        key={typeof p === 'string' ? p : p.key}
                        className="text-[10px] px-1.5 py-0.5 rounded border font-mono"
                        style={{ background: '#FDFBF9', borderColor: BORDER, color: MUTED }}
                      >
                        {typeof p === 'string' ? p : p.key}
                      </span>
                    ))}
                    {permCount > 5 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-mono" style={{ color: MUTED, borderColor: BORDER }}>
                        +{permCount - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                {canManage && (
                  <div
                    className="mt-auto px-4 py-3 flex gap-2 border-t"
                    style={{ borderColor: BORDER }}
                  >
                    <button
                      onClick={() => openEdit(role)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition"
                      style={{ borderColor: BORDER, color: BRAND, background: '#fff' }}
                    >
                      <Settings2 size={12} /> Edit Permissions
                    </button>
                    {!role.isSystem && (
                      <button
                        onClick={() => setDeleteRole(role)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition"
                        style={{ borderColor: 'rgba(220,38,38,0.25)', color: '#b91c1c', background: '#fff' }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Role Modal ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle style={{ color: CHOCOLATE }}>Create New Role</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5 py-2">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>
                Role Name <span style={{ color: BRAND }}>*</span>
              </label>
              <Input
                placeholder="e.g. FINANCE_VIEWER"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                autoFocus
              />
              <p className="text-[11px] mt-1" style={{ color: MUTED }}>Uppercase only, no spaces (underscores allowed).</p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: MUTED }}>Description</label>
              <Input
                placeholder="Brief description of this role…"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div>
              <p className="text-xs font-semibold mb-3" style={{ color: MUTED }}>Initial Permissions</p>
              <PermissionMatrix
                assignedKeys={createPerms}
                onToggle={(key, checked) => {
                  setCreatePerms(prev => {
                    const next = new Set(prev);
                    checked ? next.delete(key) : next.add(key);
                    return next;
                  });
                }}
              />
            </div>

            {createError && (
              <p className="text-xs font-medium" style={{ color: '#b91c1c' }}>{createError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="text-white font-semibold"
                style={{ background: BRAND }}
              >
                {createMutation.isPending ? <Spinner size={16} /> : 'Create Role'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Permissions Modal ────────────────────────────────────────── */}
      <Dialog open={!!editRole} onOpenChange={() => setEditRole(null)}>
        <DialogContent style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle style={{ color: CHOCOLATE }}>
              Edit Permissions — <span style={{ color: BRAND }}>{editRole?.name}</span>
              {editRole?.isSystem && (
                <span className="ml-2 text-xs font-normal" style={{ color: MUTED }}>(system role — read only)</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {editLoading ? (
              <Spinner size={22} style={{ color: BRAND }} />
            ) : (
              <PermissionMatrix
                assignedKeys={new Set(editPerms)}
                readOnly={editRole?.isSystem || !canManage}
                onToggle={(key, checked) => {
                  if (editRole?.isSystem || !canManage) return;
                  if (checked) {
                    handleRemovePerm(key);
                  } else {
                    handleAddPerm(key);
                  }
                }}
              />
            )}
            {editRole?.isSystem && (
              <p className="mt-4 text-xs p-3 rounded-lg border" style={{ color: MUTED, borderColor: BORDER, background: '#FDFBF9' }}>
                System role permissions are managed by database migration and cannot be changed via the UI.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRole(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      <Dialog open={!!deleteRole} onOpenChange={() => setDeleteRole(null)}>
        <DialogContent style={{ maxWidth: '400px' }}>
          <DialogHeader>
            <DialogTitle style={{ color: CHOCOLATE }}>Delete Role</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm" style={{ color: MUTED }}>
              Permanently delete <strong style={{ color: CHOCOLATE }}>"{deleteRole?.name}"</strong>?
              All users assigned this role will lose the associated permissions immediately.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRole(null)}>Cancel</Button>
            <Button
              onClick={() => deleteMutation.mutate(deleteRole?.id)}
              disabled={deleteMutation.isPending}
              className="text-white font-semibold"
              style={{ background: '#b91c1c' }}
            >
              {deleteMutation.isPending ? <Spinner size={15} /> : 'Delete Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
