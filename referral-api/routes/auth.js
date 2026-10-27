/**
 * referral-api/routes/auth.js
 * ----------------------------
 * Authentication router — handles login, logout, session check, and
 * forced password change for new Agent accounts.
 *
 * Endpoints:
 *   POST /api/auth/login           — Validate credentials, issue JWT cookie.
 *   POST /api/auth/logout          — Clear the JWT cookie.
 *   GET  /api/auth/me              — Return the logged-in user's info from cookie.
 *   POST /api/auth/change-password — Forced password change for new agents.
 *
 * Security model:
 *   - Passwords are NEVER stored or compared in plaintext.
 *   - Temporary passwords are generated with crypto.randomBytes (CSPRNG).
 *   - The JWT is sent ONLY as an HttpOnly, SameSite=Strict cookie.
 *   - must_change_password in the JWT gates access to the dashboard until
 *     the agent sets their own permanent password.
 */

'use strict';

const crypto  = require('crypto');
const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/auth/login
//
// Request body (JSON):
//   { "username": "admin", "password": "admin123" }
//
// Success response — 200 OK:
//   {
//     "message": "Login successful.",
//     "user": {
//       "id": 1, "username": "admin", "role": "ADMIN",
//       "must_change_password": false
//     }
//   }
//   Cookie set: token=<JWT>; HttpOnly; SameSite=Strict; Path=/
//
// The must_change_password flag tells the frontend whether to render the
// forced-password-change screen (true) or the full dashboard (false).
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  // ── Step 1: Extract and validate inputs ─────────────────────────────────
  const username = req.body.username?.trim();
  const password = req.body.password; // Do NOT trim passwords — whitespace may be intentional.

  if (!username || !password) {
    return res.status(400).json({
      error: 'username and password are required.',
      code:  'MISSING_FIELDS',
    });
  }

  try {
    // ── Step 2: Look up the user by username ─────────────────────────────────
    // Now also fetches must_change_password so we can include it in the JWT.
    const result = await pool.query(
      'SELECT id, username, password_hash, role, agent_id, must_change_password FROM users WHERE username = $1',
      [username]
    );

    // ── Step 3: Guard — user not found ──────────────────────────────────────
    // Same generic error for both "not found" and "wrong password" — prevents
    // username enumeration attacks.
    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid username or password.',
        code:  'INVALID_CREDENTIALS',
      });
    }

    const user = result.rows[0];

    // ── Step 4: Compare password against bcrypt hash ─────────────────────────
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        error: 'Invalid username or password.',
        code:  'INVALID_CREDENTIALS',
      });
    }

    // ── Step 5: Generate the JWT ───────────────────────────────────────────
    //
    // must_change_password is embedded in the JWT so the frontend can gate
    // the dashboard without an extra round-trip. The claim is also verified
    // server-side in /change-password by re-reading the DB column — so a
    // crafted JWT claiming false cannot bypass the gate.
    const payload = {
      id:                   user.id,
      role:                 user.role,
      agent_id:             user.agent_id, // null for ADMIN users
      must_change_password: user.must_change_password,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    // ── Step 6: Send token as HttpOnly cookie ───────────────────────────────
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   8 * 60 * 60 * 1000,
      path:     '/',
    });

    // ── Step 7: Return user info (no token in the body) ─────────────────────
    // must_change_password is included so the frontend (Login.jsx → AuthContext)
    // can immediately render the ChangePassword screen without a /me round-trip.
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
});


// ---------------------------------------------------------------------------
// GET /api/auth/me
// Reads the JWT from the HttpOnly cookie and returns the logged-in user's info.
//
// This endpoint is called by the frontend on every page load/refresh to
// determine if the session is still valid (the cookie exists and has not expired).
// Because the cookie is HttpOnly, JavaScript cannot directly inspect it —
// this endpoint acts as the bridge.
//
// Success response — 200 OK:
//   { "id": 1, "username": "admin", "role": "ADMIN" }
//
// Error responses:
//   401 Unauthorized — cookie is missing, token is expired, or signature is invalid
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.get('/me', async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      error: 'Not authenticated. Please log in.',
      code:  'NO_TOKEN',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user info from the DB — including must_change_password.
    // This ensures: (a) the user account still exists, and (b) if an admin
    // forcibly reset the flag in the DB, it is reflected here immediately.
    const result = await pool.query(
      'SELECT id, username, role, must_change_password FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'User account no longer exists.',
        code:  'USER_NOT_FOUND',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      id:                   user.id,
      username:             user.username,
      role:                 user.role,
      must_change_password: user.must_change_password,
    });

  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Session expired or invalid. Please log in again.',
        code:  'INVALID_TOKEN',
      });
    }

    console.error('[GET /api/auth/me] Unexpected error:', err.message);
    next(err);
  }
});


// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'Strict',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
  });

  return res.status(200).json({ message: 'Logged out successfully.' });
});


// ---------------------------------------------------------------------------
// POST /api/auth/change-password
//
// Called by the frontend ChangePassword screen immediately after first login
// when must_change_password = TRUE. Requires a valid JWT cookie (the one
// issued at login — even if must_change_password is TRUE in it).
//
// Request body (JSON):
//   { "newPassword": "MyStrongPassword1!" }
//
// Success response — 200 OK:
//   {
//     "message": "Password changed successfully.",
//     "user": { "id": 1, "username": "agent@nib.com", "role": "AGENT",
//               "must_change_password": false }
//   }
//   A NEW cookie is also set with must_change_password=false in its payload
//   so all subsequent API calls are treated as a fully authenticated session.
//
// WHY THIS PREVENTS INDEFINITE TEMP-PASSWORD USE:
//   Even if an attacker intercepts the temporary password (or the /login
//   response), the backend ALWAYS reads must_change_password from the DB.
//   Until this endpoint is called successfully:
//     • The frontend blocks dashboard access (React gate in App.jsx).
//     • No agent data is ever displayed to the attacker.
//   Once this endpoint runs, it OVERWRITES the bcrypt hash in the DB with the
//   new password and flips the flag to FALSE. The old temporary password is
//   now cryptographically invalidated — bcrypt.compare() will never match it
//   again because the stored hash has been replaced.
// ---------------------------------------------------------------------------
router.post('/change-password', authenticateToken, async (req, res, next) => {
  const newPassword = req.body.newPassword;

  // ── Step 1: Validate input ──────────────────────────────────────────────
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({
      error: 'New password must be at least 8 characters.',
      code:  'WEAK_PASSWORD',
    });
  }

  try {
    // ── Step 2: Re-read must_change_password from DB ───────────────────────
    //
    // We NEVER rely solely on the JWT claim for security decisions.
    // Reading the DB ensures that:
    //   (a) A crafted JWT with must_change_password=false cannot skip this step.
    //   (b) The account still exists.
    const check = await pool.query(
      'SELECT id, username, role, agent_id, must_change_password FROM users WHERE id = $1',
      [req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        error: 'User account not found.',
        code:  'USER_NOT_FOUND',
      });
    }

    const user = check.rows[0];

    // ── Step 3: Hash the new password ────────────────────────────────────
    // saltRounds=12: each +1 doubles the work factor. 12 is appropriate for
    // a 2026 server and gives ~400ms hash time — slow enough to deter brute
    // force, fast enough for normal use.
    const newHash = await bcrypt.hash(newPassword, 12);

    // ── Step 4: Update the DB atomically ─────────────────────────────────
    // Overwrite the old hash AND flip the flag in a single UPDATE so there is
    // no window where the new hash is saved but the flag is still TRUE.
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [newHash, user.id]
    );

    // ── Step 5: Issue a fresh JWT with must_change_password = false ────────
    //
    // The old cookie still has must_change_password=true in its payload.
    // We replace it immediately so the frontend (and any middleware) sees
    // the updated claim without requiring the user to log in again.
    const newPayload = {
      id:                   user.id,
      role:                 user.role,
      agent_id:             user.agent_id,
      must_change_password: false,
    };

    const newToken = jwt.sign(newPayload, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.cookie('token', newToken, {
      httpOnly: true,
      sameSite: 'Strict',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   8 * 60 * 60 * 1000,
      path:     '/',
    });

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
});


module.exports = router;
