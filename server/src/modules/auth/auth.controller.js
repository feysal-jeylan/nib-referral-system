/**
 * src/modules/auth/auth.controller.js
 * ──────────────────────────────────────
 * HTTP layer for authentication endpoints.
 * Handles req/res, validation, and cookie management.
 * All crypto/DB work delegated to auth.service.js.
 */

'use strict';

const svc   = require('./auth.service');
const email = require('@/services/emailService');
const prisma = require('@/config/db');
const rbacSvc = require('../rbac/rbac.service');

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

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Account suspended. Please contact the administrator.',
        code:  'ACCOUNT_SUSPENDED',
      });
    }

    const { roles, permissions } = await rbacSvc.resolveUserRolesAndPermissions(user.id);
    const primaryRole = roles[0] || user.role;

    const token = svc.signToken({
      id:                   user.id,
      role:                 primaryRole,
      agent_id:             user.agent_id,
      must_change_password: user.must_change_password,
      token_version:        user.tokenVersion ?? 0,
    });

    res.cookie(svc.COOKIE_NAME, token, svc.COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Login successful.',
      user: {
        id:                   user.id,
        username:             user.username,
        role:                 primaryRole,
        roles,
        permissions,
        agent_id:             user.agent_id,
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

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Account suspended. Please contact the administrator.', code: 'ACCOUNT_SUSPENDED' });
    }

    const tokenVersion = decoded.token_version ?? 0;
    if (tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'Session invalidated. Please log in again.', code: 'SESSION_INVALIDATED' });
    }

    const { roles, permissions } = await rbacSvc.resolveUserRolesAndPermissions(user.id);
    const primaryRole = roles[0] || user.role;

    return res.status(200).json({
      id:                   user.id,
      username:             user.username,
      role:                 primaryRole,
      roles,
      permissions,
      agent_id:             user.agent_id,
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

    const updatedUser = await svc.updatePassword(user.id, newPassword);

    const { roles, permissions } = await rbacSvc.resolveUserRolesAndPermissions(user.id);
    const primaryRole = roles[0] || user.role;

    // Issue a fresh JWT with must_change_password = false
    const newToken = svc.signToken({
      id:                   user.id,
      role:                 primaryRole,
      agent_id:             user.agent_id,
      must_change_password: false,
      token_version:        updatedUser.tokenVersion ?? 0,
    });

    res.cookie(svc.COOKIE_NAME, newToken, svc.COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Password changed successfully.',
      user: {
        id:                   user.id,
        username:             user.username,
        role:                 primaryRole,
        roles,
        permissions,
        agent_id:             user.agent_id,
        must_change_password: false,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/change-password] Error:', err.message);
    next(err);
  }
}

// ── POST /api/auth/activate ───────────────────────────────────────────────────
async function activateAccount(req, res, next) {
  const { token, newPassword } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Activation token is required.', code: 'MISSING_TOKEN' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.', code: 'WEAK_PASSWORD' });
  }

  try {
    const user = await svc.findUserByActivationToken(token);
    if (!user) {
      return res.status(400).json({
        error: 'This activation link is invalid or has expired.',
        code:  'INVALID_OR_EXPIRED_TOKEN',
      });
    }

    const activatedUser = await svc.activateUser(user.id, newPassword);

    try {
      await rbacSvc.assignRoleToUser(user.id, 'AGENT');
    } catch (rbacErr) {
      console.warn('[activateAccount] Warning assigning AGENT role:', rbacErr.message);
    }

    const { roles, permissions } = await rbacSvc.resolveUserRolesAndPermissions(user.id);
    const primaryRole = roles[0] || 'AGENT';

    // Generate fresh JWT strictly reflecting the newly activated Agent identity
    const jwtToken = svc.signToken({
      id:                   user.id,
      role:                 primaryRole,
      agent_id:             user.agent_id,
      must_change_password: false,
      token_version:        activatedUser.tokenVersion ?? 0,
    });

    // Overwrite existing HttpOnly cookie in the browser
    res.cookie(svc.COOKIE_NAME, jwtToken, svc.COOKIE_OPTIONS);

    return res.status(200).json({
      message: 'Account activated',
      user: {
        id:                   user.id,
        username:             user.username,
        role:                 primaryRole,
        roles,
        permissions,
        agent_id:             user.agent_id,
        must_change_password: false,
      },
    });
  } catch (err) {
    console.error('[POST /api/auth/activate] Error:', err.message);
    next(err);
  }
}

// ── POST /api/auth/resend-activation ─────────────────────────────────────────
async function resendActivation(req, res, next) {
  const emailAddr = req.body.email?.trim()?.toLowerCase();
  if (!emailAddr) {
    return res.status(400).json({ error: 'Email is required.', code: 'MISSING_FIELDS' });
  }

  try {
    // refreshActivationToken looks up by username (which equals email for agents)
    const result = await svc.refreshActivationToken(emailAddr);

    if (result.error === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'No account found with this email.', code: 'USER_NOT_FOUND' });
    }
    if (result.error === 'ALREADY_ACTIVATED') {
      return res.status(409).json({
        error: 'This account is already activated. Please log in.',
        code:  'ALREADY_ACTIVATED',
      });
    }

    // Fetch agent name for the branded email
    const agent = result.agentId
      ? await prisma.agent.findUnique({ where: { id: result.agentId }, select: { name: true } })
      : null;
    const agentName = agent?.name ?? emailAddr;

    await email.sendActivationEmail(emailAddr, agentName, result.rawToken);
    return res.status(200).json({ message: 'A new activation link has been sent to your email.' });
  } catch (err) {
    console.error('[POST /api/auth/resend-activation] Error:', err.message);
    next(err);
  }
}

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
async function forgotPassword(req, res, next) {
  const emailInput = req.body.email?.trim()?.toLowerCase();

  if (!emailInput) {
    return res.status(400).json({ error: 'Email address is required.', code: 'MISSING_EMAIL' });
  }

  try {
    const user = await svc.findUserForPasswordReset(emailInput);

    if (user) {
      const rawToken = await svc.createPasswordResetToken(user.id);
      const targetEmail = user.email || user.agent?.email || (user.username.includes('@') ? user.username : null);
      const displayName = user.agent?.name || user.username;

      if (targetEmail) {
        // Send email safely (catches internally if SMTP unavailable)
        await email.sendPasswordResetEmail(targetEmail, displayName, rawToken);
      }
    } else {
      // Artificial delay to prevent timing analysis enumeration
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    // Always return identical generic message (anti-enumeration)
    return res.status(200).json({
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('[POST /api/auth/forgot-password] Error:', err.message);
    // Even on error, do not expose account or system state
    return res.status(200).json({
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  }
}

// ── POST /api/auth/reset-password ────────────────────────────────────────────
async function resetPassword(req, res, next) {
  const { token, newPassword } = req.body;

  if (!token) {
    return res.status(400).json({
      error: 'Invalid or expired reset link. Please request a new one.',
      code:  'MISSING_TOKEN',
    });
  }

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters long.',
      code:  'WEAK_PASSWORD',
    });
  }

  try {
    const result = await svc.resetPasswordWithToken(token, newPassword);

    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid or expired reset link. Please request a new one.',
        code:  'INVALID_OR_EXPIRED_TOKEN',
      });
    }

    // Asynchronously dispatch security notification email
    if (result.user.email) {
      email.sendPasswordResetSuccessEmail(result.user.email, result.user.displayName).catch(err => {
        console.warn('[POST /api/auth/reset-password] Confirmation email warning:', err.message);
      });
    }

    // Single-use token consumed, session tokenVersion incremented.
    // Do NOT automatically log the user in.
    return res.status(200).json({
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('[POST /api/auth/reset-password] Error:', err.message);
    next(err);
  }
}

module.exports = {
  login,
  me,
  logout,
  changePassword,
  activateAccount,
  resendActivation,
  forgotPassword,
  resetPassword,
};

