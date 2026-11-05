/**
 * src/modules/auth/auth.routes.js
 * ─────────────────────────────────
 * URL mapping only — no business logic.
 * Mount point (index.js): app.use('/api/auth', authRouter)
 */

'use strict';

const express = require('express');
const { authenticateToken } = require('@/middleware/auth');
const ctrl = require('./auth.controller');

const router = express.Router();

router.post('/login',           ctrl.login);
router.get('/me',               ctrl.me);
router.post('/logout',          ctrl.logout);
router.post('/change-password', authenticateToken, ctrl.changePassword);

module.exports = router;
