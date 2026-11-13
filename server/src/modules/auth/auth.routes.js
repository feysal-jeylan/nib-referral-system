/**
 * src/modules/auth/auth.routes.js
 * ─────────────────────────────────
 * URL mapping only — no business logic.
 * Mount point (index.js): app.use('/api/auth', authRouter)
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('@/middleware/auth');
const ctrl = require('./auth.controller');

const router = express.Router();

// ── Rate Limiter: Max 10 requests per 15 minutes for auth endpoints (SEC-P0-02)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

router.post('/login',              authLimiter, ctrl.login);
router.get('/me',                  ctrl.me);
router.post('/logout',             ctrl.logout);
router.post('/change-password',    authenticateToken, ctrl.changePassword);

// ── Pre-login flows (no auth required) ───────────────────────────────────────
router.post('/activate',           ctrl.activateAccount);
router.post('/resend-activation',  authLimiter, ctrl.resendActivation);

module.exports = router;

