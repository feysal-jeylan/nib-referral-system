/**
 * referral-api/routes/referrals.js
 * ----------------------------------
 * Router for all /api/referrals endpoints.
 *
 * Current endpoints:
 *   GET   /api/referrals           — List all referrals with customer and agent details.
 *   POST  /api/referrals           — Register a new customer referral using an agent's code.
 *   PATCH /api/referrals/:id/status — Update the status of an existing referral.
 *
 * Per RULES.md:
 *   - All inputs are validated server-side before touching the database.
 *   - All queries use parameterized form ($1, $2, ...) — never string concatenation.
 *   - Raw DB errors are never sent to the client.
 *   - Multi-table writes are wrapped in a transaction (BEGIN / COMMIT / ROLLBACK).
 */

'use strict';

const express = require('express');
const pool    = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/referrals
// Return all referrals joined with customer and agent details.
//
// Success response — 200 OK (array, newest first):
//   [
//     {
//       "id":              7,
//       "customer_name":   "Tigist Alemu",
//       "customer_phone":  "0922345678",
//       "agent_name":      "Abebe Kebede",
//       "referral_code":   "NIB-X7KP2A",
//       "status":          "PENDING",
//       "created_at":      "2026-10-25T08:00:00.000Z"
//     },
//     ...
//   ]
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    // JOIN all three tables in one query so the frontend gets everything
    // it needs without making additional requests.
    // LEFT JOIN on agents is defensive: if an agent were somehow deleted
    // (which our FK RESTRICT should prevent), the referral row still appears.
    const result = await pool.query(`
      SELECT
        r.id,
        c.name        AS customer_name,
        c.phone       AS customer_phone,
        a.name        AS agent_name,
        a.referral_code,
        r.status,
        r.created_at
      FROM   referrals r
      JOIN   customers c ON c.id = r.customer_id
      JOIN   agents    a ON a.id = r.agent_id
      ORDER  BY r.created_at DESC
    `);

    return res.status(200).json(result.rows);

  } catch (err) {
    console.error('[GET /api/referrals] Unexpected DB error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/referrals
// Register a new customer referral for a given agent referral code.
//
// Request body (JSON):
//   {
//     "referral_code":  "NIB-A1B2C3",
//     "customer_name":  "Tigist Alemu",
//     "customer_phone": "0922345678"
//   }
//
// Success response — 201 Created:
//   {
//     "referral_id":   7,
//     "agent_id":      3,
//     "customer_id":   12,
//     "customer_name": "Tigist Alemu",
//     "status":        "PENDING",
//     "created_at":    "2026-10-25T08:00:00.000Z"
//   }
//
// Error responses:
//   400 Bad Request  — missing referral_code, customer_name, or customer_phone
//   404 Not Found    — referral_code does not match any agent in the DB
//   409 Conflict     — customer phone number is already registered (PG code 23505)
//   500 Server Error — unexpected DB failure (details logged server-side only)
// ---------------------------------------------------------------------------
// POST /api/referrals — ADMIN only: register a new customer referral.
router.post('/', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  // ── Step 1: Extract and trim inputs ──────────────────────────────────────
  // Trimming rejects whitespace-only values (e.g. "   " is treated as empty).
  const referralCode  = req.body.referral_code?.trim();
  const customerName  = req.body.customer_name?.trim();
  const customerPhone = req.body.customer_phone?.trim();

  // ── Step 2: Validate — all three fields are required ─────────────────────
  // Per RULES.md §3: validate all inputs, return 400 for malformed requests.
  if (!referralCode || !customerName || !customerPhone) {
    return res.status(400).json({
      error: 'All fields are required: referral_code, customer_name, customer_phone.',
      code:  'MISSING_FIELDS',
    });
  }

  // ── Step 3: Look up the agent by referral_code ────────────────────────────
  // We do this BEFORE opening a transaction — no point starting one if the
  // code does not exist. A parameterized query prevents SQL injection.
  let agent;
  try {
    const agentResult = await pool.query(
      'SELECT id FROM agents WHERE referral_code = $1',
      [referralCode]
    );

    if (agentResult.rows.length === 0) {
      // The code exists nowhere in the agents table — invalid.
      return res.status(404).json({
        error: 'Invalid referral code.',
        code:  'AGENT_NOT_FOUND',
      });
    }

    agent = agentResult.rows[0]; // { id: 3 }

  } catch (err) {
    console.error('[POST /api/referrals] Error looking up agent:', err.message);
    return next(err);
  }

  // ── Step 4: Open a database transaction ──────────────────────────────────
  //
  // WHY A TRANSACTION?
  // We are writing to TWO tables (customers, referrals). If the first INSERT
  // succeeds but the second one fails, we would end up with an orphaned
  // customer row and no corresponding referral — a corrupt data state.
  //
  // A transaction wraps both INSERTs into one all-or-nothing unit of work:
  //
  //   BEGIN     — marks the start; the DB enters a "draft" state.
  //   COMMIT    — makes all changes permanent if everything succeeded.
  //   ROLLBACK  — undoes ALL changes back to the point of BEGIN if anything fails.
  //
  // HOW pg HANDLES THIS:
  // pool.query() uses a different connection each time, so it cannot maintain
  // transaction state across calls. Instead, we must acquire a dedicated
  // *client* from the pool with pool.connect(). All commands (BEGIN, the two
  // INSERTs, COMMIT / ROLLBACK) are sent through that same client, keeping
  // them on the same server connection — which PostgreSQL requires to honour
  // a transaction boundary.
  //
  // CRITICAL: We must call client.release() in the finally block, no matter
  // what happens. If we forget, that connection is permanently "checked out"
  // and the pool silently shrinks — eventually starving the server of DB connections.

  const client = await pool.connect(); // Acquire a dedicated connection from the pool.

  try {
    // ── BEGIN ──────────────────────────────────────────────────────────────
    await client.query('BEGIN');

    // ── INSERT 1: customers ────────────────────────────────────────────────
    // RETURNING gives us the auto-generated id without a second SELECT query.
    const customerResult = await client.query(
      `INSERT INTO customers (name, phone)
       VALUES ($1, $2)
       RETURNING id, name, created_at`,
      [customerName, customerPhone]
    );
    const newCustomer = customerResult.rows[0]; // { id, name, created_at }

    // ── INSERT 2: referrals ────────────────────────────────────────────────
    // Links the agent to the newly created customer. Status defaults to
    // 'PENDING' via the schema DEFAULT, but we set it explicitly for clarity.
    const referralResult = await client.query(
      `INSERT INTO referrals (agent_id, customer_id, status)
       VALUES ($1, $2, 'PENDING')
       RETURNING id, agent_id, customer_id, status, created_at`,
      [agent.id, newCustomer.id]
    );
    const newReferral = referralResult.rows[0];

    // ── COMMIT ─────────────────────────────────────────────────────────────
    // Both INSERTs succeeded — make all changes permanent.
    await client.query('COMMIT');

    // Return the combined referral details to the caller.
    return res.status(201).json({
      referral_id:   newReferral.id,
      agent_id:      newReferral.agent_id,
      customer_id:   newReferral.customer_id,
      customer_name: newCustomer.name,
      status:        newReferral.status,
      created_at:    newReferral.created_at,
    });

  } catch (err) {
    // ── ROLLBACK ───────────────────────────────────────────────────────────
    // Something went wrong inside the transaction. Roll back ALL changes so
    // the database stays in a consistent state (no orphaned customer rows).
    await client.query('ROLLBACK');

    // ── Handle duplicate phone (PostgreSQL error code 23505) ───────────────
    //
    // Our customers table has a UNIQUE constraint on phone. If someone tries
    // to register a phone number already in the DB, PostgreSQL throws error
    // code '23505' (unique_violation). We catch it here and return a
    // meaningful 409 Conflict instead of leaking a raw DB error to the client.
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Customer with this phone number already exists.',
        code:  'DUPLICATE_PHONE',
      });
    }

    // For any other unexpected error, log server-side and pass to the global
    // error handler in index.js. The client gets a safe 500 response.
    console.error('[POST /api/referrals] Unexpected DB error:', err.message);
    next(err);

  } finally {
    // ── ALWAYS release the client back to the pool ─────────────────────────
    // This runs whether we committed, rolled back, or threw an error.
    // Without this, the pool leaks connections and will eventually hang.
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/referrals/:id/status
// Update the status of an existing referral.
//
// URL parameter:
//   :id  — the integer primary key of the referral row to update.
//
// Request body (JSON):
//   { "status": "SUCCESSFUL" }   or   { "status": "REJECTED" }
//
// Success response — 200 OK:
//   {
//     "referral_id": 7,
//     "agent_id":    3,
//     "customer_id": 12,
//     "status":      "SUCCESSFUL",
//     "created_at":  "2026-10-25T08:00:00.000Z"
//   }
//
// Error responses:
//   400 Bad Request — status is missing or not one of the allowed values
//   404 Not Found   — no referral row exists with the given :id
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
// PATCH /api/referrals/:id/status — ADMIN only: update a referral's status.
router.patch('/:id/status', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  // ── Step 1: Parse and validate the URL parameter ──────────────────────────
  // parseInt() converts the string ':id' from the URL into an integer.
  // If the user passes something like '/abc/status', parseInt returns NaN,
  // which we catch immediately to avoid passing garbage to the DB.
  const referralId = parseInt(req.params.id, 10);

  if (isNaN(referralId)) {
    return res.status(400).json({
      error: 'Referral ID must be a valid integer.',
      code:  'INVALID_ID',
    });
  }

  // ── Step 2: Validate the status value ────────────────────────────────────
  //
  // Our schema has a CHECK constraint that only allows 'PENDING', 'SUCCESSFUL',
  // or 'REJECTED'. We also whitelist at the application layer for two reasons:
  //   1. It lets us return a clear 400 instead of a raw constraint-violation error.
  //   2. It keeps the API contract explicit — callers cannot set status to 'PENDING'
  //      (that is set automatically on creation).
  //
  // Using an array + includes() makes it trivial to add more statuses later.
  const ALLOWED_STATUSES = ['SUCCESSFUL', 'REJECTED'];
  const status = req.body.status?.trim().toUpperCase();

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}.`,
      code:  'INVALID_STATUS',
    });
  }

  // ── Step 3: Run the UPDATE query ─────────────────────────────────────────
  //
  // UPDATE ... WHERE id = $2 — we only touch the one row identified by :id.
  // RETURNING lets us send the full updated record back in one round-trip,
  // without needing a second SELECT.
  //
  // This is a single-table write, so no transaction is needed here.
  try {
    const result = await pool.query(
      `UPDATE referrals
       SET    status = $1
       WHERE  id     = $2
       RETURNING id, agent_id, customer_id, status, created_at`,
      [status, referralId]
    );

    // ── Step 4: Check if the row actually existed ─────────────────────────
    //
    // If rowCount === 0, the UPDATE ran successfully but matched no rows —
    // meaning there is no referral with that id. We return 404, not 500.
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: `Referral with id ${referralId} not found.`,
        code:  'REFERRAL_NOT_FOUND',
      });
    }

    const updated = result.rows[0];

    return res.status(200).json({
      referral_id: updated.id,
      agent_id:    updated.agent_id,
      customer_id: updated.customer_id,
      status:      updated.status,
      created_at:  updated.created_at,
    });

  } catch (err) {
    console.error('[PATCH /api/referrals/:id/status] Unexpected DB error:', err.message);
    next(err);
  }
});

module.exports = router;
