-- =============================================================================
-- NIB Referral Management System — Clean Demo Data Reset Script
-- =============================================================================
-- Description:
--   Completely resets demo operational data (referrals, agents, integration logs,
--   and campaigns) while PRESERVING user credentials and RBAC roles/permissions.
-- =============================================================================

BEGIN;

-- 1. Disassociate any users currently pointing to agents before deleting agents
UPDATE users SET agent_id = NULL;

-- 2. Delete operational and demo tables in safe foreign-key order
DELETE FROM referrals;
DELETE FROM campaign_rules;
DELETE FROM campaigns;
DELETE FROM agents;
DELETE FROM integration_logs;

-- 3. Reset primary key identity sequences
ALTER SEQUENCE referrals_id_seq RESTART WITH 1;
ALTER SEQUENCE campaign_rules_id_seq RESTART WITH 1;
ALTER SEQUENCE campaigns_id_seq RESTART WITH 1;
ALTER SEQUENCE agents_id_seq RESTART WITH 1;
ALTER SEQUENCE integration_logs_id_seq RESTART WITH 1;

-- =============================================================================
-- 4. INSERT EXACTLY 3 CLEAN AGENTS
-- =============================================================================
INSERT INTO agents (id, name, phone, email, referral_code, status, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'Abebe Kebede',   '+251911112233', 'abebe.kebede@nibbank.et',   'NIB-ABEBE1', 'APPROVED', NOW() - INTERVAL '30 days'),
  (2, 'Sara Bekele',    '+251922334455', 'sara.bekele@nibbank.et',    'NIB-SARA22', 'APPROVED', NOW() - INTERVAL '25 days'),
  (3, 'Dawit Tadesse',  '+251933445566', 'dawit.tadesse@nibbank.et',  'NIB-DAWIT3', 'APPROVED', NOW() - INTERVAL '20 days');

SELECT setval('agents_id_seq', (SELECT MAX(id) FROM agents));

-- =============================================================================
-- 5. INSERT EXACTLY 2 CLEAN CAMPAIGNS & COMPOSITE RULE
-- =============================================================================
INSERT INTO campaigns (id, name, campaign_code, start_date, end_date, reward_type, reward_value, status, description, is_active, created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'October Savings', 'OCT-2026', '2026-10-01 00:00:00', '2026-11-30 23:59:59', 'FIXED', '500', 'ACTIVE', 'October high-yield savings drive with composite qualification rules.', true, NOW() - INTERVAL '45 days'),
  (2, 'New Account',     'NEW-2026', '2026-11-01 00:00:00', '2026-12-31 23:59:59', 'FIXED', '250', 'DRAFT',  'New customer account opening incentive campaign.', true, NOW() - INTERVAL '15 days');

SELECT setval('campaigns_id_seq', (SELECT MAX(id) FROM campaigns));

-- Attach COMPOSITE rule to October Savings campaign (ID: 1)
INSERT INTO campaign_rules (campaign_id, rule_type, operator, rule_value)
VALUES
  (1, 'COMPOSITE', 'N/A', '{
    "logical_operator": "AND",
    "conditions": [
      { "field": "deposit_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 5000 },
      { "field": "account_type",   "operator": "EQUALS",                 "value": "SAVINGS" }
    ]
  }'::jsonb);

-- =============================================================================
-- 6. INSERT EXACTLY 8 CLEAN REFERRALS (Linked to Agents and OCT-2026 Campaign)
-- =============================================================================
INSERT INTO referrals (agent_id, campaign_id, customer_name, customer_phone, status, payout_status, created_at)
VALUES
  -- Abebe Kebede (NIB-ABEBE1)
  (1, 1, 'Aster Aweke',       '+251911000001', 'SUCCESSFUL', 'PAID',    NOW() - INTERVAL '14 days'),
  (1, 1, 'Tilahun Gessesse',  '+251911000002', 'SUCCESSFUL', 'PAID',    NOW() - INTERVAL '10 days'),
  (1, 1, 'Mahmoud Ahmed',     '+251911000003', 'PENDING',    'PENDING', NOW() - INTERVAL '2 days'),

  -- Sara Bekele (NIB-SARA22)
  (2, 1, 'Mulatu Astatke',    '+251922000001', 'SUCCESSFUL', 'PENDING', NOW() - INTERVAL '12 days'),
  (2, 1, 'Teddy Afro',        '+251922000002', 'SUCCESSFUL', 'PENDING', NOW() - INTERVAL '8 days'),
  (2, 1, 'Gigi Shibabaw',     '+251922000003', 'REJECTED',   'PENDING', NOW() - INTERVAL '5 days'),

  -- Dawit Tadesse (NIB-DAWIT3)
  (3, 1, 'Ephrem Tamiru',     '+251933000001', 'SUCCESSFUL', 'PENDING', NOW() - INTERVAL '7 days'),
  (3, 1, 'Kuku Sebsebe',      '+251933000002', 'PENDING',    'PENDING', NOW() - INTERVAL '1 day');

-- =============================================================================
-- 7. INSERT EXACTLY 3 CLEAN INTEGRATION LOGS
-- =============================================================================
INSERT INTO integration_logs (transaction_id, status, payload, error_message, created_at)
VALUES
  -- 1. PROCESSED
  ('TXN-20261015-001', 'PROCESSED', '{
    "transaction_id": "TXN-20261015-001",
    "referral_code": "NIB-ABEBE1",
    "customer_name": "Aster Aweke",
    "customer_phone": "+251911000001",
    "deposit_amount": 10000,
    "account_type": "SAVINGS",
    "branch_code": "NIB-HQ",
    "timestamp": "2026-10-15T10:30:00Z"
  }'::jsonb, NULL, NOW() - INTERVAL '14 days'),

  -- 2. FAILED-Rule
  ('TXN-20261016-002', 'FAILED', '{
    "transaction_id": "TXN-20261016-002",
    "referral_code": "NIB-SARA22",
    "customer_name": "Gigi Shibabaw",
    "customer_phone": "+251922000003",
    "deposit_amount": 2000,
    "account_type": "SAVINGS",
    "branch_code": "NIB-BOLE",
    "timestamp": "2026-10-16T14:15:00Z"
  }'::jsonb, 'Rule validation failed: deposit_amount 2000 is less than minimum required 5000 for campaign OCT-2026.', NOW() - INTERVAL '5 days'),

  -- 3. FAILED-API
  ('TXN-20261017-003', 'FAILED', '{
    "transaction_id": "TXN-20261017-003",
    "referral_code": "NIB-INVALID",
    "customer_name": "Unknown Customer",
    "customer_phone": "+251999999999",
    "deposit_amount": 7500,
    "account_type": "CHECKING",
    "branch_code": "NIB-KERA",
    "timestamp": "2026-10-17T09:00:00Z"
  }'::jsonb, 'Core Banking Webhook Error: Referral code "NIB-INVALID" not found in active agent registry.', NOW() - INTERVAL '3 days');

COMMIT;

