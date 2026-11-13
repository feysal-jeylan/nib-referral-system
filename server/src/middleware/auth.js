/**
 * src/middleware/auth.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Global auth middleware — JWT authentication (HttpOnly cookie) + RBAC.
 * Moved from server/middleware/authMiddleware.js into src/middleware/ as part
 * of MVC refactor. Import path: '@/middleware/auth'.
 *
 * Exports:
 *   authenticateToken  — verifies JWT, attaches req.user
 *   authorizeRole(roles) — RBAC factory, must follow authenticateToken
 */

'use strict';

const jwt    = require('jsonwebtoken');
const prisma = require('@/config/db');

const COOKIE_NAME = 'token'; // must stay in sync with auth.service.js login

async function authenticateToken(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.',
      code:  'NO_TOKEN',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      error: 'Session expired or invalid. Please log in again.',
      code:  'INVALID_TOKEN',
    });
  }

  // ── Database Verification (SEC-P1-01: Prevent JWT Suspension Bypass) ────────
  try {
    const user = await prisma.user.findUnique({
      where:   { id: decoded.id },
      include: { agent: true },
    });

    if (!user) {
      return res.status(401).json({
        error: 'User not found. Please log in again.',
        code:  'USER_NOT_FOUND',
      });
    }

    if (user.role === 'AGENT' && user.agent?.status === 'SUSPENDED') {
      return res.status(403).json({
        error: 'Account suspended. Please contact the administrator.',
        code:  'ACCOUNT_SUSPENDED',
      });
    }

    req.user = decoded; // { id, role, agent_id }
    next();
  } catch (err) {
    console.error('[authenticateToken] Database error:', err.message);
    next(err);
  }
}

function authorizeRole(roles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.', code: 'NO_USER' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
        code:  'FORBIDDEN',
      });
    }
    next();
  };
}

module.exports = { authenticateToken, authorizeRole };

