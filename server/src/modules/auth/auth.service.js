/**
 * src/modules/auth/auth.service.js
 * ─────────────────────────────────
 * Data-access and crypto logic for authentication.
 * No HTTP req/res — only database queries, JWT signing, and bcrypt.
 */

'use strict';

const crypto  = require('crypto');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const prisma  = require('@/config/db');

// ── Cookie configuration (shared with controller) ────────────────────────────
const COOKIE_NAME = 'token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'Lax',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   8 * 60 * 60 * 1000, // 8 hours
  path:     '/',
};

// ── JWT helpers ───────────────────────────────────────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// ── Prisma queries ────────────────────────────────────────────────────────────
async function findUserByUsername(username) {
  return prisma.user.findUnique({
    where:  { username },
    select: {
      id: true, username: true, password_hash: true,
      role: true, agent_id: true, must_change_password: true,
    },
  });
}

async function findUserById(id) {
  return prisma.user.findUnique({
    where:  { id },
    select: {
      id: true, username: true, role: true,
      agent_id: true, must_change_password: true,
    },
  });
}

async function updatePassword(userId, newPassword) {
  const newHash = await bcrypt.hash(newPassword, 12);
  return prisma.user.update({
    where: { id: userId },
    data:  { password_hash: newHash, must_change_password: false },
  });
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ── Activation token helpers ──────────────────────────────────────────────────

/** SHA-256 hash of the raw token (what gets stored in DB). */
function hashActivationToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Find a user whose hashed activation token matches rawToken
 * and whose token has not yet expired.
 */
async function findUserByActivationToken(rawToken) {
  const hashed = hashActivationToken(rawToken);
  return prisma.user.findFirst({
    where: {
      activationToken:   hashed,
      activationExpires: { gt: new Date() },
      isActivated:       false,
    },
    select: {
      id: true, username: true, role: true,
      agent_id: true, activationExpires: true,
    },
  });
}

/**
 * Set the user's real password, mark as activated, clear the token.
 */
async function activateUser(userId, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  return prisma.user.update({
    where: { id: userId },
    data: {
      password_hash:        hash,
      must_change_password: false,
      isActivated:          true,
      activationToken:      null,
      activationExpires:    null,
    },
  });
}

/**
 * Stamp a fresh activation token onto an existing (not-yet-activated) user.
 * Returns the RAW token so the caller can email it.
 */
async function refreshActivationToken(username) {
  const rawToken    = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires     = new Date(Date.now() + 30 * 60 * 1000);

  const user = await prisma.user.findUnique({
    where:  { username },
    select: { id: true, isActivated: true, agent_id: true },
  });
  if (!user)             return { error: 'USER_NOT_FOUND' };
  if (user.isActivated)  return { error: 'ALREADY_ACTIVATED' };

  await prisma.user.update({
    where: { id: user.id },
    data:  { activationToken: hashedToken, activationExpires: expires },
  });

  return { rawToken, agentId: user.agent_id };
}

module.exports = {
  COOKIE_NAME,
  COOKIE_OPTIONS,
  signToken,
  verifyToken,
  findUserByUsername,
  findUserById,
  updatePassword,
  comparePassword,
  hashActivationToken,
  findUserByActivationToken,
  activateUser,
  refreshActivationToken,
};

