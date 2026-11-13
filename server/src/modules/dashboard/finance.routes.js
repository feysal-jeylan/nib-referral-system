/**
 * src/modules/dashboard/finance.routes.js
 * ─────────────────────────────────────────────
 * Routes for finance payouts and reward system configuration.
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizeRole } = require('@/middleware/auth');
const ctrl = require('./finance.controller');

const router = express.Router();
const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];

router.get('/finance', ...adminOnly, ctrl.getFinance);
router.get('/config',  ...adminOnly, ctrl.getConfig);

module.exports = router;
