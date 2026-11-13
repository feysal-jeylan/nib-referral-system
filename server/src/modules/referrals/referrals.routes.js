/**
 * src/modules/referrals/referrals.routes.js
 * ───────────────────────────────────────────
 * URL mapping only — no business logic.
 * Mount point (index.js): app.use('/api/referrals', referralsRouter)
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizeRole } = require('@/middleware/auth');
const ctrl = require('./referrals.controller');

const router = express.Router();
const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];

router.get('/',             authenticateToken, ctrl.listReferrals);
router.patch('/:id/status', ...adminOnly,      ctrl.updateStatus);
router.delete('/:id',       ...adminOnly,      ctrl.deleteReferral);

module.exports = router;
