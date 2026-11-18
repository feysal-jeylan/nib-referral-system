/**
 * src/modules/rbac/rbac.controller.js
 * ─────────────────────────────────────
 * HTTP layer for RBAC management endpoints.
 * Privilege-escalation protections enforced here:
 *   - Users cannot modify their own roles.
 *   - System roles are immutable.
 *   - Last ADMIN protection.
 *   - Non-admins cannot assign ADMIN role or roles with admin-tier permissions.
 *   - Non-admins cannot grant admin-tier permissions or escalate their own role.
 */

'use strict';

const prisma    = require('@/config/db');
const rbacSvc   = require('./rbac.service');
const { logAuditEvent } = require('@/services/auditService');

// Permissions that only Admins may grant or place into roles
const RESTRICTED_ADMIN_PERMISSIONS = ['manage_roles', 'manage_system'];

// ── GET /api/rbac/roles ───────────────────────────────────────────────────────
async function listRoles(req, res, next) {
  try {
    const roles = await rbacSvc.listRoles();
    return res.status(200).json({ data: roles });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/rbac/roles ──────────────────────────────────────────────────────
async function createRole(req, res, next) {
  const name        = req.body.name?.trim().toUpperCase();
  const description = req.body.description?.trim() ?? null;

  if (!name) {
    return res.status(400).json({ error: 'name is required.', code: 'MISSING_FIELDS' });
  }
  if (/\s/.test(name)) {
    return res.status(400).json({ error: 'Role name must not contain spaces.', code: 'INVALID_ROLE_NAME' });
  }

  try {
    const role = await rbacSvc.createRole(name, description, false, {
      actorId: req.user.id,
      ipAddress: req.ip,
    });
    return res.status(201).json({ role });
  } catch (err) {
    if (err.code === 'ROLE_ALREADY_EXISTS') {
      return res.status(409).json({ error: err.message, code: 'ROLE_ALREADY_EXISTS' });
    }
    next(err);
  }
}

// ── DELETE /api/rbac/roles/:id ────────────────────────────────────────────────
async function deleteRole(req, res, next) {
  const roleId = parseInt(req.params.id, 10);
  if (isNaN(roleId)) {
    return res.status(400).json({ error: 'Role ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    await rbacSvc.deleteRole(roleId, { actorId: req.user.id, ipAddress: req.ip });
    return res.status(200).json({ message: 'Role deleted successfully.' });
  } catch (err) {
    if (err.code === 'CANNOT_DELETE_SYSTEM_ROLE') {
      return res.status(400).json({ error: err.message, code: 'CANNOT_DELETE_SYSTEM_ROLE' });
    }
    if (err.code === 'ROLE_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: 'ROLE_NOT_FOUND' });
    }
    next(err);
  }
}

// ── GET /api/rbac/permissions ─────────────────────────────────────────────────
async function listPermissions(req, res, next) {
  try {
    const permissions = await rbacSvc.listPermissions();
    return res.status(200).json({ data: permissions });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/rbac/roles/:id/permissions ─────────────────────────────────────
async function addPermissionToRole(req, res, next) {
  const roleId = parseInt(req.params.id, 10);
  if (isNaN(roleId)) {
    return res.status(400).json({ error: 'Role ID must be a valid integer.', code: 'INVALID_ID' });
  }

  const { permissionKey } = req.body;
  if (!permissionKey) {
    return res.status(400).json({ error: 'permissionKey is required.', code: 'MISSING_FIELDS' });
  }

  try {
    // Guard: cannot add permissions to system roles via API (use migration)
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return res.status(404).json({ error: 'Role not found.', code: 'ROLE_NOT_FOUND' });
    if (role.isSystem) {
      return res.status(400).json({
        error: 'System role permissions are managed by migration, not via API.',
        code: 'CANNOT_MODIFY_SYSTEM_ROLE',
      });
    }

    // Phase 3: Non-admin permission delegation guards
    const callerIsAdmin = rbacSvc.isRequestUserAdmin(req);
    if (!callerIsAdmin) {
      // Block granting admin-tier permissions
      if (RESTRICTED_ADMIN_PERMISSIONS.includes(permissionKey)) {
        return res.status(403).json({
          error: `Only system administrators can grant '${permissionKey}'.`,
          code: 'ADMIN_PERMISSION_DELEGATION_FORBIDDEN',
        });
      }
      // Block modifying permissions of a role assigned to the caller (self-escalation)
      const isAssignedToCaller = await prisma.userRole.findUnique({
        where: { userId_roleId: { userId: req.user.id, roleId } },
      });
      if (isAssignedToCaller) {
        return res.status(403).json({
          error: 'You cannot modify permissions on a role assigned to your own account.',
          code: 'SELF_MODIFICATION_FORBIDDEN',
        });
      }
      // Block granting a permission the caller does not personally hold
      if (!req.userPermissions?.has(permissionKey)) {
        return res.status(403).json({
          error: 'You cannot grant a permission you do not possess.',
          code: 'PERMISSION_DELEGATION_FORBIDDEN',
        });
      }
    }

    const rp = await rbacSvc.addPermissionToRole(roleId, permissionKey, {
      actorId: req.user.id,
      ipAddress: req.ip,
    });
    return res.status(201).json({ rolePermission: rp });
  } catch (err) {
    if (err.code === 'PERMISSION_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: 'PERMISSION_NOT_FOUND' });
    }
    next(err);
  }
}

// ── DELETE /api/rbac/roles/:id/permissions/:permId ───────────────────────────
async function removePermissionFromRole(req, res, next) {
  const roleId = parseInt(req.params.id, 10);
  if (isNaN(roleId)) {
    return res.status(400).json({ error: 'Role ID must be a valid integer.', code: 'INVALID_ID' });
  }

  const permissionKey = req.params.permId; // permId is actually the permission key string

  try {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return res.status(404).json({ error: 'Role not found.', code: 'ROLE_NOT_FOUND' });
    if (role.isSystem) {
      return res.status(400).json({
        error: 'System role permissions are managed by migration, not via API.',
        code: 'CANNOT_MODIFY_SYSTEM_ROLE',
      });
    }

    // Phase 3: Block non-admin from removing permissions on their own role (self-escalation via removal)
    const callerIsAdmin = rbacSvc.isRequestUserAdmin(req);
    if (!callerIsAdmin) {
      const isAssignedToCaller = await prisma.userRole.findUnique({
        where: { userId_roleId: { userId: req.user.id, roleId } },
      });
      if (isAssignedToCaller) {
        return res.status(403).json({
          error: 'You cannot modify permissions on a role assigned to your own account.',
          code: 'SELF_MODIFICATION_FORBIDDEN',
        });
      }
    }

    await rbacSvc.removePermissionFromRole(roleId, permissionKey, {
      actorId: req.user.id,
      ipAddress: req.ip,
    });
    return res.status(200).json({ message: 'Permission removed from role.' });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/rbac/users/:userId/roles ───────────────────────────────────────
async function assignRoleToUser(req, res, next) {
  const targetUserId = parseInt(req.params.userId, 10);
  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'User ID must be a valid integer.', code: 'INVALID_ID' });
  }

  // SEC: Users cannot modify their own roles
  if (targetUserId === req.user.id) {
    return res.status(403).json({
      error: 'You cannot assign roles to yourself.',
      code: 'SELF_MODIFICATION_FORBIDDEN',
    });
  }

  const { roleName } = req.body;
  if (!roleName) {
    return res.status(400).json({ error: 'roleName is required.', code: 'MISSING_FIELDS' });
  }

  try {
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    }

    // Phase 2: Role-assignment gates for non-Admin callers
    const callerIsAdmin = rbacSvc.isRequestUserAdmin(req);
    const normalizedRole = roleName.trim().toUpperCase();

    // Block non-Admin from assigning the ADMIN role
    if (normalizedRole === 'ADMIN' && !callerIsAdmin) {
      return res.status(403).json({
        error: 'Only system administrators can assign the ADMIN role.',
        code: 'ADMIN_ASSIGNMENT_FORBIDDEN',
      });
    }

    // Block non-Admin from assigning roles that contain admin-tier permissions
    if (!callerIsAdmin) {
      const targetRole = await prisma.role.findFirst({
        where: { name: { equals: normalizedRole, mode: 'insensitive' } },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (targetRole) {
        const hasAdminCap = targetRole.rolePermissions.some(rp =>
          RESTRICTED_ADMIN_PERMISSIONS.includes(rp.permission?.key)
        );
        if (hasAdminCap) {
          return res.status(403).json({
            error: 'Non-administrators cannot assign roles with administrative privileges.',
            code: 'ADMIN_ROLE_DELEGATION_FORBIDDEN',
          });
        }
      }
    }

    await rbacSvc.assignRoleToUser(targetUserId, roleName, {
      actorId: req.user.id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: `Role '${roleName}' assigned to user ${targetUserId}.` });
  } catch (err) {
    if (err.code === 'ROLE_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: 'ROLE_NOT_FOUND' });
    }
    next(err);
  }
}

// ── DELETE /api/rbac/users/:userId/roles/:roleId ─────────────────────────────
async function removeRoleFromUser(req, res, next) {
  const targetUserId = parseInt(req.params.userId, 10);
  const roleId       = parseInt(req.params.roleId,  10);

  if (isNaN(targetUserId) || isNaN(roleId)) {
    return res.status(400).json({ error: 'User ID and Role ID must be valid integers.', code: 'INVALID_ID' });
  }

  // SEC: Users cannot modify their own roles
  if (targetUserId === req.user.id) {
    return res.status(403).json({
      error: 'You cannot remove roles from yourself.',
      code: 'SELF_MODIFICATION_FORBIDDEN',
    });
  }

  try {
    // SEC: Protect last active ADMIN — ensure at least one other ADMIN user remains
    const roleBeingRemoved = await prisma.role.findUnique({ where: { id: roleId } });

    // Phase 2: Block non-Admin from removing the ADMIN role
    const callerIsAdmin = rbacSvc.isRequestUserAdmin(req);
    if (roleBeingRemoved?.name === 'ADMIN' && !callerIsAdmin) {
      return res.status(403).json({
        error: 'Only system administrators can remove the ADMIN role.',
        code: 'ADMIN_ROLE_REMOVAL_FORBIDDEN',
      });
    }

    if (roleBeingRemoved?.name === 'ADMIN') {
      const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
      if (adminRole) {
        const adminCount = await prisma.userRole.count({ where: { roleId: adminRole.id } });
        if (adminCount <= 1) {
          return res.status(403).json({
            error: 'Cannot remove the last ADMIN role assignment. At least one ADMIN must remain.',
            code: 'LAST_ADMIN_PROTECTED',
          });
        }
      }
    }

    await rbacSvc.removeRoleFromUser(targetUserId, roleId, {
      actorId: req.user.id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: 'Role removed from user.' });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/rbac/users/:userId/roles ────────────────────────────────────────
async function getUserRoles(req, res, next) {
  const targetUserId = parseInt(req.params.userId, 10);
  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'User ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const { roles, permissions } = await rbacSvc.resolveUserRolesAndPermissions(targetUserId);
    const userRoles = await prisma.userRole.findMany({
      where: { userId: targetUserId },
      include: { role: { select: { id: true, name: true, isSystem: true } } },
    });
    return res.status(200).json({
      userId: targetUserId,
      roles,
      roleObjects: userRoles.map(ur => ur.role),
      permissions,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRoles,
  createRole,
  deleteRole,
  listPermissions,
  addPermissionToRole,
  removePermissionFromRole,
  assignRoleToUser,
  removeRoleFromUser,
  getUserRoles,
};

