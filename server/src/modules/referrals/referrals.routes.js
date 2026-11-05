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

router.get('/',             authenticateToken,                            ctrl.listReferrals);
router.patch('/:id/status', authenticateToken, authorizeRole(['ADMIN']), ctrl.updateStatus);

module.exports = router;

