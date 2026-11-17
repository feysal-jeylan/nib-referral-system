/**
 * src/modules/agents/agents.routes.js
 * ──────────────────────────────────────
 * URL mapping only — no business logic.
 *
 * ROUTE ORDER IS CRITICAL:
 *   POST /apply must be declared BEFORE /:id/* to prevent Express
 *   from treating "apply" as an :id parameter.
 *
 * Mount point (index.js): app.use('/api/agents', agentsRouter)
 *
 * Authorization:
 *   - GET /          → view_agents   (Agents see only their own record via service-layer filtering)
 *   - GET /:id/stats → view_agents   (Agents restricted to own stats in controller)
 *   - POST /         → manage_agents
 *   - PATCH /:id/*   → manage_agents
 *   - PUT /:id       → manage_agents
 *   - DELETE /:id    → manage_agents
 *   - POST /apply    → public (no auth)
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizePermission } = require('@/middleware/auth');
const ctrl = require('./agents.controller');

const router = express.Router();

// PUBLIC — must be before /:id routes
router.post('/apply', ctrl.applyAsAgent);

// Authenticated: view_agents required; service layer handles ownership scoping
router.get('/',  authenticateToken, authorizePermission('view_agents'), ctrl.listAgents);

// Management: manage_agents required
router.post('/',             authenticateToken, authorizePermission('manage_agents'), ctrl.createAgent);
router.patch('/:id/approve', authenticateToken, authorizePermission('manage_agents'), ctrl.approveAgent);
router.patch('/:id/reject',  authenticateToken, authorizePermission('manage_agents'), ctrl.rejectAgent);
router.patch('/:id/suspend', authenticateToken, authorizePermission('manage_agents'), ctrl.suspendAgent);
router.patch('/:id/activate',authenticateToken, authorizePermission('manage_agents'), ctrl.activateAgent);
router.put('/:id',           authenticateToken, authorizePermission('manage_agents'), ctrl.updateAgent);
router.delete('/:id',        authenticateToken, authorizePermission('manage_agents'), ctrl.deleteAgent);

// Stats: view_agents; controller enforces ownership for Agents
router.get('/:id/stats', authenticateToken, authorizePermission('view_agents'), ctrl.getAgentStats);

module.exports = router;
