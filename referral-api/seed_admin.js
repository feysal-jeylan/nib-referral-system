/**
 * referral-api/seed_admin.js
 * ---------------------------
 * One-time script to create the default ADMIN user.
 *
 * HOW TO RUN:
 *   node seed_admin.js
 *
 * WHAT IT DOES:
 *   1. Hashes the plaintext password with bcrypt (cost factor 12).
 *   2. Inserts a user row with role='ADMIN' and agent_id=NULL.
 *   3. Uses ON CONFLICT DO NOTHING so re-running the script is always safe
 *      — it will NOT overwrite an existing admin or throw an error.
 *
 * SECURITY NOTE:
 *   Change the default password immediately after first login in production.
 *   This script is safe to commit (it contains no real secrets), but the
 *   actual .env file (which holds JWT_SECRET and DB credentials) must NEVER
 *   be committed.
 *
 * WHY bcrypt?
 *   bcrypt is a password-hashing function designed to be intentionally slow.
 *   The "cost factor" (12 here) controls how many rounds of hashing are done
 *   (2^12 = 4096 iterations). This makes brute-force attacks computationally
 *   expensive. A cost factor of 10-12 is the current industry standard.
 *   Unlike MD5 or SHA-256, bcrypt automatically embeds a random salt in every
 *   hash, so identical passwords produce different hashes — preventing
 *   rainbow-table attacks.
 */

'use strict';

const bcrypt = require('bcrypt');
const pool   = require('./db');
require('dotenv').config();

// ---------------------------------------------------------------------------
// Configuration — edit these before running if needed.
// ---------------------------------------------------------------------------
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const SALT_ROUNDS    = 12; // Cost factor — higher = slower hash = harder to brute-force

async function seedAdmin() {
  console.log('[seed_admin] Starting admin user seed...');

  try {
    // ── Step 1: Hash the password ────────────────────────────────────────────
    //
    // bcrypt.hash() generates a random salt internally and applies it to the
    // plaintext password. The resulting string (e.g., "$2b$12$...") contains
    // the algorithm identifier, cost factor, salt, AND hash all in one string.
    // This is everything bcrypt.compare() needs to verify a password later.
    console.log(`[seed_admin] Hashing password with cost factor ${SALT_ROUNDS}...`);
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    console.log('[seed_admin] Password hashed successfully.');

    // ── Step 2: Insert the admin user ────────────────────────────────────────
    //
    // ON CONFLICT (username) DO NOTHING:
    //   If an 'admin' user already exists, the INSERT is silently skipped.
    //   No error is thrown, no data is overwritten.
    //   This makes the script idempotent — safe to run multiple times.
    //
    // agent_id is NULL because ADMIN users are not linked to an agent row.
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role, agent_id)
       VALUES ($1, $2, 'ADMIN', NULL)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username, role`,
      [ADMIN_USERNAME, passwordHash]
    );

    // ── Step 3: Report the result ─────────────────────────────────────────────
    if (result.rowCount === 0) {
      console.log(`[seed_admin] User '${ADMIN_USERNAME}' already exists — no changes made.`);
    } else {
      const user = result.rows[0];
      console.log('[seed_admin] ✅ Admin user created successfully!');
      console.log(`[seed_admin]    ID       : ${user.id}`);
      console.log(`[seed_admin]    Username : ${user.username}`);
      console.log(`[seed_admin]    Role     : ${user.role}`);
      console.log('[seed_admin] ⚠️  Remember to change the default password after first login!');
    }

  } catch (err) {
    console.error('[seed_admin] ❌ Failed to seed admin user:', err.message);
    // If the users table doesn't exist yet, give a helpful hint.
    if (err.code === '42P01') {
      console.error('[seed_admin] Hint: Run schema.sql and schema_auth.sql first.');
    }
    process.exit(1);
  } finally {
    // Always close the pool so the Node process exits cleanly.
    await pool.end();
    console.log('[seed_admin] Database connection closed.');
  }
}

seedAdmin();
