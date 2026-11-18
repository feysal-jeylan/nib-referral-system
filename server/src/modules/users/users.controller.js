/**
 * src/modules/users/users.controller.js
 * ─────────────────────────────────────────
 * HTTP layer for user management endpoints.
 * All writes are guarded by RBAC middleware before reaching this controller.
 */

'use strict';

const prisma    = require('@/config/db');
const usersSvc  = require('./users.service');
const { isRequestUserAdmin } = require('@/modules/rbac/rbac.service');

// Restricted permissions that only Admins may grant through role assignment
const RESTRICTED_ADMIN_PERMISSIONS = ['manage_roles', 'manage_system'];

// ── GET /api/users ────────────────────────────────────────────────────────────
async function listUsers(req, res, next) {
  try {
    const page   = parseInt(req.query.page,  10) || 1;
    const limit  = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const search = req.query.search?.trim() || '';

    const result = await usersSvc.listUsers({ page, limit, search });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// ── POST /api/users ───────────────────────────────────────────────────────────
async function createUser(req, res, next) {
  const { username, email, password, roleName } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'username and password are required.',
      code:  'MISSING_FIELDS',
    });
  }
  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters.',
      code:  'PASSWORD_TOO_SHORT',
    });
  }

  const callerIsAdmin = isRequestUserAdmin(req);
  const trimmedRole   = roleName?.trim();

  // Phase 2: Role-assignment gates
  if (trimmedRole) {
    // Requires manage_roles to assign any role at user creation
    if (!req.userPermissions?.has('manage_roles')) {
      return res.status(403).json({
        error: 'Role assignment during user creation requires the Role Management permission.',
        code:  'ROLE_ASSIGNMENT_FORBIDDEN',
      });
    }
    // Block non-Admin from assigning the ADMIN role
    if (trimmedRole.toUpperCase() === 'ADMIN' && !callerIsAdmin) {
      return res.status(403).json({
        error: 'Only system administrators can assign the ADMIN role.',
        code:  'ADMIN_ASSIGNMENT_FORBIDDEN',
      });
    }
    // Block non-Admin from assigning roles that contain admin-tier permissions
    if (!callerIsAdmin) {
      try {
        const targetRole = await prisma.role.findFirst({
          where: { name: { equals: trimmedRole, mode: 'insensitive' } },
          include: { rolePermissions: { include: { permission: true } } },
        });
        if (targetRole) {
          const hasAdminCap = targetRole.rolePermissions.some(rp =>
            RESTRICTED_ADMIN_PERMISSIONS.includes(rp.permission?.key)
          );
          if (hasAdminCap) {
            return res.status(403).json({
              error: 'Non-administrators cannot assign roles with administrative privileges.',
              code:  'ADMIN_ROLE_DELEGATION_FORBIDDEN',
            });
          }
        }
      } catch (lookupErr) {
        return next(lookupErr);
      }
    }
  }

  try {
    const user = await usersSvc.createUser(
      { username: username.trim(), email: email?.trim() || null, password, roleName },
      { actorId: req.user.id, actorIsAdmin: callerIsAdmin, ipAddress: req.ip }
    );
    return res.status(201).json({ user });
  } catch (err) {
    if (err.code === 'USER_ALREADY_EXISTS') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────
async function updateUser(req, res, next) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'User ID must be a valid integer.', code: 'INVALID_ID' });
  }

  const { username, email } = req.body;
  const callerIsAdmin = isRequestUserAdmin(req);

  try {
    const user = await usersSvc.updateUser(
      userId,
      { username, email },
      { actorId: req.user.id, actorIsAdmin: callerIsAdmin, ipAddress: req.ip }
    );
    if (!user) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ user });
  } catch (err) {
    if (err.code === 'NO_FIELDS') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'ADMIN_ACTION_FORBIDDEN') {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

// ── PATCH /api/users/:id/suspend ──────────────────────────────────────────────
async function suspendUser(req, res, next) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'User ID must be a valid integer.', code: 'INVALID_ID' });
  }

  // SEC: Prevent self-suspension
  if (userId === req.user.id) {
    return res.status(403).json({
      error: 'You cannot suspend your own account.',
      code:  'SELF_MODIFICATION_FORBIDDEN',
    });
  }

  const callerIsAdmin = isRequestUserAdmin(req);

  try {
    const user = await usersSvc.suspendUser(userId, {
      actorId: req.user.id,
      actorIsAdmin: callerIsAdmin,
      ipAddress: req.ip,
    });
    if (!user) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ user, message: 'Account suspended.' });
  } catch (err) {
    if (err.code === 'ADMIN_ACTION_FORBIDDEN') {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    if (err.code === 'LAST_ADMIN_PROTECTED') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

// ── PATCH /api/users/:id/activate ────────────────────────────────────────────
async function activateUser(req, res, next) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'User ID must be a valid integer.', code: 'INVALID_ID' });
  }

  const callerIsAdmin = isRequestUserAdmin(req);

  try {
    const user = await usersSvc.activateUser(userId, {
      actorId: req.user.id,
      actorIsAdmin: callerIsAdmin,
      ipAddress: req.ip,
    });
    if (!user) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ user, message: 'Account reactivated.' });
  } catch (err) {
    if (err.code === 'ADMIN_ACTION_FORBIDDEN') {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
async function deleteUser(req, res, next) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'User ID must be a valid integer.', code: 'INVALID_ID' });
  }

  // Prevent self-deletion
  if (userId === req.user.id) {
    return res.status(403).json({
      error: 'You cannot delete your own account.',
      code:  'SELF_MODIFICATION_FORBIDDEN',
    });
  }

  const callerIsAdmin = isRequestUserAdmin(req);

  try {
    const deleted = await usersSvc.deleteUser(userId, {
      actorId: req.user.id,
      actorIsAdmin: callerIsAdmin,
      ipAddress: req.ip,
    });
    if (!deleted) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ message: 'User deleted successfully.' });
  } catch (err) {
    if (err.code === 'ADMIN_ACTION_FORBIDDEN') {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    if (err.code === 'LAST_ADMIN_PROTECTED' || err.code === 'LAST_ADMIN') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, suspendUser, activateUser, deleteUser };

