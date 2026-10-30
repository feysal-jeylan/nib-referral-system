-- =============================================================================
-- schema_v6_rule_engine.sql
-- Nib International Bank — Referral System V6 Migration
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES
-- ────────────────────────
-- 1. campaigns table:
--    - Adds `description`       TEXT            — optional human-readable summary
--    - Adds `reward_threshold`  INTEGER         — minimum referrals to qualify for reward
--    - Adds `is_active`         BOOLEAN         — soft-enable/disable flag (separate from status)
--
-- 2. campaign_rules table:
--    - Adds `operator` VARCHAR(20) — comparison operator for the rule engine
--      Valid values: GREATER_THAN, LESS_THAN, EQUALS, GREATER_THAN_OR_EQUAL,
--                    LESS_THAN_OR_EQUAL, NOT_EQUALS
--    - Adds a CHECK constraint to enforce valid operators.
--
-- 3. Indexes:
--    - idx_campaign_rules_campaign_id — speeds up rule fetches per campaign
--
-- HOW TO RUN
-- ──────────
--   psql -U postgres -d referral_db -f schema_v6_rule_engine.sql
--
-- SAFETY
-- ──────
-- Wrapped in a single transaction. Any failure rolls back the entire migration.
-- ADD COLUMN IF NOT EXISTS prevents failure on re-run.
-- =============================================================================

BEGIN;

-- ── campaigns: add description ────────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ── campaigns: add reward_threshold ──────────────────────────────────────────
-- The minimum number of SUCCESSFUL referrals an agent needs under this campaign
-- to be eligible for the reward. NULL means no threshold (always eligible).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS reward_threshold INTEGER;

-- ── campaigns: add is_active flag ─────────────────────────────────────────────
-- Separate from `status` (DRAFT/ACTIVE/EXPIRED). Allows an Admin to temporarily
-- pause a running campaign without changing its lifecycle state.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ── campaign_rules: add operator column ───────────────────────────────────────
-- The rule engine uses this to compare customer_data against rule_value.
-- Example: rule_type='MIN_DEPOSIT', operator='GREATER_THAN', rule_value={"amount":5000}
--   → pass if customer deposit_amount > 5000
ALTER TABLE campaign_rules
  ADD COLUMN IF NOT EXISTS operator VARCHAR(30) NOT NULL DEFAULT 'EQUALS';

-- Add a CHECK constraint to restrict operator to known values.
-- We use a DO block (PL/pgSQL) because ADD CONSTRAINT IF NOT EXISTS is not
-- available in older Postgres versions — this approach is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_rules_operator_check'
  ) THEN
    ALTER TABLE campaign_rules
      ADD CONSTRAINT campaign_rules_operator_check
      CHECK (operator IN (
        'GREATER_THAN',
        'LESS_THAN',
        'EQUALS',
        'GREATER_THAN_OR_EQUAL',
        'LESS_THAN_OR_EQUAL',
        'NOT_EQUALS'
      ));
  END IF;
END
$$;

-- ── Index: rule lookups by campaign ──────────────────────────────────────────
-- The rule engine fetches all rules for a given campaign_id on every webhook.
-- This index makes that lookup O(log n) instead of a full table scan.
CREATE INDEX IF NOT EXISTS idx_campaign_rules_campaign_id
  ON campaign_rules(campaign_id);

COMMIT;

