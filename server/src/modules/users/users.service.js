/**
 * src/modules/users/users.service.js
 * ─────────────────────────────────────
 * Data layer for user management (listing, creating, updating, suspending).
 * Uses Prisma and bcrypt — never exposes raw password hashes.
 *
 * Suspension is backed by the linked Agent status ('SUSPENDED' vs 'APPROVED'),
 * matching the system authorization architecture (auth.js).
 *
 * Changelog:
 *   - listUsers: added role and status filter support.
 *   - shapeUser: normalized legacy role display (non-mutating fallback).
 *   - deleteUser: enforced Admin-only permanent deletion policy.
 *   - deleteUser: added referral dependency safeguard for agent-linked users.
 *   - deleteUser: enriched audit log details.
 *   - suspendUser/activateUser: enriched audit log with targetUserId and previousStatus.
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
 * Shape a raw Prisma user record into the standard API response object.
 * Normalizes relational roles and falls back to the legacy `role` column value
 * WITHOUT fabricating a real role object — the fallback is flagged as `isLegacy: true`
 * so the frontend can render it as an informational badge without treating it as
 * a real RBAC Role record (no fake id, no DB mutation).
 *
 * @param {object} u - Raw Prisma user with userRoles and agent includes.
 * @returns {object} Shaped user record.
 */
function shapeUser(u) {
  // Prefer relational RBAC roles.  If none exist, fall back to the legacy column.
  const relationalRoles = u.userRoles.map(ur => ur.role);
  const displayRoles = relationalRoles.length > 0
    ? relationalRoles
    : u.role
      ? [{ id: null, name: u.role, isSystem: false, isLegacy: true }]
      : [];

  return {
    id:           u.id,
    username:     u.username,
    email:        u.email,
    role:         u.role,          // keep legacy field for backend compatibility
    status:       u.status,
    is_suspended: u.status === 'SUSPENDED' || (u.agent ? u.agent.status === 'SUSPENDED' : false),
    created_at:   u.created_at,
    agent_id:     u.agent?.id ?? null,   // expose for deletion safeguard awareness
    roles:        displayRoles,
  };
}

/**
 * List all users with their roles — paginated, searchable, filterable by role and status.
 * @param {object} opts  { page, limit, search, role, status }
 * @returns {{ users, meta }}
 */
async function listUsers({ page = 1, limit = 20, search = '', role = '', status = '' } = {}) {
  const skip = (page - 1) * limit;

  // Build where clause incrementally using AND conditions
  const andConditions = [];

  // Text search: username or email
  if (search) {
    andConditions.push({
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { email:    { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  // Status filter: matches User.status directly.
  // is_suspended is derived (includes agent.status) but we filter on User.status
  // since that is the authoritative column.  Frontend labels map 1:1:
  //   Active   → User.status = 'ACTIVE'
  //   Suspended → User.status = 'SUSPENDED'  (agent sync is done on write)
  if (status === 'ACTIVE') {
    andConditions.push({ status: 'ACTIVE' });
  } else if (status === 'SUSPENDED') {
    andConditions.push({ status: 'SUSPENDED' });
  }

  // Role filter: check relational user_roles first, then fall back to legacy column.
  if (role) {
    andConditions.push({
      OR: [
        {
          userRoles: {
            some: {
              role: { name: { equals: role, mode: 'insensitive' } },
            },
          },
        },
        {
          // Only match legacy column when the user has NO relational roles assigned
          AND: [
            { userRoles: { none: {} } },
            { role: { equals: role, mode: 'insensitive' } },
          ],
        },
      ],
    });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

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

  return {
    users: users.map(shapeUser),
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
  return shapeUser(u);
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
    // Use a transaction with a row-level lock so concurrent suspension requests
    // cannot both pass the count check and both succeed, leaving 0 active Admins.
    await prisma.$transaction(async (tx) => {
      // Lock all ACTIVE Admin rows first
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
      if ((result[0]?.cnt ?? 0) <= 1) {
        const err = new Error('Cannot suspend the last active administrator.');
        err.status = 400;
        err.code = 'LAST_ADMIN_PROTECTED';
        throw err;
      }
    });
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
    details: {
      targetUserId:   userId,
      targetUsername: user.username,
      previousStatus: user.status,
    },
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
    details: {
      targetUserId:   userId,
      targetUsername: user.username,
      previousStatus: user.status,
    },
    ipAddress: actor.ipAddress || null,
  });

  return getUserById(userId);
}

/**
 * Delete a user account permanently.
 *
 * Policy rules enforced here (service-layer security boundary):
 *   1. Only verified Admins may permanently delete any user.
 *   2. Only Admins can delete Admin accounts (guardAdminTarget).
 *   3. Cannot delete a user whose linked Agent has existing referrals — doing so
 *      would orphan active business records (applies to ALL users, including Admins).
 *   4. Cannot delete the last remaining ACTIVE Admin.
 *   5. Audit log captures the target identity BEFORE deletion so the record
 *      is not lost when the User row is removed (AuditLog.userId → SetNull).
 *
 * @param {number} userId
 * @param {object} actor  { actorId, actorIsAdmin, ipAddress }
 */
async function deleteUser(userId, actor = {}) {
  const user = await fetchUserWithRoles(userId);
  if (!user) return null;

  // ── Policy 1: Permanent deletion is an Admin-only operation ──────────────────
  if (!actor.actorIsAdmin) {
    const err = new Error(
      'Only system administrators are authorised to permanently delete user accounts. ' +
      'Delegated managers may suspend accounts instead.'
    );
    err.status = 403;
    err.code   = 'ADMIN_ONLY_OPERATION';
    throw err;
  }

  // ── Policy 2: Only Admins can touch Admin accounts ────────────────────────────
  guardAdminTarget(user, actor);

  // ── Policy 3: Block deletion if linked Agent has referral records ─────────────
  // This check applies to ALL users (including Admins) who have a linked Agent.
  // Previously this was inside the non-Admin branch only — that was a gap.
  if (user.agent_id) {
    const referralCount = await prisma.referral.count({
      where: { agent_id: user.agent_id },
    });
    if (referralCount > 0) {
      const err = new Error(
        `Cannot permanently delete this user: the linked Agent account has ${referralCount} ` +
        `existing referral record(s). Deleting the login account would orphan active business ` +
        `records. Please suspend the account instead.`
      );
      err.status = 409;
      err.code   = 'AGENT_HAS_REFERRALS';
      throw err;
    }
  }

  // ── Policy 4: Cannot delete the last ACTIVE Admin ─────────────────────────────
  if (rbacSvc.isUserAdmin(user)) {
    await prisma.$transaction(async (tx) => {
      // Row-level lock on ALL ACTIVE Admin rows.
      // Both the lock and the count query use the same ACTIVE filter to ensure
      // consistency: the system must retain at least one ACTIVE administrator,
      // not merely one admin row of any status.
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
      const activeAdminCount = result[0]?.cnt ?? 0;
      if (activeAdminCount <= 1) {
        const err = new Error('Cannot delete the last remaining active administrator.');
        err.status = 400;
        err.code = 'LAST_ADMIN_PROTECTED';
        throw err;
      }

      // Remove linked userRoles within transaction, then delete user
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  } else {
    // Non-Admin user — no lock needed (we already checked agent dependencies above)
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }

  // ── Policy 5: Audit AFTER deletion (AuditLog.userId becomes null via SetNull) ─
  // All identifying details are captured from the in-memory `user` object before
  // deletion so the audit record is complete even though the User row is gone.
  await logAuditEvent({
    userId: actor.actorId || null,
    action: 'USER_DELETED',
    entity: 'USER',
    entityId: String(userId),
    details: {
      deletedUserId:   userId,
      deletedUsername: user.username,
      deletedEmail:    user.email || null,
      hadLinkedAgent:  !!user.agent_id,
      agentId:         user.agent_id || null,
      roles:           user.userRoles.map(ur => ur.role?.name).filter(Boolean),
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
