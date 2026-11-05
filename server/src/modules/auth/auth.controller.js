/**
 * src/modules/auth/auth.controller.js
 * ──────────────────────────────────────
 * HTTP layer for authentication endpoints.
 * Handles req/res, validation, and cookie management.
 * All crypto/DB work delegated to auth.service.js.
 */

'use strict';

const svc = require('./auth.service');

// ── POST /api/auth/login ──────────────────────────────────────────────────────
async function login(req, res, next) {
  const username = req.body.username?.trim();
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required.', code: 'MISSING_FIELDS' });
  }

  try {
    const user = await svc.findUserByUsername(username);

    // Generic error — prevents username enumeration
    if (!user || !(await svc.comparePassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' });
    }

    const token = svc.signToken({
      id:                   user.id,
      role:                 user.role,
      agent_id:             user.agent_id,
      must_change_password: user.must_change_password,
    });

    res.cookie(svc.COOKIE_NAME, token, svc.COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Login successful.',
      user: {
        id:                   user.id,
        username:             user.username,
        role:                 user.role,
        must_change_password: user.must_change_password,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/login] Error:', err.message);
    next(err);
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
async function me(req, res, next) {
  const token = req.cookies?.[svc.COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.', code: 'NO_TOKEN' });
  }

  try {
    const decoded = svc.verifyToken(token);
    const user = await svc.findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.', code: 'USER_NOT_FOUND' });
    }

    return res.status(200).json({
      id:                   user.id,
      username:             user.username,
      role:                 user.role,
      must_change_password: user.must_change_password,
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.', code: 'INVALID_TOKEN' });
    }
    console.error('[GET /api/auth/me] Unexpected error:', err.message);
    next(err);
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
function logout(req, res) {
  res.clearCookie(svc.COOKIE_NAME, svc.COOKIE_OPTIONS);
  return res.status(200).json({ message: 'Logged out successfully.' });
}

// ── POST /api/auth/change-password ───────────────────────────────────────────
async function changePassword(req, res, next) {
  const newPassword = req.body.newPassword;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.', code: 'WEAK_PASSWORD' });
  }

  try {
    // Always re-read from DB — never trust the JWT claim alone for security decisions.
    const user = await svc.findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User account not found.', code: 'USER_NOT_FOUND' });
    }

    await svc.updatePassword(user.id, newPassword);

    // Issue a fresh JWT with must_change_password = false
    const newToken = svc.signToken({
      id:                   user.id,
      role:                 user.role,
      agent_id:             user.agent_id,
      must_change_password: false,
    });

    res.cookie(svc.COOKIE_NAME, newToken, svc.COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Password changed successfully.',
      user: {
        id:                   user.id,
        username:             user.username,
        role:                 user.role,
        must_change_password: false,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/change-password] Error:', err.message);
    next(err);
  }
}

module.exports = { login, me, logout, changePassword };

