/**
 * src/modules/users/users.service.js
 * ─────────────────────────────────────
 * Data layer for user management (listing, creating, updating, suspending).
 * Uses Prisma and bcrypt — never exposes raw password hashes.
 *
 * Suspension is backed by the linked Agent status ('SUSPENDED' vs 'APPROVED'),
 * matching the system authorization architecture (auth.js).
 */

'use strict';

const bcrypt   = require('bcrypt');
const prisma   = require('@/config/db');
const rbacSvc  = require('@/modules/rbac/rbac.service');
const { logAuditEvent } = require('@/services/auditService');

const SALT_ROUNDS = 12;

// ── Privileged-action helpers ─────────────────────────────────────────────────

/**
 * Fetches a user by ID and throws 404 if not found.
 * Includes userRoles for admin detection.
 */
async function fetchUserWithRoles(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      agent: true,
      userRoles: { include: { role: true } },
    },
  });
}

/**
 * Guards a privileged write against Admin targets.
 * - If the target user is an Admin, the acting user must also be an Admin.
 * @throws {Error} 403 ADMIN_ACTION_FORBIDDEN if caller is not Admin
 */
function guardAdminTarget(targetUser, actor = {}) {
  if (rbacSvc.isUserAdmin(targetUser) && !actor.actorIsAdmin) {
    const err = new Error('Only system administrators can perform this action on an Admin account.');
    err.status = 403;
    err.code = 'ADMIN_ACTION_FORBIDDEN';
    throw err;
  }
}

/**
 * List all users with their roles — paginated.
 * @param {object} opts  { page, limit, search }
 * @returns {{ users, meta }}
 */
async function listUsers({ page = 1, limit = 20, search = '' } = {}) {
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { email:    { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      select: {
        id:            true,
        username:      true,
        email:         true,
        role:          true,          // legacy field
        status:        true,
        created_at:    true,
        agent: {
          select: { id: true, status: true },
        },
        userRoles: {
          select: {
            role: {
              select: { id: true, name: true, isSystem: true },
            },
          },
        },
      },
    }),
  ]);

  // Flatten userRoles → roles[], derive is_suspended from user.status (or linked agent status)
  const shaped = users.map(u => ({
    id:           u.id,
    username:     u.username,
    email:        u.email,
    role:         u.role,
    status:       u.status,
    is_suspended: u.status === 'SUSPENDED' || (u.agent ? u.agent.status === 'SUSPENDED' : false),
    created_at:   u.created_at,
    roles:        u.userRoles.map(ur => ur.role),
  }));

  return {
    users: shaped,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single user by ID with their roles and derived suspension status.
 */
async function getUserById(userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id:           true,
      username:     true,
      email:        true,
      role:         true,
      status:       true,
      created_at:   true,
      agent: {
        select: { id: true, status: true },
      },
      userRoles: {
        select: {
          role: { select: { id: true, name: true, isSystem: true } },
        },
      },
    },
  });
  if (!u) return null;
  return {
    id:           u.id,
    username:     u.username,
    email:        u.email,
    role:         u.role,
    status:       u.status,
    is_suspended: u.status === 'SUSPENDED' || (u.agent ? u.agent.status === 'SUSPENDED' : false),
    created_at:   u.created_at,
    roles:        u.userRoles.map(ur => ur.role),
  };
}

/**
 * Create a new user and assign an initial role.
 * For AGENT users, links/creates an associated Agent record.
 * @param {object} data  { username, email, password, roleName? }
 * @param {object} actor { actorId, ipAddress }
 */
async function createUser({ username, email, password, roleName }, actor) {
  // Guard: username uniqueness
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: username, mode: 'insensitive' } },
        ...(email ? [{ email: { equals: email, mode: 'insensitive' } }] : []),
      ],
    },
  });
  if (existing) {
    const err = new Error('A user with this username or email already exists.');
    err.code  = 'USER_ALREADY_EXISTS';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Determine legacy role field and agent linkage from roleName
  const normalizedRole = roleName ? String(roleName).toUpperCase() : '';
  let legacyRole;
  let agentId = null;

  if (normalizedRole === 'ADMIN') {
    legacyRole = 'ADMIN';
    agentId = null;
  } else if (normalizedRole === 'AGENT') {
    legacyRole = 'AGENT';
    const randDigits = Math.floor(10000000 + Math.random() * 90000000);
    const agent = await prisma.agent.create({
      data: {
        name: username,
        email: email || `${username}@nibbank.et`,
        phone: `09${randDigits}`,
        status: 'APPROVED',
      },
    });
    agentId = agent.id;
  } else {
    // Custom non-agent roles (e.g. Auditor, Finance, Manager)
    legacyRole = 'STAFF';
    agentId = null;
  }

  const user = await prisma.user.create({
    data: {
      username,
      email:         email || null,
      password_hash: passwordHash,
      role:          legacyRole,
      agent_id:      agentId,
      must_change_password: false,
    },
    select: { id: true, username: true, email: true, role: true, created_at: true },
  });

  // Assign RBAC role if provided
  if (roleName) {
    await rbacSvc.assignRoleToUser(user.id, roleName, actor);
  }

  // Audit: user creation
  await logAuditEvent({
    userId: actor?.actorId || null,
    action: 'USER_CREATED',
    entity: 'USER',
    entityId: String(user.id),
    details: { username, email: email || null, roleName: roleName || null },
    ipAddress: actor?.ipAddress || null,
  });

  return getUserById(user.id);
}

/**
 * Update a user's username / email (non-sensitive fields).
 * @param {number} userId
 * @param {object} data   { username?, email? }
 * @param {object} actor  { actorId, actorIsAdmin, ipAddress }
 */
async function updateUser(userId, { username, email }, actor = {}) {
  const user = await fetchUserWithRoles(userId);
  if (!user) return null;

  // Guard: only Admins can modify Admin accounts
  guardAdminTarget(user, actor);

  const data = {};
  if (username !== undefined) data.username = username;
  if (email    !== undefined) data.email    = email;

  if (Object.keys(data).length === 0) {
    const err = new Error('No fields to update.');
    err.code  = 'NO_FIELDS';
    throw err;
  }

  await prisma.user.update({ where: { id: userId }, data });

  // Audit
  await logAuditEvent({
    userId: actor.actorId || null,
    action: 'USER_UPDATED',
    entity: 'USER',
    entityId: String(userId),
    details: { updatedFields: Object.keys(data) },
    ipAddress: actor.ipAddress || null,
  });

  return getUserById(userId);
}

/**
 * Suspend a user account at the User level (and sync linked agent if applicable).
 * Never creates dummy agent records.
 * @param {number} userId
 * @param {object} actor  { actorId, actorIsAdmin, ipAddress }
 */
async function suspendUser(userId, actor = {}) {
  const user = await fetchUserWithRoles(userId);
  if (!user) return null;

  // Guard: only Admins can suspend Admin accounts
  guardAdminTarget(user, actor);

  // Guard: cannot suspend the last active Admin
  if (rbacSvc.isUserAdmin(user)) {
    const activeAdminCount = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS cnt FROM users
      WHERE status = 'ACTIVE'
        AND (
          role = 'ADMIN'
          OR id IN (
            SELECT ur.user_id FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE r.name = 'ADMIN'
          )
        )
    `;
    if (activeAdminCount[0]?.cnt <= 1) {
      const err = new Error('Cannot suspend the last active administrator.');
      err.status = 400;
      err.code = 'LAST_ADMIN_PROTECTED';
      throw err;
    }
  }

  // 1. Update user.status = 'SUSPENDED'
  await prisma.user.update({
    where: { id: userId },
    data:  { status: 'SUSPENDED' },
  });

  // 2. If this user is an agent, synchronize the linked agent record
  if (user.agent_id) {
    await prisma.agent.update({
      where: { id: user.agent_id },
      data:  { status: 'SUSPENDED' },
    });
  }

  // Audit
  await logAuditEvent({
    userId: actor.actorId || null,
    action: 'USER_SUSPENDED',
    entity: 'USER',
    entityId: String(userId),
    details: { targetUsername: user.username },
    ipAddress: actor.ipAddress || null,
  });

  return getUserById(userId);
}

/**
 * Reactivate a suspended user account at the User level (and sync linked agent if applicable).
 * @param {number} userId
 * @param {object} actor  { actorId, actorIsAdmin, ipAddress }
 */
async function activateUser(userId, actor = {}) {
  const user = await fetchUserWithRoles(userId);
  if (!user) return null;

  // Guard: only Admins can activate Admin accounts
  guardAdminTarget(user, actor);

  // 1. Update user.status = 'ACTIVE'
  await prisma.user.update({
    where: { id: userId },
    data:  { status: 'ACTIVE' },
  });

  // 2. If this user is an agent, synchronize the linked agent record
  if (user.agent_id) {
    await prisma.agent.update({
      where: { id: user.agent_id },
      data:  { status: 'APPROVED' },
    });
  }

  // Audit
  await logAuditEvent({
    userId: actor.actorId || null,
    action: 'USER_ACTIVATED',
    entity: 'USER',
    entityId: String(userId),
    details: { targetUsername: user.username },
    ipAddress: actor.ipAddress || null,
  });

  return getUserById(userId);
}

/**
 * Delete a user account, ensuring they are not the last active administrator.
 * @param {number} userId
 * @param {object} actor  { actorId, actorIsAdmin, ipAddress }
 */
async function deleteUser(userId, actor = {}) {
  const user = await fetchUserWithRoles(userId);
  if (!user) return null;

  // Guard: only Admins can delete Admin accounts
  guardAdminTarget(user, actor);

  // Guard: cannot delete the last Admin
  if (rbacSvc.isUserAdmin(user)) {
    await prisma.$transaction(async (tx) => {
      // Lock all admin rows to prevent concurrent deletes racing past this check
      await tx.$queryRaw`
        SELECT id FROM users
        WHERE status = 'ACTIVE'
          AND (
            role = 'ADMIN'
            OR id IN (
              SELECT ur.user_id FROM user_roles ur
              JOIN roles r ON ur.role_id = r.id
              WHERE r.name = 'ADMIN'
            )
          )
        FOR UPDATE
      `;

      const result = await tx.$queryRaw`
        SELECT COUNT(*)::int AS cnt FROM users
        WHERE role = 'ADMIN'
           OR id IN (
             SELECT ur.user_id FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             WHERE r.name = 'ADMIN'
           )
      `;
      const adminCount = result[0]?.cnt ?? 0;
      if (adminCount <= 1) {
        const err = new Error('Cannot delete the last remaining administrator.');
        err.status = 400;
        err.code = 'LAST_ADMIN_PROTECTED';
        throw err;
      }

      // Remove linked userRoles within transaction
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  } else {
    // Non-admin delete — no lock needed
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }

  // Audit (outside transaction — auditService uses global prisma client)
  await logAuditEvent({
    userId: actor.actorId || null,
    action: 'USER_DELETED',
    entity: 'USER',
    entityId: String(userId),
    details: {
      deletedUsername: user.username,
      roles: user.userRoles.map(ur => ur.role?.name).filter(Boolean),
    },
    ipAddress: actor.ipAddress || null,
  });

  return true;
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  suspendUser,
  activateUser,
  deleteUser,
};
