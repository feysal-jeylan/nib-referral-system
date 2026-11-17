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

const SALT_ROUNDS = 12;

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

  return getUserById(user.id);
}

/**
 * Update a user's username / email (non-sensitive fields).
 * @param {number} userId
 * @param {object} data   { username?, email? }
 */
async function updateUser(userId, { username, email }) {
  const data = {};
  if (username !== undefined) data.username = username;
  if (email    !== undefined) data.email    = email;

  if (Object.keys(data).length === 0) {
    const err = new Error('No fields to update.');
    err.code  = 'NO_FIELDS';
    throw err;
  }

  await prisma.user.update({ where: { id: userId }, data });
  return getUserById(userId);
}

/**
 * Suspend a user account at the User level (and sync linked agent if applicable).
 * Never creates dummy agent records.
 */
async function suspendUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { agent: true },
  });
  if (!user) return null;

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

  return getUserById(userId);
}

/**
 * Reactivate a suspended user account at the User level (and sync linked agent if applicable).
 */
async function activateUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { agent: true },
  });
  if (!user) return null;

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

  return getUserById(userId);
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  suspendUser,
  activateUser,
};
