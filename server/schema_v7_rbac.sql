-- ============================================================================
-- schema_v7_rbac.sql
-- NIB Referral Management System — Relational RBAC Database Migration
-- ============================================================================

-- 1. Create Roles Table
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

-- 2. Create Permissions Table
CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(100) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  module      VARCHAR(50) NOT NULL,
  created_at  TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

-- 3. Create UserRole Join Table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- 4. Create RolePermission Join Table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- 5. Create AuditLog Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(50) NOT NULL,
  entity_id  VARCHAR(100),
  details    JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

-- Indexes for optimal lookup performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- Seed Initial Permissions Catalog (Idempotent)
-- ============================================================================
INSERT INTO permissions (key, name, description, module) VALUES
  -- Dashboard
  ('view_dashboard',    'View Dashboard',           'View dashboard statistics and overview metrics',    'dashboard'),
  
  -- Agents
  ('view_agents',       'View Agents',              'View agents list, profiles, and performance stats', 'agents'),
  ('manage_agents',     'Manage Agents',            'Create, approve, reject, suspend, and edit agents', 'agents'),

  -- Campaigns
  ('view_campaigns',    'View Campaigns',           'View referral campaigns and reward rules',          'campaigns'),
  ('manage_campaigns',  'Manage Campaigns',         'Create, update, activate, and delete campaigns',   'campaigns'),

  -- Referrals
  ('view_referrals',    'View Referrals',           'View customer referrals and status information',    'referrals'),
  ('manage_referrals',  'Manage Referrals',         'Update referral validation status and payouts',     'referrals'),

  -- Integration & Audit
  ('view_logs',         'View Integration Logs',    'View Core Banking webhook transactions & logs',     'integration'),
  ('manage_logs',       'Manage Integration Logs',  'Retry and manage integration webhook events',       'integration'),

  -- Finance
  ('view_finance',      'View Finance',             'View agent payout balances and reward tiers',       'finance'),
  ('manage_finance',    'Manage Finance',           'Execute agent payouts and configure reward rules',  'finance'),

  -- Users
  ('view_users',        'View Users',               'View system user accounts',                         'users'),
  ('manage_users',      'Manage Users',             'Create, edit, and deactivate system user accounts', 'users'),

  -- Roles & Permissions
  ('view_roles',        'View Roles',               'View role definitions and permission assignments',  'roles'),
  ('manage_roles',      'Manage Roles',             'Create, update roles and assign permissions',       'roles'),

  -- Settings & System
  ('view_settings',     'View Settings',            'View system configuration and operational health',  'settings'),
  ('manage_system',     'Manage System',            'Modify system-wide configurations and parameters',  'settings')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module;

-- ============================================================================
-- Seed System Roles (Idempotent)
-- ============================================================================
INSERT INTO roles (name, description, is_system) VALUES
  ('ADMIN', 'Full system administrator with unrestricted access', TRUE),
  ('AGENT', 'External marketing agent with scoped access to own referrals and profile', TRUE)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system;

-- ============================================================================
-- Assign Permissions to System Roles (Idempotent)
-- ============================================================================

-- 1. ADMIN receives ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2. AGENT receives read-only scoped permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN (
  'view_dashboard',
  'view_referrals',
  'view_campaigns',
  'view_agents'
)
WHERE r.name = 'AGENT'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- Migrate Existing Users to Relational RBAC (Idempotent)
-- ============================================================================
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON UPPER(u.role) = r.name
ON CONFLICT (user_id, role_id) DO NOTHING;
