/**
 * src/modules/dashboard/dashboard.routes.js
 * ───────────────────────────────────────────
 * Mount point: app.use('/api/dashboard', dashboardRouter)
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizeRole } = require('@/middleware/auth');
const ctrl = require('./dashboard.controller');

const router    = express.Router();
const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];

router.get('/stats', ...adminOnly, ctrl.getStats);

module.exports = router;

