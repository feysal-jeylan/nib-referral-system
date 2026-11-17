/**
 * src/modules/rbac/rbac.catalog.js
 * ─────────────────────────────────
 * Central permission catalog and system role definitions for the NIB Referral System.
 */

'use strict';

const PERMISSIONS = Object.freeze({
  // Dashboard
  VIEW_DASHBOARD:   'view_dashboard',

  // Agents
  VIEW_AGENTS:      'view_agents',
  MANAGE_AGENTS:    'manage_agents',

  // Campaigns
  VIEW_CAMPAIGNS:   'view_campaigns',
  MANAGE_CAMPAIGNS: 'manage_campaigns',

  // Referrals
  VIEW_REFERRALS:   'view_referrals',
  MANAGE_REFERRALS: 'manage_referrals',

  // Integration & Audit
  VIEW_LOGS:        'view_logs',
  MANAGE_LOGS:      'manage_logs',

  // Finance
  VIEW_FINANCE:     'view_finance',
  MANAGE_FINANCE:   'manage_finance',

  // Users
  VIEW_USERS:       'view_users',
  MANAGE_USERS:     'manage_users',

  // Roles & Permissions
  VIEW_ROLES:       'view_roles',
  MANAGE_ROLES:     'manage_roles',

  // Settings & System
  VIEW_SETTINGS:    'view_settings',
  MANAGE_SYSTEM:    'manage_system',
});

const SYSTEM_ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',
});

const AGENT_DEFAULT_PERMISSIONS = Object.freeze([
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.VIEW_REFERRALS,
  PERMISSIONS.VIEW_CAMPAIGNS,
  PERMISSIONS.VIEW_AGENTS,
]);

module.exports = {
  PERMISSIONS,
  SYSTEM_ROLES,
  AGENT_DEFAULT_PERMISSIONS,
};
