/**
 * src/modules/referrals/referrals.routes.js
 * ───────────────────────────────────────────
 * URL mapping only — no business logic.
 * Mount point (index.js): app.use('/api/referrals', referralsRouter)
 *
 * Authorization:
 *   - GET /             → view_referrals (service layer enforces ownership for Agents)
 *   - PATCH /:id/status → manage_referrals
 *   - DELETE /:id       → manage_referrals
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizePermission } = require('@/middleware/auth');
const ctrl = require('./referrals.controller');

const router = express.Router();

// All referral routes require authentication
router.use(authenticateToken);

// List: view_referrals — Agent ownership enforced inside referrals.service.js
router.get('/',             authorizePermission('view_referrals'), ctrl.listReferrals);

// Management: manage_referrals only
router.patch('/:id/status', authorizePermission('manage_referrals'), ctrl.updateStatus);
router.delete('/:id',       authorizePermission('manage_referrals'), ctrl.deleteReferral);

module.exports = router;
