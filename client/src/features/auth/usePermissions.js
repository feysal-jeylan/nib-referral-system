/**
 * client/src/features/auth/usePermissions.js
 * ─────────────────────────────────────────────
 * Reusable permission helpers backed by the Zustand user store.
 *
 * SECURITY: These helpers are UI-only conveniences.
 * The backend is the authority — every protected endpoint enforces its own
 * permission check regardless of what the frontend shows or hides.
 *
 * Usage (hook):
 *   const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();
 *   if (hasPermission('manage_roles')) { ... }
 *
 * Usage (standalone, outside React):
 *   import { checkPermission } from '@/features/auth/usePermissions';
 *   checkPermission(user, 'view_finance');
 */

import useAppStore from '@/store/useAppStore';

// ── Standalone helpers (accept a user object) ─────────────────────────────────

/** Returns true if the user has the given permission key. */
export function checkPermission(user, key) {
  if (!user || !Array.isArray(user.permissions)) return false;
  return user.permissions.includes(key);
}

/** Returns true if the user has at least one of the given permission keys. */
export function checkAnyPermission(user, keys = []) {
  if (!user || !Array.isArray(user.permissions)) return false;
  return keys.some(k => user.permissions.includes(k));
}

/** Returns true if the user has ALL the given permission keys. */
export function checkAllPermissions(user, keys = []) {
  if (!user || !Array.isArray(user.permissions)) return false;
  return keys.every(k => user.permissions.includes(k));
}

/** Returns true if user has the ADMIN role (by name, not by legacy field). */
export function isAdminUser(user) {
  if (!user) return false;
  // Prefer RBAC roles array; fall back to legacy role field for backward compat
  if (Array.isArray(user.roles)) return user.roles.includes('ADMIN');
  return user.role === 'ADMIN';
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * usePermissions() — returns permission helpers bound to the current user.
 *
 * @returns {{
 *   hasPermission: (key: string) => boolean,
 *   hasAnyPermission: (keys: string[]) => boolean,
 *   hasAllPermissions: (keys: string[]) => boolean,
 *   isAdmin: boolean,
 *   permissions: string[],
 * }}
 */
export default function usePermissions() {
  const user = useAppStore(s => s.user);

  return {
    hasPermission:     (key)    => checkPermission(user, key),
    hasAnyPermission:  (keys)   => checkAnyPermission(user, keys),
    hasAllPermissions: (keys)   => checkAllPermissions(user, keys),
    isAdmin:           isAdminUser(user),
    permissions:       user?.permissions ?? [],
  };
}

