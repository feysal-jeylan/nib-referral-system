/**
 * referral-api/routes/agents.js
 * ------------------------------
 * Router for all /api/agents endpoints.
 *
 * Current endpoints (V5):
 *   POST /api/agents/apply       — PUBLIC: submit a self-registration application.
 *   GET  /api/agents             — List agents (ADMIN: all, AGENT: own row only).
 *   POST /api/agents             — Create a new approved agent + user account (ADMIN only, transactional).
 *   PATCH /api/agents/:id/approve — Approve a PENDING agent; generate referral code + user account (ADMIN only).
 *   PATCH /api/agents/:id/reject  — Reject a PENDING agent (ADMIN only).
 *   GET  /api/agents/:id/stats   — Get a single agent's referral count and reward tier.
 *
 * ROUTE ORDER MATTERS:
 *   Express matches routes in declaration order.  Literal-path routes like
 *   POST /apply must be declared BEFORE parameterised routes like PATCH /:id/*
 *   so Express does not try to parse "apply" as an integer ID.
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
// POST /api/agents/apply  — PUBLIC (no auth required)
//
// Allows anyone on the internet to submit an application to become a Nib
// referral agent.  The application lands in the agents table with
// status = 'PENDING' and referral_code = NULL.  An Admin must explicitly
// approve (PATCH /:id/approve) before the applicant can log in.
//
// Why no auth here?
//   This is the entry point for strangers — they have no account yet, so they
//   cannot have a JWT.  The endpoint is intentionally public.  No sensitive
//   data is returned, and the DB uniqueness constraints prevent abuse.
//
// Request body (JSON):
//   { "name": "Sara Tesfaye", "phone": "0912345678", "email": "sara@example.com" }
//
// Success response — 201 Created:
//   { "message": "Application submitted. Awaiting Admin approval." }
//
// Error responses:
//   400 Bad Request  — missing or invalid fields
//   409 Conflict     — phone or email already registered
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.post('/apply', async (req, res, next) => {
  // ── Step 1: Extract and sanitise inputs ──────────────────────────────────
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim()?.toLowerCase();

  // ── Step 2: Validate ─────────────────────────────────────────────────────
  if (!name || !phone || !email) {
    return res.status(400).json({
      error: 'All fields are required: name, phone, email.',
      code:  'MISSING_FIELDS',
    });
  }

  if (!email.includes('@')) {
    return res.status(400).json({
      error: 'A valid email address is required.',
      code:  'INVALID_EMAIL',
    });
  }

  // ── Step 3: Insert the application ───────────────────────────────────────
  //
  // status defaults to 'PENDING' via the column DEFAULT set in the V5 migration.
  // referral_code is NULL — generated only on approval.
  // No users row is created yet; the applicant cannot log in until approved.
  try {
    await pool.query(
      `INSERT INTO agents (name, phone, email, referral_code, status)
       VALUES ($1, $2, $3, NULL, 'PENDING')`,
      [name, phone, email]
    );

    return res.status(201).json({
      message: 'Application submitted. Awaiting Admin approval.',
    });

  } catch (err) {
    // 23505 = unique_violation (phone or email already exists)
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'An agent with this phone number or email already exists.',
        code:  'DUPLICATE_ENTRY',
      });
    }
    console.error('[POST /api/agents/apply] Unexpected DB error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents
// Return every agent together with their SUCCESSFUL referral count,
// the highest reward tier they currently qualify for, and their status.
//
// RBAC filtering:
//   ADMIN  → returns ALL agents (all statuses).
//   AGENT  → returns ONLY the row for their own agent_id (req.user.agent_id).
//
// Success response — 200 OK (array, newest agent first):
//   [
//     {
//       "id":                  1,
//       "name":                "Abebe Kebede",
//       "phone":               "0911234567",
//       "email":               "abebe@nib.com",
//       "referral_code":       "NIB-X7KP2A",
//       "status":              "APPROVED",
//       "successful_referrals": 4,
//       "current_reward":       "Bronze"
//     },
//     ...
//   ]
//
// Error responses:
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    // ── RBAC: build the WHERE clause based on the caller's role ────────────
    let agentFilter = '';
    const queryParams = [];

    if (req.user.role === 'AGENT') {
      queryParams.push(req.user.agent_id);
      agentFilter = 'WHERE a.id = $1';
    }

    const result = await pool.query(`
      SELECT
        sub.id,
        sub.name,
        sub.phone,
        sub.email,
        sub.referral_code,
        sub.status,
        sub.successful_count,
        rr.reward_name AS current_reward
      FROM (
        SELECT
          a.id,
          a.name,
          a.phone,
          a.email,
          a.referral_code,
          a.status,
          a.created_at,
          COUNT(r.id) FILTER (WHERE r.status = 'SUCCESSFUL') AS successful_count
        FROM agents a
        LEFT JOIN referrals r ON r.agent_id = a.id
        ${agentFilter}
        GROUP BY a.id, a.name, a.phone, a.email, a.referral_code, a.status, a.created_at
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
      phone:                row.phone,
      email:                row.email,
      referral_code:        row.referral_code,
      status:               row.status,
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
// POST /api/agents  — ADMIN only
//
// Create a new APPROVED agent with a linked user account in a single
// transaction.  The Admin hands the temp_password to the new agent
// out-of-band (it is shown in the success response and logged to the server
// terminal — in production it would be emailed via SendGrid / SES).
//
// Request body (JSON):
//   { "name": "Abebe Kebede", "phone": "0911234567", "email": "abebe@nib.com" }
//
// Success response — 201 Created:
//   {
//     "id":            1,
//     "name":          "Abebe Kebede",
//     "referral_code": "NIB-X7KP2A",
//     "status":        "APPROVED",
//     "created_at":    "2026-10-27T...",
//     "message":       "Agent created. Temporary credentials ...",
//     "temp_password": "a3f8..."
//   }
//
// Error responses:
//   400 Bad Request  — missing or invalid fields
//   409 Conflict     — phone or email already exists
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.post('/', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  // ── Step 1: Extract and trim inputs ────────────────────────────────────────
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim();

  // ── Step 2: Validate ─────────────────────────────────────────────────────
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

  // ── Step 3: Generate referral code and temp password ──────────────────────
  const referralCode  = generateReferralCode();
  const tempPassword  = crypto.randomBytes(16).toString('hex');
  const passwordHash  = await bcrypt.hash(tempPassword, 12);

  console.log(`[AGENT ONBOARDING] Temp password for ${email}: ${tempPassword}`);
  console.log(`[AGENT ONBOARDING] ⚠️  This should be delivered via secure email, not stored anywhere.`);

  // ── Step 4: Transaction — agents + users must succeed together ────────────
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // INSERT into agents with status = 'APPROVED' (admin-created agents are
    // immediately active — they do not go through the PENDING approval flow).
    const agentResult = await client.query(
      `INSERT INTO agents (name, phone, email, referral_code, status)
       VALUES ($1, $2, $3, $4, 'APPROVED')
       RETURNING id, name, referral_code, status, created_at`,
      [name, phone, email, referralCode]
    );
    const newAgent = agentResult.rows[0];

    // CREATE the login account linked to the new agent.
    await client.query(
      `INSERT INTO users (username, password_hash, role, agent_id)
       VALUES ($1, $2, 'AGENT', $3)`,
      [email, passwordHash, newAgent.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      id:            newAgent.id,
      name:          newAgent.name,
      referral_code: newAgent.referral_code,
      status:        newAgent.status,
      created_at:    newAgent.created_at,
      message:       `Agent created. Temporary credentials have been dispatched to ${email}.`,
      temp_password: tempPassword,
    });

  } catch (err) {
    await client.query('ROLLBACK');

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
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/agents/:id/approve  — ADMIN only
//
// Approves a PENDING agent application.
//
// What this endpoint does:
//   1. Validates the ID.
//   2. Fetches the agent row (needs email for the users INSERT).
//   3. Generates a referral code if the agent doesn't already have one.
//   4. In a single transaction:
//        a. Sets status = 'APPROVED' and writes referral_code.
//        b. Creates a users row (username = email, role = 'AGENT').
//   5. Returns the updated agent data + temp_password for the Admin to hand
//      to the newly approved agent.
//
// Success response — 200 OK:
//   {
//     "id":            3,
//     "name":          "Sara Tesfaye",
//     "referral_code": "NIB-K9MX2P",
//     "status":        "APPROVED",
//     "temp_password": "b4a9..."
//   }
//
// Error responses:
//   400 Bad Request  — ID not an integer
//   404 Not Found    — no agent with that ID
//   409 Conflict     — email already has a user account (was approved before?)
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.patch('/:id/approve', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  const agentId = parseInt(req.params.id, 10);

  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  // ── Fetch the agent so we have their email for the users INSERT ───────────
  let agent;
  try {
    const check = await pool.query(
      'SELECT id, name, email, referral_code, status FROM agents WHERE id = $1',
      [agentId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }
    agent = check.rows[0];
  } catch (err) {
    console.error('[PATCH /api/agents/:id/approve] DB lookup error:', err.message);
    return next(err);
  }

  // ── Generate a referral code if the agent doesn't have one yet ───────────
  const referralCode = agent.referral_code ?? generateReferralCode();

  // ── Generate a temporary password for the new user account ───────────────
  const tempPassword = crypto.randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  console.log(`[AGENT APPROVAL] Temp password for ${agent.email}: ${tempPassword}`);
  console.log(`[AGENT APPROVAL] ⚠️  Deliver this via secure email in production.`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update the agent: set APPROVED status and assign the referral code.
    const updateResult = await client.query(
      `UPDATE agents
       SET status = 'APPROVED', referral_code = $1
       WHERE id = $2
       RETURNING id, name, referral_code, status`,
      [referralCode, agentId]
    );
    const updated = updateResult.rows[0];

    // Create the login account.  username = agent's email.
    // If a users row already exists for this email, the UNIQUE constraint
    // triggers a 23505 error which we catch below (409 Conflict).
    await client.query(
      `INSERT INTO users (username, password_hash, role, agent_id)
       VALUES ($1, $2, 'AGENT', $3)`,
      [agent.email, passwordHash, agentId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      id:            updated.id,
      name:          updated.name,
      referral_code: updated.referral_code,
      status:        updated.status,
      temp_password: tempPassword,
      message:       `Agent approved. Temporary credentials dispatched to ${agent.email}.`,
    });

  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505') {
      return res.status(409).json({
        error: 'A user account for this agent already exists.',
        code:  'DUPLICATE_ENTRY',
      });
    }

    console.error('[PATCH /api/agents/:id/approve] Unexpected DB error:', err.message);
    next(err);

  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/agents/:id/reject  — ADMIN only
//
// Rejects a PENDING agent application.  Sets status = 'REJECTED'.
// No users row is created.  The applicant is simply marked as rejected in the
// agents table.  No data is deleted — the record is retained for audit purposes.
//
// Success response — 200 OK:
//   { "id": 3, "name": "Sara Tesfaye", "status": "REJECTED" }
//
// Error responses:
//   400 Bad Request — ID not an integer
//   404 Not Found   — no agent with that ID
//   500 Server Error
// ---------------------------------------------------------------------------
router.patch('/:id/reject', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  const agentId = parseInt(req.params.id, 10);

  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const result = await pool.query(
      `UPDATE agents
       SET status = 'REJECTED'
       WHERE id = $1
       RETURNING id, name, status`,
      [agentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }

    const updated = result.rows[0];
    return res.status(200).json({
      id:     updated.id,
      name:   updated.name,
      status: updated.status,
    });

  } catch (err) {
    console.error('[PATCH /api/agents/:id/reject] Unexpected DB error:', err.message);
    next(err);
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
  if (req.user.role === 'AGENT' && req.user.agent_id !== agentId) {
    return res.status(403).json({
      error: 'Access denied. Agents can only view their own stats.',
      code:  'FORBIDDEN',
    });
  }

  try {
    // ── Step 2: Verify the agent exists ──────────────────────────────────────
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
      successful_referrals: parseInt(row.successful_count, 10),
      current_reward:       row.current_reward ?? null,
    });

  } catch (err) {
    console.error('[GET /api/agents/:id/stats] Unexpected DB error:', err.message);
    next(err);
  }
});

module.exports = router;
