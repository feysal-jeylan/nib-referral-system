/**
 * src/modules/integration/integration.routes.js
 * ───────────────────────────────────────────────
 * URL mapping only — no business logic.
 *
 * API-key middleware guards ALL POST webhook routes on this router.
 * GET/POST/DELETE /logs are protected by JWT + permission guards.
 *
 * Mount point (index.js): app.use('/api/integration', integrationRouter)
 *
 * Authorization:
 *   - POST /account-opened   → API key only (external Temenos webhook)
 *   - GET /logs              → view_logs
 *   - POST /logs/:id/retry   → manage_logs
 *   - DELETE /logs/:id       → manage_logs
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken, authorizePermission, authorizeAnyPermission } = require('@/middleware/auth');
const ctrl = require('./integration.controller');

const router  = express.Router();

// ── Boot-time API key verification (SEC-VAPT-01) ──────────────────────────────
const API_KEY = process.env.MOCK_TEMENOS_API_KEY;
if (!API_KEY) {
  throw new Error('[FATAL] MOCK_TEMENOS_API_KEY environment variable is not defined.');
}

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
// SEC-VAPT-01: Timing-safe comparison & strict rejection of missing/undefined keys.
// SEC-P0-01: Removed database write (svc.logApiKeyFailure) to prevent
// pre-authentication idempotency cache poisoning on transaction_id.
function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];

  if (!providedKey || typeof providedKey !== 'string') {
    const ip  = req.ip || req.connection?.remoteAddress;
    const tid = typeof req.body?.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim() : null;

    console.warn(
      `[integration] UNAUTHORIZED — missing or invalid x-api-key header. ` +
      `IP: ${ip}, transaction_id: ${tid ?? 'N/A'}`
    );

    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  const providedBuf = Buffer.from(providedKey);
  const expectedBuf = Buffer.from(API_KEY);

  const isValid =
    providedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!isValid) {
    const ip  = req.ip || req.connection?.remoteAddress;
    const tid = typeof req.body?.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim() : null;

    console.warn(
      `[integration] UNAUTHORIZED — invalid x-api-key. ` +
      `IP: ${ip}, transaction_id: ${tid ?? 'N/A'}`
    );

    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────
// Temenos webhook ingestion (rate-limited + protected by API key — no JWT)
router.post('/account-opened', webhookLimiter, requireApiKey, ctrl.accountOpened);

// Admin audit log management (protected by JWT + permission)
router.get('/logs',             authenticateToken, authorizeAnyPermission(['view_logs', 'manage_logs']), ctrl.getLogs);
router.delete('/logs/bulk',      authenticateToken, authorizePermission('manage_logs'), ctrl.bulkDelete);
router.delete('/logs/clear-old', authenticateToken, authorizePermission('manage_logs'), ctrl.clearOld);
router.post('/logs/:id/retry',   authenticateToken, authorizePermission('manage_logs'), ctrl.retryLog);
router.delete('/logs/:id',       authenticateToken, authorizePermission('manage_logs'), ctrl.deleteLog);

module.exports = router;
