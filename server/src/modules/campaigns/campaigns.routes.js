/**
 * src/modules/campaigns/campaigns.routes.js
 * ───────────────────────────────────────────
 * URL mapping ONLY — no business logic.
 * Maps HTTP method + path → auth guards → controller function.
 *
 * Mount point (index.js): app.use('/api/campaigns', campaignsRouter)
 *
 * Authorization:
 *   - GET /          → view_campaigns  (Agents can browse active campaigns)
 *   - GET /roots     → view_campaigns
 *   - GET /:id/stats → view_campaigns
 *   - POST /         → manage_campaigns
 *   - PUT /:id       → manage_campaigns
 *   - DELETE /:id    → manage_campaigns
 *   - PATCH activate → manage_campaigns
 *   - POST rules     → manage_campaigns
 *   - DELETE rules   → manage_campaigns
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizePermission } = require('@/middleware/auth');
const ctrl = require('./campaigns.controller');

const router = express.Router();

// All campaign routes require authentication
router.use(authenticateToken);

// Read-only — available to any user with view_campaigns (Agents included)
router.get('/roots',         authorizePermission('view_campaigns'), ctrl.listRootCampaigns);  // before /:id
router.get('/',              authorizePermission('view_campaigns'), ctrl.listCampaigns);
router.get('/:id/stats',     authorizePermission('view_campaigns'), ctrl.getCampaignStats);

// Mutation — manage_campaigns only
router.post('/',             authorizePermission('manage_campaigns'), ctrl.createCampaign);
router.put('/:id',           authorizePermission('manage_campaigns'), ctrl.updateCampaign);
router.delete('/:id',        authorizePermission('manage_campaigns'), ctrl.deleteCampaign);
router.patch('/:id/activate',authorizePermission('manage_campaigns'), ctrl.activateCampaign);

// Rules sub-resource
router.post('/:id/rules',              authorizePermission('manage_campaigns'), ctrl.addRule);
router.delete('/:id/rules/:ruleId',    authorizePermission('manage_campaigns'), ctrl.deleteRule);

module.exports = router;
