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
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizeRole } = require('@/middleware/auth');
const ctrl = require('./agents.controller');

const router    = express.Router();
const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];

// PUBLIC — must be before /:id routes
router.post('/apply', ctrl.applyAsAgent);

// Authenticated
router.get('/',  authenticateToken, ctrl.listAgents);
router.post('/', ...adminOnly,      ctrl.createAgent);

// Parameterised — must be after literal paths
router.patch('/:id/approve',  ...adminOnly,      ctrl.approveAgent);
router.patch('/:id/reject',   ...adminOnly,      ctrl.rejectAgent);
router.patch('/:id/suspend',  ...adminOnly,      ctrl.suspendAgent);
router.patch('/:id/activate', ...adminOnly,      ctrl.activateAgent);
router.put('/:id',            ...adminOnly,      ctrl.updateAgent);
router.delete('/:id',         ...adminOnly,      ctrl.deleteAgent);
router.get('/:id/stats',      authenticateToken, ctrl.getAgentStats);

module.exports = router;

