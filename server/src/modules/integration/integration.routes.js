/**
 * src/modules/integration/integration.routes.js
 * ───────────────────────────────────────────────
 * URL mapping only — no business logic.
 *
 * API-key middleware guards ALL POST routes on this router.
 * GET /logs is protected by JWT + ADMIN role (not API key).
 *
 * Mount point (index.js): app.use('/api/integration', integrationRouter)
 */

'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken, authorizeRole } = require('@/middleware/auth');
const ctrl = require('./integration.controller');

const router  = express.Router();
const API_KEY = process.env.MOCK_TEMENOS_API_KEY;

// ── Rate Limiter: Max 1000 requests per 1 minute for webhooks (SEC-P0-02) ────
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many webhook requests from this IP, please try again after 1 minute.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

// ── Webhook API-key guard (for external Temenos webhook ingestion) ───────────
// SEC-P0-01: Removed database write (svc.logApiKeyFailure) to prevent
// pre-authentication idempotency cache poisoning on transaction_id.
function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  if (providedKey !== API_KEY) {
    const ip  = req.ip || req.connection?.remoteAddress;
    const tid = typeof req.body?.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim() : null;

    console.warn(
      `[integration] UNAUTHORIZED — invalid or missing x-api-key. ` +
      `IP: ${ip}, transaction_id: ${tid ?? 'N/A'}`
    );

    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }
  next();
}

const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];

// ── Routes ────────────────────────────────────────────────────────────────────
// Temenos webhook ingestion (rate-limited + protected by API key)
router.post('/account-opened', webhookLimiter, requireApiKey, ctrl.accountOpened);

// Admin audit log management (protected by JWT + ADMIN role)
router.get('/logs',            ...adminOnly, ctrl.getLogs);
router.post('/logs/:id/retry', ...adminOnly, ctrl.retryLog);
router.delete('/logs/:id',     ...adminOnly, ctrl.deleteLog);

module.exports = router;

