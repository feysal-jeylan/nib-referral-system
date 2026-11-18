/**
 * src/modules/rbac/rbac.service.js
 * ─────────────────────────────────
 * Database-backed Role-Based Access Control (RBAC) service.
 * The database is the authoritative source of truth for all roles and permissions.
 */

'use strict';

const prisma = require('@/config/db');
const { PERMISSIONS, SYSTEM_ROLES, AGENT_DEFAULT_PERMISSIONS } = require('./rbac.catalog');
const { logAuditEvent } = require('@/services/auditService');

// ── Permission Inheritance Map ────────────────────────────────────────────────
// manage_X implies view_X. manage_system is a special case → view_settings.
// This is the SINGLE SOURCE OF TRUTH for permission expansion.
// The database stores ONLY explicitly assigned permissions.
const MANAGE_TO_VIEW_MAP = {
  'manage_agents':    'view_agents',
  'manage_campaigns': 'view_campaigns',
  'manage_referrals': 'view_referrals',
  'manage_logs':      'view_logs',
  'manage_finance':   'view_finance',
  'manage_users':     'view_users',
  'manage_roles':     'view_roles',
  'manage_system':    'view_settings', // Special mapping — NOT "view_system"
};

/**
 * Expands a list of assigned permissions into effective permissions.
 * manage_X implies view_X (see MANAGE_TO_VIEW_MAP for exact mappings).
 * The database is NOT modified — this is a runtime expansion only.
 *
 * @param {string[]} assignedPermissions - Raw permissions from the database
 * @returns {string[]} Effective permissions (assigned + implied)
 */
function calculateEffectivePermissions(assignedPermissions) {
  const effective = new Set(assignedPermissions);
  for (const perm of assignedPermissions) {
    const implied = MANAGE_TO_VIEW_MAP[perm];
    if (implied) {
      effective.add(implied);
    }
  }
  return Array.from(effective);
}

/**
 * Dynamically resolves current roles and effective permissions for a user from PostgreSQL.
 * Does NOT trust permissions in JWT claims.
 *
 * Returns:
 *   - roles: string[]              — role names
 *   - assignedPermissions: string[] — raw DB permissions (for Role Management matrix display)
 *   - permissions: string[]         — effective permissions (assigned + inherited, for auth checks)
 *   - user: object|null
 *
 * @param {number} userId
 * @returns {Promise<{ roles: string[], assignedPermissions: string[], permissions: string[], user: object|null }>}
 */
async function resolveUserRolesAndPermissions(userId) {
  if (!userId) {
    return { roles: [], assignedPermissions: [], permissions: [], user: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    include: {
      agent: true,
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return { roles: [], assignedPermissions: [], permissions: [], user: null };
  }

  const roleSet = new Set();
  const permissionSet = new Set();

  // Extract relational roles and permissions
  for (const ur of user.userRoles) {
    if (ur.role) {
      roleSet.add(ur.role.name);
      for (const rp of ur.role.rolePermissions) {
        if (rp.permission?.key) {
          permissionSet.add(rp.permission.key);
        }
      }
    }
  }

  // Backward compatibility fallback: ONLY if user has no userRoles assigned in user_roles table
  if (roleSet.size === 0 && user.role) {
    const legacyRole = user.role.toUpperCase();
    roleSet.add(legacyRole);
    if (legacyRole === SYSTEM_ROLES.ADMIN) {
      Object.values(PERMISSIONS).forEach(p => permissionSet.add(p));
    } else if (legacyRole === SYSTEM_ROLES.AGENT) {
      AGENT_DEFAULT_PERMISSIONS.forEach(p => permissionSet.add(p));
    }
  }

  const rawPermissions = Array.from(permissionSet);
  const effectivePermissions = calculateEffectivePermissions(rawPermissions);

  return {
    roles: Array.from(roleSet),
    assignedPermissions: rawPermissions,   // Raw DB perms (for Role Management matrix display)
    permissions: effectivePermissions,      // Effective perms (for frontend auth state & backend guards)
    user,
  };
}

/**
 * Checks if a user has a specific permission key directly from the database.
 * 
 * @param {number} userId
 * @param {string} permissionKey
 * @returns {Promise<boolean>}
 */
async function hasPermission(userId, permissionKey) {
  const { permissions } = await resolveUserRolesAndPermissions(userId);
  return permissions.includes(permissionKey);
}

/**
 * Assigns a role to a user.
 * 
 * @param {number} userId
 * @param {string|number} roleIdentifier - Role name (string) or ID (number)
 * @param {object} [context] - { actorId, ipAddress }
 */
async function assignRoleToUser(userId, roleIdentifier, context = {}) {
  let role;
  if (typeof roleIdentifier === 'number') {
    role = await prisma.role.findUnique({ where: { id: roleIdentifier } });
  } else {
    const raw = String(roleIdentifier).trim();
    role = await prisma.role.findUnique({ where: { name: raw.toUpperCase() } });
    if (!role) {
      role = await prisma.role.findFirst({
        where: { name: { equals: raw, mode: 'insensitive' } },
      });
    }
  }

  if (!role) {
    const err = new Error(`Role '${roleIdentifier}' does not exist.`);
    err.status = 404;
    err.code = 'ROLE_NOT_FOUND';
    throw err;
  }

  const assignment = await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: Number(userId),
        roleId: role.id,
      },
    },
    update: {},
    create: {
      userId: Number(userId),
      roleId: role.id,
    },
  });

  await logAuditEvent({
    userId: context.actorId || null,
    action: 'ROLE_ASSIGNED',
    entity: 'USER_ROLE',
    entityId: `${userId}:${role.id}`,
    details: { targetUserId: userId, roleId: role.id, roleName: role.name },
    ipAddress: context.ipAddress || null,
  });

  return assignment;
}

/**
 * Removes a role from a user.
 * 
 * @param {number} userId
 * @param {string|number} roleIdentifier
 * @param {object} [context]
 */
async function removeRoleFromUser(userId, roleIdentifier, context = {}) {
  let role;
  if (typeof roleIdentifier === 'number') {
    role = await prisma.role.findUnique({ where: { id: roleIdentifier } });
  } else {
    const raw = String(roleIdentifier).trim();
    role = await prisma.role.findUnique({ where: { name: raw.toUpperCase() } });
    if (!role) {
      role = await prisma.role.findFirst({
        where: { name: { equals: raw, mode: 'insensitive' } },
      });
    }
  }

  if (!role) {
    return { count: 0 };
  }

  const result = await prisma.userRole.deleteMany({
    where: {
      userId: Number(userId),
      roleId: role.id,
    },
  });

  await logAuditEvent({
    userId: context.actorId || null,
    action: 'ROLE_REVOKED',
    entity: 'USER_ROLE',
    entityId: `${userId}:${role.id}`,
    details: { targetUserId: userId, roleId: role.id, roleName: role.name },
    ipAddress: context.ipAddress || null,
  });

  return result;
}

/**
 * Retrieves all roles with their assigned permissions.
 */
async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { id: 'asc' },
    include: {
      rolePermissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  return roles.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    permissions: r.rolePermissions.map(rp => rp.permission?.key).filter(Boolean),
  }));
}

/**
 * Retrieves all permissions grouped by module.
 */
async function listPermissions() {
  return prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { key: 'asc' }],
  });
}

/**
 * Deletes a custom role. System roles (ADMIN, AGENT) cannot be deleted.
 */
async function deleteRole(roleIdentifier, context = {}) {
  const isNumeric = typeof roleIdentifier === 'number' || (typeof roleIdentifier === 'string' && /^\d+$/.test(roleIdentifier));
  const roleWhere = isNumeric
    ? { id: Number(roleIdentifier) }
    : { name: String(roleIdentifier).toUpperCase() };

  const role = await prisma.role.findUnique({ where: roleWhere });
  if (!role) {
    const err = new Error('Role not found.');
    err.status = 404;
    err.code = 'ROLE_NOT_FOUND';
    throw err;
  }

  if (role.isSystem) {
    const err = new Error(`System role '${role.name}' cannot be deleted.`);
    err.status = 400;
    err.code = 'CANNOT_DELETE_SYSTEM_ROLE';
    throw err;
  }

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.userRole.deleteMany({ where: { roleId: role.id } });
  await prisma.role.delete({ where: { id: role.id } });

  await logAuditEvent({
    userId: context.actorId || null,
    action: 'ROLE_DELETED',
    entity: 'ROLE',
    entityId: String(role.id),
    details: { roleName: role.name },
    ipAddress: context.ipAddress || null,
  });

  return { success: true };
}

/**
 * Creates a new role.
 */
async function createRole(name, description = null, isSystem = false, context = {}) {
  const roleName = String(name).trim().toUpperCase();
  const existing = await prisma.role.findUnique({ where: { name: roleName } });
  if (existing) {
    const err = new Error(`Role '${roleName}' already exists.`);
    err.status = 409;
    err.code = 'ROLE_ALREADY_EXISTS';
    throw err;
  }

  const role = await prisma.role.create({
    data: {
      name: roleName,
      description,
      isSystem: Boolean(isSystem),
    },
  });

  await logAuditEvent({
    userId: context.actorId || null,
    action: 'ROLE_CREATED',
    entity: 'ROLE',
    entityId: String(role.id),
    details: { roleName: role.name, description, isSystem },
    ipAddress: context.ipAddress || null,
  });

  return role;
}

/**
 * Assigns a permission to a role.
 */
async function addPermissionToRole(roleId, permissionIdentifier, context = {}) {
  const permWhere = typeof permissionIdentifier === 'number'
    ? { id: permissionIdentifier }
    : { key: String(permissionIdentifier) };

  const permission = await prisma.permission.findUnique({ where: permWhere });
  if (!permission) {
    const err = new Error(`Permission '${permissionIdentifier}' not found.`);
    err.status = 404;
    err.code = 'PERMISSION_NOT_FOUND';
    throw err;
  }

  const rolePermission = await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: Number(roleId),
        permissionId: permission.id,
      },
    },
    update: {},
    create: {
      roleId: Number(roleId),
      permissionId: permission.id,
    },
  });

  await logAuditEvent({
    userId: context.actorId || null,
    action: 'PERMISSION_ASSIGNED_TO_ROLE',
    entity: 'ROLE_PERMISSION',
    entityId: `${roleId}:${permission.id}`,
    details: { roleId, permissionKey: permission.key },
    ipAddress: context.ipAddress || null,
  });

  return rolePermission;
}

/**
 * Removes a permission from a role.
 */
async function removePermissionFromRole(roleId, permissionIdentifier, context = {}) {
  const permWhere = typeof permissionIdentifier === 'number'
    ? { id: permissionIdentifier }
    : { key: String(permissionIdentifier) };

  const permission = await prisma.permission.findUnique({ where: permWhere });
  if (!permission) {
    return { count: 0 };
  }

  const result = await prisma.rolePermission.deleteMany({
    where: {
      roleId: Number(roleId),
      permissionId: permission.id,
    },
  });

  await logAuditEvent({
    userId: context.actorId || null,
    action: 'PERMISSION_REVOKED_FROM_ROLE',
    entity: 'ROLE_PERMISSION',
    entityId: `${roleId}:${permission.id}`,
    details: { roleId, permissionKey: permission.key },
    ipAddress: context.ipAddress || null,
  });

  return result;
}

/**
 * Idempotently seeds initial catalog permissions and system roles.
 */
async function seedRbacCatalog() {
  // 1. Seed all catalog permissions
  const permEntries = [
    { key: PERMISSIONS.VIEW_DASHBOARD,   name: 'View Dashboard',          description: 'View dashboard overview and stats',     module: 'dashboard' },
    { key: PERMISSIONS.VIEW_AGENTS,      name: 'View Agents',             description: 'View agents list, profiles, and stats', module: 'agents' },
    { key: PERMISSIONS.MANAGE_AGENTS,    name: 'Manage Agents',           description: 'Create, approve, reject, edit agents',  module: 'agents' },
    { key: PERMISSIONS.VIEW_CAMPAIGNS,   name: 'View Campaigns',          description: 'View referral campaigns',               module: 'campaigns' },
    { key: PERMISSIONS.MANAGE_CAMPAIGNS, name: 'Manage Campaigns',        description: 'Create, update, activate campaigns',    module: 'campaigns' },
    { key: PERMISSIONS.VIEW_REFERRALS,   name: 'View Referrals',          description: 'View referrals and status',             module: 'referrals' },
    { key: PERMISSIONS.MANAGE_REFERRALS, name: 'Manage Referrals',        description: 'Update referral status and payouts',     module: 'referrals' },
    { key: PERMISSIONS.VIEW_LOGS,        name: 'View Integration Logs',   description: 'View Core Banking webhook logs',        module: 'integration' },
    { key: PERMISSIONS.MANAGE_LOGS,      name: 'Manage Integration Logs', description: 'Retry and delete integration logs',      module: 'integration' },
    { key: PERMISSIONS.VIEW_FINANCE,     name: 'View Finance',            description: 'View agent payouts and balances',       module: 'finance' },
    { key: PERMISSIONS.MANAGE_FINANCE,   name: 'Manage Finance',          description: 'Execute payouts and configure rules',   module: 'finance' },
    { key: PERMISSIONS.VIEW_USERS,       name: 'View Users',              description: 'View system user accounts',             module: 'users' },
    { key: PERMISSIONS.MANAGE_USERS,     name: 'Manage Users',            description: 'Manage system user accounts',           module: 'users' },
    { key: PERMISSIONS.VIEW_ROLES,       name: 'View Roles',              description: 'View roles and permissions',            module: 'roles' },
    { key: PERMISSIONS.MANAGE_ROLES,     name: 'Manage Roles',            description: 'Create roles and assign permissions',   module: 'roles' },
    { key: PERMISSIONS.VIEW_SETTINGS,    name: 'View Settings',           description: 'View system configuration',             module: 'settings' },
    { key: PERMISSIONS.MANAGE_SYSTEM,    name: 'Manage System',           description: 'Modify system-wide configuration',      module: 'settings' },
  ];

  for (const p of permEntries) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.description, module: p.module },
      create: p,
    });
  }

  // 2. Seed system roles
  const adminRole = await prisma.role.upsert({
    where: { name: SYSTEM_ROLES.ADMIN },
    update: { isSystem: true, description: 'Full system administrator with unrestricted access' },
    create: { name: SYSTEM_ROLES.ADMIN, isSystem: true, description: 'Full system administrator with unrestricted access' },
  });

  const agentRole = await prisma.role.upsert({
    where: { name: SYSTEM_ROLES.AGENT },
    update: { isSystem: true, description: 'External marketing agent with scoped access' },
    create: { name: SYSTEM_ROLES.AGENT, isSystem: true, description: 'External marketing agent with scoped access' },
  });

  // 3. Grant all permissions to ADMIN
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // 4. Grant scoped permissions to AGENT
  const agentPerms = allPermissions.filter(p => AGENT_DEFAULT_PERMISSIONS.includes(p.key));
  for (const perm of agentPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: agentRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: agentRole.id, permissionId: perm.id },
    });
  }

  return { success: true };
}

/**
 * Determines whether a user object represents a system administrator.
 *
 * Checks all three identity representations to handle legacy accounts,
 * relational-only accounts, and hybrid accounts:
 *   1. user.userRoles[]  — relational assignment (most common for new accounts)
 *   2. user.roles[]      — shaped array (may be string or { name } objects)
 *   3. user.role         — legacy string field (for accounts predating user_roles)
 *
 * Uses logical OR across ALL sources — never short-circuits early — so an account
 * that has ANY one of these set to ADMIN is correctly identified.
 *
 * IMPORTANT: isSystem:true applies to both ADMIN and AGENT. Do NOT use isSystem
 * as an admin indicator.
 *
 * @param {object|null} user - A user object from Prisma or the shaped service layer
 * @returns {boolean}
 */
function isUserAdmin(user) {
  if (!user) return false;

  // Check relational userRoles (Prisma include: { role: true })
  const byUserRoles =
    Array.isArray(user.userRoles) &&
    user.userRoles.some(ur => ur.role?.name === 'ADMIN');

  // Check shaped roles array (may contain strings or { name } objects)
  const byRoles =
    Array.isArray(user.roles) &&
    user.roles.some(r =>
      (typeof r === 'string' ? r : r?.name) === 'ADMIN'
    );

  // Check legacy role string field
  const byLegacyRole =
    typeof user.role === 'string' &&
    user.role.trim().toUpperCase() === 'ADMIN';

  return byUserRoles || byRoles || byLegacyRole;
}

/**
 * Determines whether the acting request user is a system administrator.
 * Uses req.userRoles (resolved fresh from DB by auth.js) as the authoritative source,
 * with req.user.role as a legacy fallback.
 *
 * @param {object} req - Express request with req.userRoles and req.user
 * @returns {boolean}
 */
function isRequestUserAdmin(req) {
  if (!req) return false;
  const byRoles = Array.isArray(req.userRoles) && req.userRoles.includes('ADMIN');
  const byLegacy = req.user?.role === 'ADMIN';
  return byRoles || byLegacy;
}

module.exports = {
  calculateEffectivePermissions,
  resolveUserRolesAndPermissions,
  hasPermission,
  assignRoleToUser,
  removeRoleFromUser,
  listRoles,
  listPermissions,
  createRole,
  deleteRole,
  addPermissionToRole,
  removePermissionFromRole,
  seedRbacCatalog,
  isUserAdmin,
  isRequestUserAdmin,
};
