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

/**
 * Dynamically resolves current roles and effective permissions for a user from PostgreSQL.
 * Does NOT trust permissions in JWT claims.
 * 
 * @param {number} userId
 * @returns {Promise<{ roles: string[], permissions: string[], user: object|null }>}
 */
async function resolveUserRolesAndPermissions(userId) {
  if (!userId) {
    return { roles: [], permissions: [], user: null };
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
    return { roles: [], permissions: [], user: null };
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

  return {
    roles: Array.from(roleSet),
    permissions: Array.from(permissionSet),
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

module.exports = {
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
};
