/**
 * referral-api/routes/agents.js
 * ------------------------------
 * Router for all /api/agents endpoints.
 *
 * Current endpoints:
 *   POST /api/agents  — Create a new agent (this file handles the path after /api/agents)
 *
 * Per RULES.md:
 *   - All inputs are validated server-side before touching the database.
 *   - All queries use parameterized form ($1, $2, ...) — never string concatenation.
 *   - Raw DB errors are never sent to the client.
 */

'use strict';

const express = require('express');
const pool    = require('../db');

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
router.post('/', async (req, res, next) => {
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

module.exports = router;
