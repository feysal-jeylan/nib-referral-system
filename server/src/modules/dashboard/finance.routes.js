/**
 * src/modules/dashboard/finance.routes.js
 * ─────────────────────────────────────────────
 * Routes for finance payouts and reward system configuration.
 *
 * Authorization:
 *   - GET /finance              → view_finance
 *   - PATCH /finance/pay/:id    → manage_finance
 *   - GET /config               → view_settings
 *   - PUT /config               → manage_system
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizePermission, authorizeAnyPermission } = require('@/middleware/auth');
const ctrl = require('./finance.controller');

const router = express.Router();

// All finance routes require authentication
router.use(authenticateToken);

router.get('/finance',                authorizeAnyPermission(['view_finance', 'manage_finance']), ctrl.getFinance);
router.patch('/finance/pay/:agentId', authorizePermission('manage_finance'), ctrl.payAgent);
router.get('/config',                 authorizeAnyPermission(['view_settings', 'manage_system']), ctrl.getConfig);
router.put('/config',                 authorizePermission('manage_system'),  ctrl.updateConfig);

module.exports = router;
