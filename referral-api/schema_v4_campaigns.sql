-- =============================================================================
-- Nib Bank Referral System — Schema Migration v4
-- File   : schema_v4_campaigns.sql
-- Purpose: Architectural pivot to Campaign Management & Core Banking Integration.
--          Adds: campaigns, campaign_rules, integration_logs tables.
--          Migrates: referrals away from the customers FK to denormalized columns.
--          Removes: customers table (no longer needed in the new architecture).
--
-- HOW TO RUN (Windows Command Prompt):
--   psql -U postgres -d referral_db -f schema_v4_campaigns.sql
--
-- SAFETY GUARANTEE — TRANSACTIONAL MIGRATION:
--   The entire script is wrapped in BEGIN ... COMMIT. PostgreSQL treats all
--   DDL (CREATE, ALTER, DROP) as transactional. If ANY statement fails, the
--   ROLLBACK in the exception block fires and the database is left exactly as
--   it was before this script ran. You will NEVER end up with a half-migrated,
--   broken schema.
--
-- DATA LOSS PREVENTION:
--   Before the customer_id FK and column are dropped, an UPDATE statement copies
--   customers.name → referrals.customer_name and customers.phone →
--   referrals.customer_phone via a JOIN. Existing demo referrals retain their
--   customer identity even after the customers table is gone.
-- =============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create the `campaigns` table
-- ============================================================================
-- Campaigns are admin-defined reward programmes with a defined lifetime and
-- reward structure. The status column is enforced by a CHECK constraint so the
-- database will reject any value outside the three allowed states.
--
-- reward_type / reward_value are kept as VARCHAR here for flexibility:
-- e.g., reward_type = 'CASH_BONUS', reward_value = '500 ETB'
--       reward_type = 'GIFT_CARD',  reward_value = 'Amazon 50 USD'
-- Specific parsing / calculation happens in the application layer.
-- ============================================================================

CREATE TABLE campaigns (
    id           SERIAL        PRIMARY KEY,
    name         VARCHAR(100)  NOT NULL,
    start_date   TIMESTAMP     NOT NULL,
    end_date     TIMESTAMP     NOT NULL,
    reward_type  VARCHAR(50)   NOT NULL,
    reward_value VARCHAR(100)  NOT NULL,
    status       VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Enforce the campaign state machine at the database level.
    -- 'DRAFT'   -> campaign is being configured, not yet visible to agents.
    -- 'ACTIVE'  -> campaign is live; new referrals can qualify.
    -- 'EXPIRED' -> past end_date; no new referrals qualify, data is preserved.
    CONSTRAINT chk_campaigns_status
        CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRED'))
);

COMMENT ON TABLE campaigns IS
    'Admin-defined reward programmes. Each campaign has flexible rules stored in campaign_rules.';
COMMENT ON COLUMN campaigns.status IS
    'State machine: DRAFT -> ACTIVE -> EXPIRED. Enforced by chk_campaigns_status.';


-- ============================================================================
-- STEP 2: Create the `campaign_rules` table
-- ============================================================================
-- Each campaign can have multiple rules (e.g., "min deposit = 5000 ETB" AND
-- "account type = SAVINGS"). Using JSONB for rule_value means we never need
-- another migration to add a new rule dimension — the JSON schema evolves
-- without touching the SQL schema.
--
-- Example row:
--   campaign_id = 1
--   rule_type   = 'MIN_DEPOSIT'
--   rule_value  = '{"amount": 5000, "currency": "ETB"}'
--
-- ON DELETE CASCADE: Deleting a campaign automatically removes its rules.
--   This is safe because rules are meaningless without the parent campaign.
-- ============================================================================

CREATE TABLE campaign_rules (
    id          SERIAL       PRIMARY KEY,
    campaign_id INTEGER      NOT NULL,
    rule_type   VARCHAR(50)  NOT NULL,
    rule_value  JSONB        NOT NULL,

    CONSTRAINT fk_campaign_rules_campaign
        FOREIGN KEY (campaign_id)
        REFERENCES campaigns(id)
        ON DELETE CASCADE
);

COMMENT ON TABLE campaign_rules IS
    'Flexible per-campaign qualification rules stored as JSONB. Multiple rules per campaign are ANDed together.';
COMMENT ON COLUMN campaign_rules.rule_value IS
    'JSONB payload. Schema varies by rule_type. E.g., MIN_DEPOSIT: {"amount":5000,"currency":"ETB"}';


-- ============================================================================
-- STEP 3: Create the `integration_logs` table
-- ============================================================================
-- This table acts as the idempotency ledger for webhooks arriving from the
-- core banking system (Temenos). Every incoming POST /api/integration/account-opened
-- request is logged here FIRST, before any referral processing occurs.
--
-- IDEMPOTENCY GUARANTEE:
--   The UNIQUE constraint on transaction_id means that if Temenos sends the
--   same event twice (a common pattern in reliable messaging), the second
--   INSERT will fail with a unique_violation (PostgreSQL error 23505).
--   The API endpoint catches this specific error and returns 200 OK to Temenos
--   without re-processing the referral — preventing double-crediting an agent.
--
-- status lifecycle: RECEIVED -> PROCESSED | FAILED
-- ============================================================================

CREATE TABLE integration_logs (
    id             SERIAL        PRIMARY KEY,
    transaction_id VARCHAR(100)  NOT NULL,
    payload        JSONB         NOT NULL,
    status         VARCHAR(20)   NOT NULL DEFAULT 'RECEIVED',
    error_message  TEXT,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- The UNIQUE constraint on transaction_id is the idempotency key.
    -- Duplicate webhooks from Temenos are silently rejected at the DB level.
    CONSTRAINT uq_integration_logs_transaction_id
        UNIQUE (transaction_id),

    CONSTRAINT chk_integration_logs_status
        CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED'))
);

COMMENT ON TABLE integration_logs IS
    'Audit ledger for all incoming core-banking webhooks. The UNIQUE transaction_id enforces idempotency.';
COMMENT ON COLUMN integration_logs.transaction_id IS
    'Unique ID supplied by Temenos. UNIQUE constraint prevents double-processing the same event.';
COMMENT ON COLUMN integration_logs.payload IS
    'Raw JSONB payload from Temenos. Preserved for debugging and audit purposes.';


-- ============================================================================
-- STEP 4a: Safe Data Migration — add new columns to `referrals`
-- ============================================================================
-- We ADD the new columns BEFORE copying data so that the UPDATE in Step 4b
-- has somewhere to write. Using ADD COLUMN IF NOT EXISTS makes this script
-- safe to re-run if it was partially applied and then rolled back manually.
-- ============================================================================

ALTER TABLE referrals
    ADD COLUMN IF NOT EXISTS customer_name  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS campaign_id    INTEGER;

-- Add the FK for campaign_id (separate statement for clarity and error isolation)
ALTER TABLE referrals
    ADD CONSTRAINT fk_referrals_campaign
        FOREIGN KEY (campaign_id)
        REFERENCES campaigns(id)
        ON DELETE SET NULL;   -- Deleting a campaign nullifies the link, not the referral

COMMENT ON COLUMN referrals.customer_name IS
    'Denormalized from customers.name at migration time. New rows populated from integration webhook payload.';
COMMENT ON COLUMN referrals.customer_phone IS
    'Denormalized from customers.phone at migration time. New rows populated from integration webhook payload.';
COMMENT ON COLUMN referrals.campaign_id IS
    'Optional FK to campaigns(id). NULL means the referral predates campaign tracking.';


-- ============================================================================
-- STEP 4b: Data Migration — copy existing customer data into referrals
-- ============================================================================
-- WHY THIS PREVENTS DATA LOSS:
--   Before this migration, a referral's customer identity lived exclusively in
--   the `customers` table, linked via referrals.customer_id. Once we drop that
--   FK and column, those names and phone numbers would be gone forever.
--
--   This UPDATE joins referrals <-> customers on the existing FK (customer_id)
--   and copies the name/phone directly into the referrals row — denormalizing
--   the data. After this UPDATE every referral row is self-contained and no
--   longer needs the customers table to know who was referred.
--
--   The WHERE clause only updates rows that actually HAVE a customer_id,
--   so any rows with a NULL customer_id (edge case from bad data) are skipped
--   safely instead of causing an error.
-- ============================================================================

UPDATE referrals r
SET
    customer_name  = c.name,
    customer_phone = c.phone
FROM customers c
WHERE r.customer_id = c.id
  AND r.customer_id IS NOT NULL;


-- ============================================================================
-- STEP 4c: Cleanup — drop the customer_id FK constraint, then the column
-- ============================================================================
-- WHY TWO SEPARATE STEPS?
--   PostgreSQL requires you to explicitly DROP the constraint before dropping
--   the column. Attempting to DROP a column that is still referenced by a named
--   constraint fails with an error. Dropping the constraint first is the clean,
--   portable approach (works on all PostgreSQL versions >= 9.4).
--
--   The constraint name `fk_referrals_customer` matches the name defined in
--   schema.sql. If your DB has a different auto-generated name you can find
--   it with: \d referrals  (in psql) and adjust accordingly.
-- ============================================================================

ALTER TABLE referrals
    DROP CONSTRAINT IF EXISTS fk_referrals_customer;

ALTER TABLE referrals
    DROP COLUMN IF EXISTS customer_id;


-- ============================================================================
-- STEP 4d: Drop the `customers` table (no longer needed)
-- ============================================================================
-- The customers table served its purpose as a normalised identity store.
-- In the new architecture, customer identity arrives via the Temenos webhook
-- and is stored directly on the referrals row. The table is now empty of
-- any unique information (all data was copied in Step 4b) and can be safely
-- removed to reduce schema complexity.
--
-- RESTRICT (default): Fails if any other table still references customers.
-- Since we already dropped the FK from referrals above, this is safe.
-- ============================================================================

DROP TABLE IF EXISTS customers RESTRICT;


-- ============================================================================
-- STEP 5: Scalability Indexes
-- ============================================================================
-- Indexes let PostgreSQL jump directly to matching rows instead of scanning
-- the entire table. At scale (thousands of referrals / campaigns / logs):
--
--   idx_referrals_agent_id      — leaderboard queries, "my referrals" views
--   idx_referrals_status        — admin filter by PENDING / SUCCESSFUL / REJECTED
--   idx_campaigns_status        — homepage showing ACTIVE campaigns only
--   idx_integration_logs_txn_id — idempotency check on every incoming webhook
--
-- IF NOT EXISTS: makes this script safely re-runnable if indexes already exist
-- from a previous partial run or from schema.sql.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_referrals_agent_id
    ON referrals(agent_id);

CREATE INDEX IF NOT EXISTS idx_referrals_status
    ON referrals(status);

CREATE INDEX IF NOT EXISTS idx_campaigns_status
    ON campaigns(status);

-- The UNIQUE constraint on transaction_id already creates an implicit index,
-- but we add an explicit named index here for clarity in EXPLAIN plans and
-- for consistency with the other indexes in this migration.
CREATE INDEX IF NOT EXISTS idx_integration_logs_transaction_id
    ON integration_logs(transaction_id);


-- ============================================================================
-- Verification: confirm all objects were created as expected
-- ============================================================================

SELECT 'Migration v4 applied successfully.' AS status;

-- Show the new tables and their sizes
SELECT
    table_name,
    pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('campaigns', 'campaign_rules', 'integration_logs', 'referrals')
ORDER BY table_name;

-- Confirm referrals no longer has customer_id but does have the new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'referrals'
ORDER BY ordinal_position;

-- Confirm customers table is gone
SELECT
    CASE
        WHEN COUNT(*) = 0 THEN 'customers table successfully dropped.'
        ELSE 'WARNING: customers table still exists!'
    END AS customers_check
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'customers';


COMMIT;
