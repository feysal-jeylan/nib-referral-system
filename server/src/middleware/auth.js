/**
 * src/middleware/auth.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Global auth middleware — JWT authentication (HttpOnly cookie) + Dynamic RBAC.
 *
 * Exports:
 *   authenticateToken          — verifies JWT identity, session validity, attaches req.user,
 *                                req.userRoles, and req.userPermissions (resolved from DB).
 *   authorizePermission(key)   — checks if the user has a specific permission.
 *   authorizeAnyPermission([]) — checks if the user has at least one of the specified permissions.
 *   authorizeAllPermissions([])— checks if the user has all specified permissions.
 *   authorizeRole(roles)       — RBAC backward compatibility factory.
 */

'use strict';

const jwt    = require('jsonwebtoken');
const prisma = require('@/config/db');
const { resolveUserRolesAndPermissions } = require('@/modules/rbac/rbac.service');

const COOKIE_NAME = 'token'; // must stay in sync with auth.service.js login

async function authenticateToken(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.',
      code:  'NO_TOKEN',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      error: 'Session expired or invalid. Please log in again.',
      code:  'INVALID_TOKEN',
    });
  }

  // ── Database Verification (SEC-P1-01: Prevent JWT Suspension Bypass) ────────
  try {
    const user = await prisma.user.findUnique({
      where:   { id: decoded.id },
      include: { agent: true },
    });

    if (!user) {
      return res.status(401).json({
        error: 'User not found. Please log in again.',
        code:  'USER_NOT_FOUND',
      });
    }

    if (user.status === 'SUSPENDED' || user.agent?.status === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Account suspended. Please contact the administrator.',
        code:  'ACCOUNT_SUSPENDED',
      });
    }

    // ── Session Invalidation (Token Version Check) ───────────────────────────
    const tokenVersion = decoded.token_version ?? 0;
    if (tokenVersion !== user.tokenVersion) {
      return res.status(401).json({
        error: 'Session has been invalidated due to a password reset. Please log in again.',
        code:  'SESSION_INVALIDATED',
      });
    }

    // ── Resolve dynamic relational roles & permissions from DB ───────────────
    // resolveUserRolesAndPermissions now returns effective permissions (manage_* → view_* expanded).
    const { roles, permissions } = await resolveUserRolesAndPermissions(user.id);

    // Attach to request
    req.user = {
      ...decoded,
      agent_id: user.agent_id,
      roles,
      permissions,
    };
    req.userRoles = roles;
    req.userPermissions = new Set(permissions);

    next();
  } catch (err) {
    console.error('[authenticateToken] Database error:', err.message);
    next(err);
  }
}

/**
 * Middleware: Deny by default. Requires user to have the specific permission.
 * 
 * @param {string} permissionKey
 */
function authorizePermission(permissionKey) {
  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.', code: 'NO_USER' });
    }

    try {
      const perms = req.userPermissions || new Set((await resolveUserRolesAndPermissions(req.user.id)).permissions);
      if (!perms.has(permissionKey)) {
        return res.status(403).json({
          error: 'Access denied: Insufficient permissions.',
          code:  'FORBIDDEN',
        });
      }
      next();
    } catch (err) {
      console.error('[authorizePermission] Evaluation error:', err.message);
      return res.status(403).json({ error: 'Access denied.', code: 'FORBIDDEN' });
    }
  };
}

/**
 * Middleware: Requires user to have at least ONE of the specified permissions.
 * 
 * @param {string[]} permissionKeys
 */
function authorizeAnyPermission(permissionKeys) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.', code: 'NO_USER' });
    }

    try {
      const perms = req.userPermissions || new Set((await resolveUserRolesAndPermissions(req.user.id)).permissions);
      const hasAny = keys.some(k => perms.has(k));
      if (!hasAny) {
        return res.status(403).json({
          error: 'Access denied: Insufficient permissions.',
          code:  'FORBIDDEN',
        });
      }
      next();
    } catch (err) {
      console.error('[authorizeAnyPermission] Evaluation error:', err.message);
      return res.status(403).json({ error: 'Access denied.', code: 'FORBIDDEN' });
    }
  };
}

/**
 * Middleware: Requires user to have ALL of the specified permissions.
 * 
 * @param {string[]} permissionKeys
 */
function authorizeAllPermissions(permissionKeys) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.', code: 'NO_USER' });
    }

    try {
      const perms = req.userPermissions || new Set((await resolveUserRolesAndPermissions(req.user.id)).permissions);
      const hasAll = keys.every(k => perms.has(k));
      if (!hasAll) {
        return res.status(403).json({
          error: 'Access denied: Insufficient permissions.',
          code:  'FORBIDDEN',
        });
      }
      next();
    } catch (err) {
      console.error('[authorizeAllPermissions] Evaluation error:', err.message);
      return res.status(403).json({ error: 'Access denied.', code: 'FORBIDDEN' });
    }
  };
}

/**
 * Backward compatibility: Authorize by role name.
 * Checks both req.userRoles and req.user.role.
 * 
 * @param {string|string[]} roles
 */
function authorizeRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.', code: 'NO_USER' });
    }
    const currentRoles = req.userRoles || (req.user.role ? [req.user.role] : []);
    const hasRole = allowedRoles.some(r => currentRoles.includes(r) || req.user.role === r);
    if (!hasRole) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
        code:  'FORBIDDEN',
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRole,
  authorizePermission,
  authorizeAnyPermission,
  authorizeAllPermissions,
};
