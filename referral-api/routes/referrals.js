/**
 * referral-api/routes/referrals.js
 * ----------------------------------
 * Router for all /api/referrals endpoints.
 *
 * V2 Architecture (approved by supervisor — RULES.md §6):
 *   Customers are NO LONGER registered manually through this API.
 *   All customer referrals arrive exclusively via the Temenos webhook
 *   (POST /api/integration/account-opened). The POST /api/referrals route
 *   has been permanently removed in this commit.
 *
 * Remaining endpoints:
 *   GET   /api/referrals            — List referrals (ADMIN: all, AGENT: own only).
 *   PATCH /api/referrals/:id/status — Approve or reject a referral (ADMIN only).
 *
 * Per RULES.md §2 & §3:
 *   - All queries use parameterized form ($1, $2, ...) — never string concatenation.
 *   - Raw DB errors are never sent to the client.
 *   - All inputs are validated server-side before touching the database.
 */

'use strict';

const express = require('express');
const pool    = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/referrals — requires authentication (any role).
//
// RBAC filtering:
//   ADMIN  → returns ALL referrals.
//   AGENT  → returns ONLY referrals where agent_id = req.user.agent_id.
//
// `customer_name` and `customer_phone` are columns directly on the referrals
// table (denormalized in the V4 migration — customers table is gone).
// We still JOIN agents to surface `agent_name` and `referral_code`.
// LEFT JOIN is defensive: if an agent were somehow removed, referral rows
// still appear rather than disappearing silently.
//
// Pagination per RULES.md §7:
//   ?page=1&limit=20   (defaults: page=1, limit=20, max limit=100)
//
// Success response — 200 OK:
//   {
//     "total": 42,
//     "page": 1,
//     "limit": 20,
//     "referrals": [
//       {
//         "id":             7,
//         "customer_name":  "Tigist Alemu",
//         "customer_phone": "0922345678",
//         "agent_name":     "Abebe Kebede",
//         "referral_code":  "NIB-X7KP2A",
//         "status":         "PENDING",
//         "created_at":     "2026-10-25T08:00:00.000Z"
//       },
//       ...
//     ]
//   }
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    // ── Pagination ────────────────────────────────────────────────────────────
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // ── RBAC: build the WHERE clause based on the caller's role ────────────
    //
    // ADMIN  → agentFilter = '' (no restriction), countParams / queryParams = []
    // AGENT  → agentFilter uses $1, all param arrays are prefilled with agent_id
    //
    // The agent_id is always passed as a parameter — never interpolated —
    // per RULES.md §2 "Never use string concatenation for SQL queries."
    let agentFilter = '';
    const countParams = [];
    const queryParams = [];

    if (req.user.role === 'AGENT') {
      countParams.push(req.user.agent_id);
      agentFilter = 'WHERE r.agent_id = $1';
      // For the main query, agent_id is $1, limit is $2, offset is $3
      queryParams.push(req.user.agent_id);
    }

    // ── Total count (for frontend paginator) ──────────────────────────────
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM referrals r ${agentFilter}`,
      countParams
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // ── Positional parameter indices for LIMIT / OFFSET ───────────────────
    // If AGENT: $1 = agent_id, $2 = limit, $3 = offset
    // If ADMIN: $1 = limit,    $2 = offset
    const limitIdx  = queryParams.length + 1;
    const offsetIdx = queryParams.length + 2;
    queryParams.push(limit, offset);

    // ── Main query ────────────────────────────────────────────────────────
    const result = await pool.query(
      `SELECT
         r.id,
         r.customer_name,
         r.customer_phone,
         a.name          AS agent_name,
         a.referral_code,
         r.status,
         r.created_at
       FROM   referrals r
       LEFT JOIN agents a ON a.id = r.agent_id
       ${agentFilter}
       ORDER  BY r.created_at DESC
       LIMIT  $${limitIdx} OFFSET $${offsetIdx}`,
      queryParams
    );

    return res.status(200).json({
      total,
      page,
      limit,
      referrals: result.rows,
    });

  } catch (err) {
    console.error('[GET /api/referrals] Unexpected DB error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/referrals/:id/status — ADMIN only: approve or reject a referral.
//
// URL parameter:
//   :id  — the integer primary key of the referral row to update.
//
// Request body (JSON):
//   { "status": "SUCCESSFUL" }   or   { "status": "REJECTED" }
//
// Callers CANNOT set status back to 'PENDING' — that is set automatically
// by the integration webhook and represents the un-reviewed state.
//
// Success response — 200 OK:
//   {
//     "referral_id":    7,
//     "agent_id":       3,
//     "customer_name":  "Tigist Alemu",
//     "customer_phone": "0922345678",
//     "status":         "SUCCESSFUL",
//     "created_at":     "2026-10-25T08:00:00.000Z"
//   }
//
// Error responses:
//   400 Bad Request — status is missing or not one of the allowed values
//   400 Bad Request — :id is not a valid integer
//   404 Not Found   — no referral row exists with the given :id
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.patch('/:id/status', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  // ── Step 1: Parse and validate the URL parameter ──────────────────────────
  // parseInt() converts the string ':id' from the URL into an integer.
  // If the user passes something non-numeric, parseInt returns NaN —
  // we catch it immediately to avoid passing garbage to the DB.
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
  // or 'REJECTED'. We also whitelist at the application layer so we can:
  //   1. Return a clear 400 instead of a raw constraint-violation DB error.
  //   2. Explicitly block setting status back to 'PENDING' via this endpoint.
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
  // Single-table write — no transaction needed.
  // RETURNING gives us the full updated row without a second SELECT round-trip.
  try {
    const result = await pool.query(
      `UPDATE referrals
       SET    status = $1
       WHERE  id     = $2
       RETURNING id, agent_id, customer_name, customer_phone, status, created_at`,
      [status, referralId]
    );

    // ── Step 4: 404 if the row didn't exist ───────────────────────────────
    // rowCount === 0 means the UPDATE matched nothing — the id doesn't exist.
    // This is a 404, not a 500.
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: `Referral with id ${referralId} not found.`,
        code:  'REFERRAL_NOT_FOUND',
      });
    }

    const updated = result.rows[0];

    return res.status(200).json({
      referral_id:    updated.id,
      agent_id:       updated.agent_id,
      customer_name:  updated.customer_name,
      customer_phone: updated.customer_phone,
      status:         updated.status,
      created_at:     updated.created_at,
    });

  } catch (err) {
    console.error('[PATCH /api/referrals/:id/status] Unexpected DB error:', err.message);
    next(err);
  }
});

module.exports = router;
