/**
 * src/modules/users/users.routes.js
 * ─────────────────────────────────────
 * User Management endpoints — all protected by RBAC.
 *
 *   GET    /api/users              → view_users
 *   POST   /api/users              → manage_users
 *   PATCH  /api/users/:id          → manage_users
 *   PATCH  /api/users/:id/suspend  → manage_users
 *   PATCH  /api/users/:id/activate → manage_users
 */

'use strict';

const { Router } = require('express');
const { authenticateToken, authorizePermission, authorizeAnyPermission } = require('@/middleware/auth');
const ctrl = require('./users.controller');

const router = Router();

router.get(
  '/',
  authenticateToken,
  authorizeAnyPermission(['view_users', 'manage_users']),
  ctrl.listUsers
);

router.post(
  '/',
  authenticateToken,
  authorizePermission('manage_users'),
  ctrl.createUser
);

router.patch(
  '/:id',
  authenticateToken,
  authorizePermission('manage_users'),
  ctrl.updateUser
);

router.patch(
  '/:id/suspend',
  authenticateToken,
  authorizePermission('manage_users'),
  ctrl.suspendUser
);

router.patch(
  '/:id/activate',
  authenticateToken,
  authorizePermission('manage_users'),
  ctrl.activateUser
);

router.delete(
  '/:id',
  authenticateToken,
  authorizePermission('manage_users'),
  ctrl.deleteUser
);

module.exports = router;

