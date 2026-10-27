-- =============================================================================
-- Nib Bank Referral System — Schema Migration v3
-- File   : schema_v3_password.sql
-- Purpose: Add the `must_change_password` flag to the `users` table to support
--          the forced-password-change flow for newly onboarded AGENT accounts.
--
-- HOW TO RUN:
--   psql -U postgres -d referral_db -f schema_v3_password.sql
--
-- WHAT THIS DOES:
--   1. Adds the `must_change_password` boolean column (DEFAULT TRUE).
--   2. Sets it to FALSE for the existing ADMIN account (admins set their own
--      password during seeding and never need to be forced to change it).
--   3. All future AGENT rows created by POST /api/agents will inherit
--      DEFAULT TRUE automatically — no application code change needed for that.
--
-- WHY THIS DESIGN IS SECURE:
--   - A compromised temporary password is USELESS after first login: even if
--     an attacker intercepts it, the backend will see must_change_password=TRUE
--     in the JWT, the frontend will render the ChangePassword screen instead of
--     the Dashboard, and the attacker cannot access any data. Once the agent
--     changes their password, a new JWT is issued and the old temporary password
--     is cryptographically invalidated (its bcrypt hash is overwritten in the DB).
--   - The flag lives in the DATABASE, not just in the JWT. Even if a crafted JWT
--     claims must_change_password=FALSE, the change-password route re-reads the
--     DB column before trusting it.
-- =============================================================================

-- Step 1: Add the column if it doesn't already exist.
-- DEFAULT TRUE ensures any future INSERT that doesn't specify this column
-- (e.g., a raw SQL insert during testing) automatically requires a password change.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

-- Step 2: Retroactively set the existing ADMIN account(s) to FALSE.
-- Admins set their password intentionally via seed_admin.js and should not
-- be forced through the change-password screen on their next login.
UPDATE users
  SET must_change_password = FALSE
  WHERE role = 'ADMIN';

-- Step 3: Verify the result.
SELECT
  id,
  username,
  role,
  must_change_password,
  created_at
FROM users
ORDER BY id;

SELECT 'Migration v3 applied successfully.' AS status;
