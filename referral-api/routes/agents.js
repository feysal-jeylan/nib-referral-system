/**
 * referral-api/routes/agents.js
 * ------------------------------
 * Router for all /api/agents endpoints.
 *
 * Current endpoints:
 *   GET  /api/agents           — List agents (ADMIN: all, AGENT: own row only).
 *   POST /api/agents           — Create a new agent + linked user account (ADMIN only, transactional).
 *   GET  /api/agents/:id/stats — Get a single agent's referral count and reward tier.
 *
 * Per RULES.md:
 *   - All inputs are validated server-side before touching the database.
 *   - All queries use parameterized form ($1, $2, ...) — never string concatenation.
 *   - Raw DB errors are never sent to the client.
 *   - Multi-table writes are wrapped in a transaction (BEGIN / COMMIT / ROLLBACK).
 */

'use strict';

const crypto  = require('crypto');
const express = require('express');
const bcrypt  = require('bcrypt');
const pool    = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/agents
// Return every agent together with their SUCCESSFUL referral count
// and the highest reward tier they currently qualify for.
//
// Success response — 200 OK (array, newest agent first):
//   [
//     {
//       "id":                  1,
//       "name":                "Abebe Kebede",
//       "referral_code":       "NIB-X7KP2A",
//       "successful_referrals": 4,
//       "current_reward":       "Bronze"
//     },
//     ...
//   ]
//
// Error responses:
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/agents — requires authentication (any role).
//
// RBAC filtering:
//   ADMIN  → returns ALL agents.
//   AGENT  → returns ONLY the row for their own agent_id (req.user.agent_id).
//
// This means the frontend does not need to filter client-side; the server
// enforces the boundary. An AGENT simply cannot see other agents' data.
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    // ── RBAC: build the WHERE clause based on the caller's role ────────────
    //
    // For AGENT users, req.user.agent_id is the FK from their users row to
    // the agents table. We inject it as a parameterized value to prevent
    // SQL injection — never via string concatenation.
    //
    // For ADMIN users, we add no WHERE filter (queryParams stays empty, and
    // the agentFilter fragment is an empty string).
    let agentFilter = '';
    const queryParams = [];

    if (req.user.role === 'AGENT') {
      queryParams.push(req.user.agent_id);
      // $1 will be bound to req.user.agent_id — safe from injection.
      agentFilter = 'WHERE a.id = $1';
    }

    // This single query does everything in one round-trip:
    //
    // 1. For each agent (LEFT JOIN so agents with zero referrals appear too),
    //    COUNT only the referral rows where status = 'SUCCESSFUL'.
    //
    // 2. Find the highest qualifying reward tier with a correlated subquery.
    //
    // The agentFilter fragment is either '' (ADMIN) or 'WHERE a.id = $1' (AGENT).
    const result = await pool.query(`
      SELECT
        sub.id,
        sub.name,
        sub.referral_code,
        sub.successful_count,
        rr.reward_name AS current_reward
      FROM (
        SELECT
          a.id,
          a.name,
          a.referral_code,
          a.created_at,
          COUNT(r.id) FILTER (WHERE r.status = 'SUCCESSFUL') AS successful_count
        FROM agents a
        LEFT JOIN referrals r ON r.agent_id = a.id
        ${agentFilter}
        GROUP BY a.id, a.name, a.referral_code, a.created_at
      ) sub
      LEFT JOIN reward_rules rr
        ON rr.min_referrals = (
          SELECT MAX(min_referrals)
          FROM   reward_rules
          WHERE  min_referrals <= sub.successful_count
        )
      ORDER BY sub.created_at DESC
    `, queryParams);

    const agents = result.rows.map(row => ({
      id:                   row.id,
      name:                 row.name,
      referral_code:        row.referral_code,
      // COUNT returns a PG bigint which arrives as a string — coerce to number.
      successful_referrals: parseInt(row.successful_count, 10),
      current_reward:       row.current_reward ?? null,
    }));

    return res.status(200).json(agents);

  } catch (err) {
    console.error('[GET /api/agents] Unexpected DB error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helper: generate a unique referral code in the format NIB-XXXXXX
//
// Math.random().toString(36) converts a random float to base-36 (0-9, a-z).
// .substring(2, 8) takes 6 characters after the "0." prefix.
// .toUpperCase() makes it look professional (NIB-A1B2C3).
//
// Collision probability with 6 base-36 chars = 1 in ~2.1 billion — fine for MVP.
// ---------------------------------------------------------------------------
function generateReferralCode() {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `NIB-${random}`;
}

// ---------------------------------------------------------------------------
// POST /api/agents
// Create a new agent record.
//
// Request body (JSON):
//   { "name": "Abebe Kebede", "phone": "0911234567", "email": "abebe@nib.com" }
//
// Success response — 201 Created:
//   { "id": 1, "referral_code": "NIB-X7KP2A", "name": "Abebe Kebede" }
//
// Error responses:
//   400 Bad Request   — missing name, phone, or email
//   409 Conflict      — phone or email already exists in the DB
//   500 Server Error  — unexpected DB failure (details logged server-side only)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POST /api/agents — ADMIN only: create a new agent with a linked user account.
//
// This route is wrapped in a database transaction so that both the agents INSERT
// and the users INSERT succeed or fail together — no orphaned rows possible.
//
// On success the response includes the temporary password so the Admin can
// hand it to the new agent. The agent must change it after first login.
//
// New response shape (201 Created):
//   {
//     "id":               1,
//     "name":             "Abebe Kebede",
//     "referral_code":    "NIB-X7KP2A",
//     "created_at":       "2026-10-27T...",
//     "temp_password":    "NibBank2026!"
//   }
// ---------------------------------------------------------------------------
router.post('/', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  // ── Step 1: Extract and trim inputs ────────────────────────────────────────
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim();

  // ── Step 2: Validate — all fields are required ────────────────────────────
  if (!name || !phone || !email) {
    return res.status(400).json({
      error: 'All fields are required: name, phone, email.',
      code: 'MISSING_FIELDS',
    });
  }

  if (!email.includes('@')) {
    return res.status(400).json({
      error: 'A valid email address is required.',
      code: 'INVALID_EMAIL',
    });
  }

  // ── Step 3: Generate referral code and a cryptographically random temp password ─
  //
  // WHY crypto.randomBytes instead of a fixed string:
  //   A fixed password like 'NibBank2026!' is the same for EVERY new agent.
  //   If it leaks once (e.g., in a git commit), ALL new agents are vulnerable.
  //   crypto.randomBytes(16) draws from the OS CSPRNG — each agent gets a
  //   unique 32-character hex string with ~128 bits of entropy.
  //
  // WHY console.log and NOT in the HTTP response:
  //   Returning secrets in HTTP responses is risky: they appear in browser
  //   history, proxy logs, and DevTools network tabs. In production this
  //   console.log would be replaced by a secure email/SMS delivery system.
  //   The Admin reads it from the terminal and hands it to the agent out-of-band.
  const referralCode  = generateReferralCode();
  const tempPassword  = crypto.randomBytes(16).toString('hex'); // 32-char hex string
  const passwordHash  = await bcrypt.hash(tempPassword, 12);

  // ▶ Simulate sending the temp password to the agent via email.
  //   In production: replace this with nodemailer / SendGrid / AWS SES.
  console.log(`[AGENT ONBOARDING] Temp password for ${email}: ${tempPassword}`);
  console.log(`[AGENT ONBOARDING] ⚠️  This should be delivered via secure email, not stored anywhere.`);

  // ── Step 4: Open a transaction — two tables must succeed together ──────────
  //
  // WHY A TRANSACTION?
  //   We write to both `agents` and `users`. If the agents INSERT succeeds
  //   but users fails (e.g. email collision), we'd have an agent with no
  //   login account — an inconsistent state. BEGIN/COMMIT/ROLLBACK prevents this.
  //
  // WHY pool.connect() instead of pool.query()?
  //   pool.query() picks a fresh connection for every call; it cannot maintain
  //   transaction state across calls. We need ONE dedicated connection so that
  //   BEGIN, the two INSERTs, and COMMIT/ROLLBACK all run on the same session.
  //
  // CRITICAL: client.release() MUST be called in finally — otherwise the
  //   connection is permanently "checked out" and the pool slowly starves.
  const client = await pool.connect();

  try {
    // ── BEGIN ─────────────────────────────────────────────────────────────
    await client.query('BEGIN');

    // ── INSERT 1: agents ──────────────────────────────────────────────────
    // RETURNING gives us the auto-generated id without a second SELECT.
    const agentResult = await client.query(
      `INSERT INTO agents (name, phone, email, referral_code)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, referral_code, created_at`,
      [name, phone, email, referralCode]
    );
    const newAgent = agentResult.rows[0];

    // ── INSERT 2: users ───────────────────────────────────────────────────
    // Creates the login account linked to the new agent.
    //   username      = agent's email (unique, used as login credential)
    //   password_hash = bcrypt hash of the temporary password
    //   role          = 'AGENT'
    //   agent_id      = FK to the row we just inserted above
    await client.query(
      `INSERT INTO users (username, password_hash, role, agent_id)
       VALUES ($1, $2, 'AGENT', $3)`,
      [email, passwordHash, newAgent.id]
    );

    // ── COMMIT ────────────────────────────────────────────────────────────
    // Both INSERTs succeeded — make all changes permanent.
    await client.query('COMMIT');

    // Return agent details. The temp password is NOT in the response — it was
    // printed to the server terminal above (simulating email delivery).
    return res.status(201).json({
      id:            newAgent.id,
      name:          newAgent.name,
      referral_code: newAgent.referral_code,
      created_at:    newAgent.created_at,
      message:       `Agent created. Temporary credentials have been dispatched to ${email}.`,
    });

  } catch (err) {
    // ── ROLLBACK ──────────────────────────────────────────────────────────
    // Something failed — undo everything so neither table gets a partial write.
    await client.query('ROLLBACK');

    // '23505' = unique_violation — phone, email, or referral_code collision.
    if (err.code === '23505') {
      let field = 'phone or email';
      if (err.constraint && err.constraint.includes('phone'))         field = 'phone number';
      if (err.constraint && err.constraint.includes('email'))         field = 'email address';
      if (err.constraint && err.constraint.includes('referral_code')) field = 'referral code';
      if (err.constraint && err.constraint.includes('username'))      field = 'email (user account)';

      return res.status(409).json({
        error: `An agent with this ${field} already exists.`,
        code: 'DUPLICATE_ENTRY',
      });
    }

    console.error('[POST /api/agents] Unexpected DB error:', err.message);
    next(err);

  } finally {
    // Always return the connection to the pool — no matter what happened.
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id/stats
// Return an agent's SUCCESSFUL referral count and current reward tier.
//
// URL parameter:
//   :id  — the integer primary key of the agent.
//
// Success response — 200 OK:
//   {
//     "agent_id":             1,
//     "successful_referrals": 4,
//     "current_reward":       "Bronze"   // null when 0 qualifying referrals
//   }
//
// Error responses:
//   400 Bad Request  — :id is not a valid integer
//   404 Not Found    — no agent exists with that id
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
// GET /api/agents/:id/stats — any authenticated user, but AGENT role is
// restricted to their OWN stats only (req.user.agent_id must match :id).
router.get('/:id/stats', authenticateToken, async (req, res, next) => {
  // ── Step 1: Parse and validate the URL parameter ──────────────────────────
  const agentId = parseInt(req.params.id, 10);

  if (isNaN(agentId)) {
    return res.status(400).json({
      error: 'Agent ID must be a valid integer.',
      code:  'INVALID_ID',
    });
  }

  // ── Step 1b: RBAC — agents can only view their own stats ─────────────────
  //
  // req.user is set by authenticateToken (the decoded JWT payload).
  // For AGENT users, req.user.agent_id is the FK that links the user account
  // to the specific agent row. If an AGENT tries to request stats for a
  // *different* agent's id, we return 403 immediately — before hitting the DB.
  //
  // ADMIN users (req.user.role === 'ADMIN') have no agent_id restriction;
  // they can view stats for any agent.
  if (req.user.role === 'AGENT' && req.user.agent_id !== agentId) {
    return res.status(403).json({
      error: 'Access denied. Agents can only view their own stats.',
      code:  'FORBIDDEN',
    });
  }

  try {
    // ── Step 2: Verify the agent exists ─────────────────────────────────
    //
    // We check the agents table first so we can return a meaningful 404 if
    // the agent does not exist, rather than just returning 0 successful referrals
    // (which would be misleading for a non-existent agent).
    const agentCheck = await pool.query(
      'SELECT id, name FROM agents WHERE id = $1',
      [agentId]
    );

    if (agentCheck.rows.length === 0) {
      return res.status(404).json({
        error: `Agent with id ${agentId} not found.`,
        code:  'AGENT_NOT_FOUND',
      });
    }

    // ── Step 3: Count SUCCESSFUL referrals and find the top reward tier ────
    //
    // This single query does two things at once:
    //
    // Part A — COUNT(r.id) FILTER (WHERE r.status = 'SUCCESSFUL')
    //   Counts only the rows where status = 'SUCCESSFUL'. The FILTER clause
    //   is a PostgreSQL shorthand for a conditional aggregate; it is equivalent
    //   to COUNT(CASE WHEN r.status = 'SUCCESSFUL' THEN 1 END).
    //   We alias it as "successful_count" for use in the JOIN below.
    //
    // Part B — LEFT JOIN reward_rules rr ON rr.min_referrals <= successful_count
    //   Joins every reward tier whose minimum threshold is <= the agent's count.
    //   For example, if count = 4:
    //     Bronze  (min 3)  ✔ qualifies  → joined
    //     Silver  (min 5)  ✖ too high   → not joined
    //     Gold    (min 10) ✖ too high   → not joined
    //   This gives us potentially multiple matching rows, so we use MAX() on
    //   min_referrals to pick only the highest qualifying tier.
    //
    // LEFT JOIN ensures we still get a row back (with reward_name = NULL)
    // when the agent has 0 successful referrals and qualifies for nothing.
    //
    // Using a subquery (the inner SELECT) lets us reference successful_count
    // in the JOIN condition, which is not possible when it is just a column alias
    // in the outer SELECT.
    const statsResult = await pool.query(
      `SELECT
         sub.successful_count,
         rr.reward_name        AS current_reward
       FROM (
         SELECT COUNT(r.id) FILTER (WHERE r.status = 'SUCCESSFUL') AS successful_count
         FROM   referrals r
         WHERE  r.agent_id = $1
       ) sub
       LEFT JOIN reward_rules rr
         ON  rr.min_referrals = (
           SELECT MAX(min_referrals)
           FROM   reward_rules
           WHERE  min_referrals <= sub.successful_count
         )`,
      [agentId]
    );

    const row = statsResult.rows[0];

    return res.status(200).json({
      agent_id:             agentId,
      // COUNT() in PostgreSQL returns a string (bigint). Coerce to a JS number.
      successful_referrals: parseInt(row.successful_count, 10),
      // LEFT JOIN returns NULL when no tier qualifies; surface that as null.
      current_reward:       row.current_reward ?? null,
    });

  } catch (err) {
    console.error('[GET /api/agents/:id/stats] Unexpected DB error:', err.message);
    next(err);
  }
});

module.exports = router;
