/**
 * referral-api/routes/agents.js
 * ------------------------------
 * Router for all /api/agents endpoints.
 *
 * Current endpoints:
 *   GET  /api/agents          — List all agents with referral stats and reward tier.
 *   POST /api/agents          — Create a new agent.
 *   GET  /api/agents/:id/stats — Get a single agent's referral count and reward tier.
 *
 * Per RULES.md:
 *   - All inputs are validated server-side before touching the database.
 *   - All queries use parameterized form ($1, $2, ...) — never string concatenation.
 *   - Raw DB errors are never sent to the client.
 */

'use strict';

const express = require('express');
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
router.get('/', async (req, res, next) => {
  try {
    // This single query does everything in one round-trip:
    //
    // 1. For each agent (LEFT JOIN so agents with zero referrals appear too),
    //    COUNT only the referral rows where status = 'SUCCESSFUL'.
    //    The FILTER clause is a conditional aggregate — it counts a row only
    //    when the WHERE condition is true. Equivalent to:
    //      COUNT(CASE WHEN r.status = 'SUCCESSFUL' THEN 1 END)
    //
    // 2. Find the highest qualifying reward tier with a correlated subquery:
    //    MAX(min_referrals) WHERE min_referrals <= successful_count
    //    then LEFT JOIN reward_rules on that threshold to get the reward_name.
    //    LEFT JOIN means the row is still returned with reward_name = NULL
    //    when no tier is met (0 successful referrals).
    //
    // GROUP BY a.id groups one result row per agent so COUNT operates per-agent.
    // ORDER BY a.created_at DESC shows newest agents first.
    // We use a derived table (sub) so that the per-agent SUCCESSFUL count is
    // computed once and can be referenced cleanly in the LEFT JOIN.
    // PostgreSQL does not allow referencing an aggregate from the same SELECT
    // level inside a subquery of that same SELECT, so we must materialise it
    // in an inner query first — identical to the /:id/stats pattern.
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
        GROUP BY a.id, a.name, a.referral_code, a.created_at
      ) sub
      LEFT JOIN reward_rules rr
        ON rr.min_referrals = (
          SELECT MAX(min_referrals)
          FROM   reward_rules
          WHERE  min_referrals <= sub.successful_count
        )
      ORDER BY sub.created_at DESC
    `);

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
// POST /api/agents — ADMIN only: create a new agent.
// authenticateToken verifies the JWT cookie; authorizeRole restricts to ADMIN.
router.post('/', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  // ── Step 1: Extract and trim inputs ────────────────────────────────────────
  // We trim() to reject inputs that are only whitespace (e.g., "   ").
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim();

  // ── Step 2: Validate — all fields are required ────────────────────────────
  // Per RULES.md §3: validate all inputs, return 400 for malformed requests.
  if (!name || !phone || !email) {
    return res.status(400).json({
      error: 'All fields are required: name, phone, email.',
      code: 'MISSING_FIELDS',
    });
  }

  // Basic email format check — keeps obviously wrong values out of the DB.
  if (!email.includes('@')) {
    return res.status(400).json({
      error: 'A valid email address is required.',
      code: 'INVALID_EMAIL',
    });
  }

  // ── Step 3: Generate the referral code ────────────────────────────────────
  const referralCode = generateReferralCode();

  // ── Step 4: Insert into DB using a parameterized query ────────────────────
  // $1, $2, $3, $4 are placeholders. The pg library sends the values separately,
  // so PostgreSQL treats them as data — never as executable SQL.
  // This completely prevents SQL injection attacks.
  const sql = `
    INSERT INTO agents (name, phone, email, referral_code)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, referral_code, created_at
  `;

  try {
    const result = await pool.query(sql, [name, phone, email, referralCode]);
    const newAgent = result.rows[0];

    // 201 Created — standard HTTP code for a successful resource creation.
    return res.status(201).json({
      id:            newAgent.id,
      name:          newAgent.name,
      referral_code: newAgent.referral_code,
      created_at:    newAgent.created_at,
    });

  } catch (err) {
    // ── Step 5: Handle DB constraint violations gracefully ──────────────────
    //
    // PostgreSQL error code '23505' means "unique_violation".
    // This fires when we try to INSERT a phone or email that already exists,
    // because our schema has UNIQUE constraints on both columns.
    //
    // Without this check, the raw pg error would bubble up to the global
    // error handler and be logged, but we'd still return a generic 500.
    // Catching it here lets us return a meaningful 409 Conflict instead.
    if (err.code === '23505') {
      // err.constraint contains the name of the violated constraint
      // (e.g., "agents_phone_key" or "agents_email_key").
      // We use it to tell the user exactly which field is duplicated.
      let field = 'phone or email';
      if (err.constraint && err.constraint.includes('phone')) field = 'phone number';
      if (err.constraint && err.constraint.includes('email')) field = 'email address';
      if (err.constraint && err.constraint.includes('referral_code')) field = 'referral code';

      return res.status(409).json({
        error: `An agent with this ${field} already exists.`,
        code: 'DUPLICATE_ENTRY',
      });
    }

    // For any other unexpected DB error, log it server-side and pass to
    // the global error handler in index.js. The client gets a safe 500.
    console.error('[POST /api/agents] Unexpected DB error:', err.message);
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
