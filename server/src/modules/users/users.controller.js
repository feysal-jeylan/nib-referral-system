/**
 * src/modules/users/users.controller.js
 * ─────────────────────────────────────────
 * HTTP layer for user management endpoints.
 * All writes are guarded by RBAC middleware before reaching this controller.
 */

'use strict';

const usersSvc = require('./users.service');

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

  try {
    const user = await usersSvc.createUser(
      { username: username.trim(), email: email?.trim() || null, password, roleName },
      { actorId: req.user.id, ipAddress: req.ip }
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

  try {
    const user = await usersSvc.updateUser(userId, { username, email });
    if (!user) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ user });
  } catch (err) {
    if (err.code === 'NO_FIELDS') {
      return res.status(400).json({ error: err.message, code: err.code });
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

  try {
    const user = await usersSvc.suspendUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ user, message: 'Account suspended.' });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/users/:id/activate ────────────────────────────────────────────
async function activateUser(req, res, next) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'User ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const user = await usersSvc.activateUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ user, message: 'Account reactivated.' });
  } catch (err) {
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

  try {
    const deleted = await usersSvc.deleteUser(userId);
    if (!deleted) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    return res.status(200).json({ message: 'User deleted successfully.' });
  } catch (err) {
    if (err.code === 'LAST_ADMIN') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, suspendUser, activateUser, deleteUser };

