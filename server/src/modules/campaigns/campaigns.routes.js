/**
 * src/modules/campaigns/campaigns.routes.js
 * ───────────────────────────────────────────
 * URL mapping ONLY — no business logic.
 * Maps HTTP method + path → auth guards → controller function.
 *
 * Mount point (index.js): app.use('/api/campaigns', campaignsRouter)
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizeRole } = require('@/middleware/auth');
const ctrl = require('./campaigns.controller');

const router    = express.Router();
const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];

// Campaign CRUD
router.post('/',             ...adminOnly, ctrl.createCampaign);
router.get('/',              ...adminOnly, ctrl.listCampaigns);
router.put('/:id',           ...adminOnly, ctrl.updateCampaign);
router.delete('/:id',        ...adminOnly, ctrl.deleteCampaign);
router.patch('/:id/activate',...adminOnly, ctrl.activateCampaign);

// Rules sub-resource
router.post('/:id/rules',              ...adminOnly, ctrl.addRule);
router.delete('/:id/rules/:ruleId',    ...adminOnly, ctrl.deleteRule);

// Stats
router.get('/:id/stats',   ...adminOnly, ctrl.getCampaignStats);

module.exports = router;

