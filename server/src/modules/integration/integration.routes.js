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
const { authenticateToken, authorizeRole } = require('@/middleware/auth');
const ctrl = require('./integration.controller');
const svc  = require('./integration.service');

const router  = express.Router();
const API_KEY = process.env.MOCK_TEMENOS_API_KEY;

// ── API-key guard (POST routes only) ─────────────────────────────────────────
router.use(async (req, res, next) => {
  if (req.method === 'GET') return next();

  const providedKey = req.headers['x-api-key'];
  if (providedKey !== API_KEY) {
    const ip  = req.ip || req.connection.remoteAddress;
    const tid = typeof req.body?.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim() : null;

    console.warn(
      `[integration] UNAUTHORIZED — invalid or missing x-api-key. ` +
      `IP: ${ip}, transaction_id: ${tid ?? 'N/A'}`
    );

    await svc.logApiKeyFailure(tid, ip);
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
router.post('/account-opened', ctrl.accountOpened);
router.get('/logs', authenticateToken, authorizeRole(['ADMIN']), ctrl.getLogs);

module.exports = router;

