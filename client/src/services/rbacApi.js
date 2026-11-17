/**
 * client/src/services/rbacApi.js
 * ────────────────────────────────
 * Typed API helpers for all RBAC and User Management endpoints.
 * Always use these wrappers — never call api directly from RBAC pages.
 */

import api from './api';

// ── RBAC: Roles ───────────────────────────────────────────────────────────────
export const rbacApi = {
  /** GET /api/rbac/roles — requires view_roles */
  getRoles: () => api.get('/rbac/roles'),

  /** POST /api/rbac/roles — requires manage_roles */
  createRole: ({ name, description }) =>
    api.post('/rbac/roles', { name, description }),

  /** DELETE /api/rbac/roles/:id — requires manage_roles */
  deleteRole: (roleId) => api.delete(`/rbac/roles/${roleId}`),

  // ── Permissions ─────────────────────────────────────────────────────────────
  /** GET /api/rbac/permissions — requires view_roles */
  getPermissions: () => api.get('/rbac/permissions'),

  /** POST /api/rbac/roles/:id/permissions — requires manage_roles */
  addPermissionToRole: (roleId, permissionKey) =>
    api.post(`/rbac/roles/${roleId}/permissions`, { permissionKey }),

  /** DELETE /api/rbac/roles/:id/permissions/:permKey — requires manage_roles */
  removePermissionFromRole: (roleId, permissionKey) =>
    api.delete(`/rbac/roles/${roleId}/permissions/${permissionKey}`),

  // ── User↔Role assignments ────────────────────────────────────────────────────
  /** GET /api/rbac/users/:userId/roles — requires view_roles */
  getUserRoles: (userId) => api.get(`/rbac/users/${userId}/roles`),

  /** POST /api/rbac/users/:userId/roles — requires manage_roles */
  assignRoleToUser: (userId, roleName) =>
    api.post(`/rbac/users/${userId}/roles`, { roleName }),

  /** DELETE /api/rbac/users/:userId/roles/:roleId — requires manage_roles */
  removeRoleFromUser: (userId, roleId) =>
    api.delete(`/rbac/users/${userId}/roles/${roleId}`),
};

// ── Users module ──────────────────────────────────────────────────────────────
export const usersApi = {
  /** GET /api/users?page=&limit=&search= — requires view_users */
  listUsers: ({ page = 1, limit = 20, search = '' } = {}) =>
    api.get('/users', { params: { page, limit, search } }),

  /** POST /api/users — requires manage_users */
  createUser: ({ username, email, password, roleName }) =>
    api.post('/users', { username, email, password, roleName }),

  /** PATCH /api/users/:id — requires manage_users */
  updateUser: (userId, { username, email }) =>
    api.patch(`/users/${userId}`, { username, email }),

  /** PATCH /api/users/:id/suspend — requires manage_users */
  suspendUser: (userId) => api.patch(`/users/${userId}/suspend`),

  /** PATCH /api/users/:id/activate — requires manage_users */
  activateUser: (userId) => api.patch(`/users/${userId}/activate`),

  /** DELETE /api/users/:id — requires manage_users */
  deleteUser: (userId) => api.delete(`/users/${userId}`),
};

