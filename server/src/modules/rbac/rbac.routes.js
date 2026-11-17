/**
 * src/modules/rbac/rbac.routes.js
 * ─────────────────────────────────
 * URL mapping for Role-Based Access Control management endpoints.
 * Mount point (index.js): app.use('/api/rbac', rbacRouter)
 *
 * All routes require authentication + manage_roles or view_roles permission.
 * Privilege escalation protections are enforced in the controller.
 */

'use strict';

const express = require('express');
const { authenticateToken, authorizePermission } = require('@/middleware/auth');
const ctrl = require('./rbac.controller');

const router = express.Router();

// All RBAC routes require authentication at minimum
router.use(authenticateToken);

// ── Roles ─────────────────────────────────────────────────────────────────────
router.get('/roles',                   authorizePermission('view_roles'),   ctrl.listRoles);
router.post('/roles',                  authorizePermission('manage_roles'),  ctrl.createRole);
router.delete('/roles/:id',            authorizePermission('manage_roles'),  ctrl.deleteRole);

// ── Permissions ───────────────────────────────────────────────────────────────
router.get('/permissions',             authorizePermission('view_roles'),   ctrl.listPermissions);

// ── Role-Permission assignments ───────────────────────────────────────────────
router.post('/roles/:id/permissions',         authorizePermission('manage_roles'), ctrl.addPermissionToRole);
router.delete('/roles/:id/permissions/:permId', authorizePermission('manage_roles'), ctrl.removePermissionFromRole);

// ── User-Role assignments ─────────────────────────────────────────────────────
router.post('/users/:userId/roles',          authorizePermission('manage_roles'), ctrl.assignRoleToUser);
router.delete('/users/:userId/roles/:roleId', authorizePermission('manage_roles'), ctrl.removeRoleFromUser);
router.get('/users/:userId/roles',           authorizePermission('view_roles'),   ctrl.getUserRoles);

module.exports = router;

