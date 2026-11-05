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

module.exports = {
  COOKIE_NAME,
  COOKIE_OPTIONS,
  signToken,
  verifyToken,
  findUserByUsername,
  findUserById,
  updatePassword,
  comparePassword,
};
