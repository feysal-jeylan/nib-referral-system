-- =============================================================================
-- Nib Bank Referral System — Database Schema
-- File   : schema.sql
-- Purpose: Drop and recreate all tables for a clean initialization.
--
-- HOW TO RUN (Windows Command Prompt):
--   psql -U postgres -d referral_db -f schema.sql
--
-- IMPORTANT: This script uses DROP TABLE ... CASCADE, which will destroy all
-- existing data. Only run this during initial setup or when you intend to
-- reset the database completely.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1: Drop existing tables in reverse dependency order.
--
-- We must drop child tables (that hold foreign keys) before parent tables.
-- CASCADE also drops any dependent objects (indexes, constraints) automatically.
-- "IF EXISTS" prevents an error if the table doesn't exist yet (safe first run).
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS referrals    CASCADE;
DROP TABLE IF EXISTS reward_rules CASCADE;
DROP TABLE IF EXISTS customers    CASCADE;
DROP TABLE IF EXISTS agents       CASCADE;


-- -----------------------------------------------------------------------------
-- TABLE 1: agents
-- Represents the bank employees/agents who submit referrals.
--
-- referral_code : A unique code assigned to each agent so referrals can be
--                 traced back to them (e.g., "NIB-AGT-001").
-- GENERATED ALWAYS AS IDENTITY : Modern PostgreSQL equivalent of SERIAL.
--                 The DB always controls this value; you cannot manually insert it.
-- -----------------------------------------------------------------------------

CREATE TABLE agents (
    id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL,
    phone         VARCHAR(20)   NOT NULL UNIQUE,
    email         VARCHAR(100)  NOT NULL UNIQUE,
    referral_code VARCHAR(20)   NOT NULL UNIQUE,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- -----------------------------------------------------------------------------
-- TABLE 2: customers
-- Represents people who were referred to the bank by an agent.
--
-- phone UNIQUE : This is the key business rule — a customer's phone number
--               acts as their unique identity. If a referral is submitted for
--               a phone number that already exists, the DB will reject it with
--               a UNIQUE violation (HTTP 409 Conflict from the API).
--               This is how we prevent duplicate referrals at the database level.
-- -----------------------------------------------------------------------------

CREATE TABLE customers (
    id         INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    phone      VARCHAR(20)  NOT NULL UNIQUE,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- -----------------------------------------------------------------------------
-- TABLE 3: referrals
-- The core join table linking an agent to a customer they referred.
--
-- agent_id FK ON DELETE RESTRICT  : Prevents deleting an agent who has
--               referral records. Protects historical data integrity.
--               You must manually reassign or delete their referrals first.
--
-- customer_id FK ON DELETE CASCADE : If a customer record is deleted,
--               all their associated referral records are automatically
--               deleted too. A referral without a customer is meaningless.
--
-- status CHECK constraint : Enforces a strict state machine at the DB level.
--               The application cannot accidentally write an invalid status
--               like 'APPROVED' or 'DONE' — the DB will reject it outright.
-- -----------------------------------------------------------------------------

CREATE TABLE referrals (
    id          INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id    INTEGER     NOT NULL,
    customer_id INTEGER     NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key: agent_id -> agents.id
    CONSTRAINT fk_referrals_agent
        FOREIGN KEY (agent_id)
        REFERENCES agents(id)
        ON DELETE RESTRICT,

    -- Foreign key: customer_id -> customers.id
    CONSTRAINT fk_referrals_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    -- Enforce the allowed status values at the database level.
    CONSTRAINT chk_referrals_status
        CHECK (status IN ('PENDING', 'SUCCESSFUL', 'REJECTED'))
);


-- -----------------------------------------------------------------------------
-- TABLE 4: reward_rules
-- Configurable thresholds that determine reward eligibility.
-- Stored in the DB (not hardcoded in the app) so a supervisor can adjust
-- thresholds later without touching application code.
--
-- min_referrals UNIQUE : Prevents two reward tiers with the same threshold
--               (e.g., two different rewards both requiring 5 referrals).
-- -----------------------------------------------------------------------------

CREATE TABLE reward_rules (
    id            INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    min_referrals INTEGER     NOT NULL UNIQUE,
    reward_name   VARCHAR(50) NOT NULL,
    created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =============================================================================
-- INDEXES
-- Indexes speed up SELECT queries that filter or GROUP BY these columns.
-- Without them, PostgreSQL would scan every row in the referrals table.
--
-- idx_referrals_agent_id : Used every time we count referrals per agent
--               (e.g., "how many referrals does agent #5 have?").
--
-- idx_referrals_status   : Used when filtering by status
--               (e.g., "show all SUCCESSFUL referrals").
--
-- Note: Primary keys already have an index automatically; we don't need
-- to add one for referrals.id.
-- =============================================================================

CREATE INDEX idx_referrals_agent_id ON referrals(agent_id);
CREATE INDEX idx_referrals_status   ON referrals(status);


-- =============================================================================
-- SEED DATA: reward_rules
-- Default reward tiers as specified in the project requirements.
-- These can be updated by an admin later without changing application code.
-- =============================================================================

INSERT INTO reward_rules (min_referrals, reward_name) VALUES
    (3,  'Bronze'),
    (5,  'Silver'),
    (10, 'Gold');


-- =============================================================================
-- Verification: quickly confirm the tables and seed data were created.
-- =============================================================================

SELECT 'Schema created successfully.' AS status;

SELECT reward_name, min_referrals
FROM   reward_rules
ORDER  BY min_referrals ASC;
