-- =============================================================================
-- Nib Bank Referral System — Authentication Schema
-- File   : schema_auth.sql
-- Purpose: Creates the `users` table that supports JWT-based login with RBAC.
--
-- HOW TO RUN (after schema.sql has already been applied):
--   psql -U postgres -d referral_db -f schema_auth.sql
--
-- DESIGN DECISIONS:
--   - Passwords are stored as bcrypt hashes — NEVER as plaintext.
--   - Role is an application-enforced enum ('ADMIN' | 'AGENT') backed by a
--     CHECK constraint so the database itself rejects any invalid value.
--   - agent_id is nullable: ADMIN users are not linked to an agent row,
--     but AGENT users must be, so the application enforces this on creation.
--   - The FK ON DELETE SET NULL means if an agent record is ever deleted,
--     the linked user account is NOT deleted — just unlinked. This prevents
--     accidental credential loss.
-- =============================================================================


-- Drop the table if it already exists so this script is safely re-runnable
-- during development. In production you would use a migration tool instead.
DROP TABLE IF EXISTS users CASCADE;


-- -----------------------------------------------------------------------------
-- TABLE: users
-- One row per system user (admin staff or field agent).
--
-- id           : Auto-generated integer PK — never expose this directly to
--                clients; use it only as an internal FK reference.
--
-- username     : Unique login handle. UNIQUE constraint prevents two accounts
--                sharing a username (PostgreSQL error code 23505 on collision).
--
-- password_hash: The bcrypt hash of the user's password (cost factor >= 10).
--                bcrypt output is always 60 characters for $2b$ hashes.
--                We store 100 chars for forward-compatibility with longer outputs.
--
-- role         : Either 'ADMIN' or 'AGENT'.
--                CHECK constraint enforces this at the database level, so no
--                invalid role can ever be persisted even if application code has
--                a bug. ADMINs have full write access; AGENTs can only read
--                their own stats.
--
-- agent_id     : Foreign key to agents(id). NULL for ADMIN accounts.
--                For AGENT role, this links the user account to the specific
--                agent record -- used in the authorizeRole middleware to enforce
--                that an agent can only view their own stats.
--
-- created_at   : Server-side timestamp -- the application never sends this in;
--                PostgreSQL fills it in automatically.
-- -----------------------------------------------------------------------------

CREATE TABLE users (
    id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    password_hash VARCHAR(100)  NOT NULL,
    role          VARCHAR(10)   NOT NULL,
    agent_id      INTEGER       NULL,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Enforce the allowed role values at the DB level.
    -- No matter what the application sends, the DB will reject anything
    -- outside this set with a check_violation error (code 23514).
    CONSTRAINT chk_users_role
        CHECK (role IN ('ADMIN', 'AGENT')),

    -- Link AGENT users to their corresponding agent row.
    -- ON DELETE SET NULL: deleting an agent row does NOT cascade-delete the
    -- user account -- it merely unlinks it. This is safer than CASCADE.
    CONSTRAINT fk_users_agent
        FOREIGN KEY (agent_id)
        REFERENCES agents(id)
        ON DELETE SET NULL
);


-- =============================================================================
-- INDEX
-- Queries to the /api/auth/login endpoint look up a user by username.
-- Without an index PostgreSQL would scan the entire table on every login.
-- =============================================================================

CREATE INDEX idx_users_username ON users(username);


-- =============================================================================
-- Verification
-- =============================================================================

SELECT 'users table created successfully.' AS status;
