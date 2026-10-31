/**
 * referral-api/middleware/authMiddleware.js
 * ------------------------------------------
 * Reusable Express middleware for JWT authentication and role-based
 * access control (RBAC).
 *
 * Exports two middleware factory functions:
 *
 *   authenticateToken  — Reads the HttpOnly cookie, verifies the JWT,
 *                        and attaches the decoded payload to req.user.
 *                        Apply to any route that requires a logged-in user.
 *
 *   authorizeRole(roles) — Checks req.user.role against an allowed list.
 *                        Must be called AFTER authenticateToken.
 *                        Apply to routes that need a specific role.
 *
 * Usage in a router file:
 *   const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
 *
 *   // Only logged-in users:
 *   router.get('/data', authenticateToken, handler);
 *
 *   // Only ADMINs:
 *   router.post('/data', authenticateToken, authorizeRole(['ADMIN']), handler);
 *
 * Cookie name:
 *   The JWT cookie is named 'token' — this MUST match the name used in
 *   routes/auth.js (res.cookie('token', ...) in /login and /change-password).
 *   If the names diverge the middleware reads undefined and returns 401 on
 *   every request, even after a successful login.
 */

'use strict';

const jwt = require('jsonwebtoken');

// The cookie name must stay in sync with routes/auth.js COOKIE_NAME = 'token'.
// Defined as a constant here so a future rename is a one-line change in each file.
const COOKIE_NAME = 'token';

// ---------------------------------------------------------------------------
// authenticateToken
//
// How it works:
//   1. Reads req.cookies[COOKIE_NAME] (populated by cookie-parser in index.js).
//      Because the cookie is HttpOnly, it was never readable by client JS —
//      only the browser attaches it automatically to requests.
//   2. Calls jwt.verify() which:
//        a. Decodes the base64 header + payload.
//        b. Recomputes the HMAC-SHA256 signature with JWT_SECRET.
//        c. Compares it to the token's signature — rejects if tampered.
//        d. Checks the 'exp' (expiry) claim — rejects if expired.
//   3. On success, attaches the decoded payload ({ id, role, agent_id })
//      to req.user so downstream handlers can use it without re-verifying.
//   4. On failure, returns 401 immediately — the route handler never runs.
// ---------------------------------------------------------------------------
function authenticateToken(req, res, next) {
  // Read the JWT from the HttpOnly cookie, NOT from the Authorization header.
  // This is the HttpOnly cookie approach: the client cannot access this value
  // via JavaScript at all — the browser sends it transparently on each request.
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.',
      code:  'NO_TOKEN',
    });
  }

  try {
    // jwt.verify() throws on any validation failure.
    // We do not catch JsonWebTokenError separately here — we let the catch
    // block handle all token-level failures with a single 401.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the verified payload to the request object.
    // Downstream middleware and route handlers can safely read:
    //   req.user.id       — integer user ID
    //   req.user.role     — 'ADMIN' or 'AGENT'
    //   req.user.agent_id — integer agent FK (null for ADMIN)
    req.user = decoded;

    // Pass control to the next middleware or route handler.
    next();

  } catch (err) {
    // TokenExpiredError  — the 'exp' timestamp has passed
    // JsonWebTokenError  — invalid signature or malformed token
    // Both are legitimate 401 Unauthorized scenarios, NOT 500 errors.
    return res.status(401).json({
      error: 'Session expired or invalid. Please log in again.',
      code:  'INVALID_TOKEN',
    });
  }
}


// ---------------------------------------------------------------------------
// authorizeRole(roles)
//
// A middleware FACTORY — it returns a middleware function configured with
// the allowed roles array. This pattern lets us write:
//
//   router.post('/', authenticateToken, authorizeRole(['ADMIN']), handler);
//
// and reuse the same factory for different role requirements on different routes.
//
// Must be placed AFTER authenticateToken in the middleware chain, because it
// relies on req.user.role being set by authenticateToken.
//
// @param {string[]} roles — Array of allowed role strings, e.g. ['ADMIN'] or
//                           ['ADMIN', 'AGENT']. Case-sensitive.
// @returns {Function} Express middleware
// ---------------------------------------------------------------------------
function authorizeRole(roles) {
  return function (req, res, next) {
    // Safety check: if authenticateToken was accidentally skipped, req.user
    // won't exist. Return 401 rather than crashing with a TypeError.
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
        code:  'NO_USER',
      });
    }

    // Check if the authenticated user's role is in the allowed list.
    if (!roles.includes(req.user.role)) {
      // 403 Forbidden — the user IS authenticated, but does NOT have
      // permission. Contrast with 401 (not authenticated at all).
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
        code:  'FORBIDDEN',
      });
    }

    // Role is permitted — pass control to the next handler.
    next();
  };
}


module.exports = { authenticateToken, authorizeRole };
