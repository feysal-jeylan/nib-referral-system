/**
 * src/modules/dashboard/dashboard.routes.js
 * ───────────────────────────────────────────
 * Mount point: app.use('/api/dashboard', dashboardRouter)
 *
 * Authorization:
 *   - GET /stats → view_dashboard
 *
 * Query params:
 *   - range: '7d' | '30d' | 'month' (default: '7d')
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizePermission } = require('@/middleware/auth');
const ctrl = require('./dashboard.controller');

const router = express.Router();

router.get('/stats', authenticateToken, authorizePermission('view_dashboard'), ctrl.getStats);

module.exports = router;
