-- =============================================================================
-- schema_v5_public_agents.sql
-- Nib International Bank — Referral System V5 Migration
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES
-- ────────────────────────
-- 1. Adds a `status` column to the `agents` table with a CHECK constraint
--    limiting valid values to: PENDING | APPROVED | REJECTED
-- 2. Grandfathers ALL existing agents to APPROVED so demo data is not broken.
-- 3. Relaxes the NOT NULL constraint on `referral_code` so that a PENDING
--    agent (who has no code yet) can be inserted without an artificial code.
-- 4. Creates an index on agents(status) for fast PENDING-agent queries.
--
-- HOW TO RUN
-- ──────────
--   psql -U postgres -d referral_db -f schema_v5_public_agents.sql
--
-- SAFETY
-- ──────
-- Every DDL statement is wrapped in a single transaction.  If any step fails
-- the entire migration rolls back automatically — the database is left in the
-- exact state it was before you ran this file.
-- =============================================================================

BEGIN;

-- ── Step 1: Add `status` column ──────────────────────────────────────────────
--
-- DEFAULT 'PENDING' means any future INSERT that omits the column (e.g. the
-- public apply endpoint) automatically gets 'PENDING'.
--
-- IF NOT EXISTS prevents a re-run from failing if the column already exists.
-- (Useful during iterative development / CI resets.)
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- ── Step 2: Grandfather all pre-existing agents as APPROVED ──────────────────
--
-- Without this, every current agent would show as PENDING and the Admin would
-- be flooded with spurious "approval needed" rows.
UPDATE agents
  SET status = 'APPROVED'
  WHERE status = 'PENDING';

-- ── Step 3: Allow referral_code to be NULL ───────────────────────────────────
--
-- A PENDING agent has not been assigned a referral code yet.  The code is
-- generated at approval time (PATCH /api/agents/:id/approve).  Dropping NOT
-- NULL here lets the apply endpoint INSERT without a placeholder code.
ALTER TABLE agents
  ALTER COLUMN referral_code DROP NOT NULL;

-- ── Step 4: Index for fast PENDING lookups ────────────────────────────────────
--
-- The Admin dashboard filters agents by status on every page load.  A partial
-- index on status keeps that query fast even as the agents table grows.
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

COMMIT;

