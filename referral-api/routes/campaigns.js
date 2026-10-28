/**
 * referral-api/routes/campaigns.js
 * ----------------------------------
 * Router for all /api/campaigns endpoints.
 *
 * All routes in this file require:
 *   1. authenticateToken  — a valid, unexpired JWT in the HttpOnly cookie.
 *   2. authorizeRole(['ADMIN']) — caller must be an ADMIN. AGENTs are blocked
 *      with 403 Forbidden. Campaigns are an admin-only configuration concern.
 *
 * Endpoints:
 *   POST  /api/campaigns              — Create a new campaign (status = 'DRAFT')
 *   POST  /api/campaigns/:id/rules    — Add a qualification rule to a campaign
 *   PATCH /api/campaigns/:id/activate — Transition campaign from DRAFT → ACTIVE
 *   GET   /api/campaigns              — List all campaigns with their rules (paginated)
 *
 * Per RULES.md §3 & §7:
 *   - All inputs validated before touching the DB.
 *   - All queries use parameterized form ($1, $2, ...) — NEVER string concat.
 *   - Raw DB errors are never sent to the client.
 *   - GET endpoints support pagination (?page=1&limit=20).
 */

'use strict';

const express = require('express');
const pool    = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Convenience shorthand — every campaign route is ADMIN-only.
const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];


// ---------------------------------------------------------------------------
// POST /api/campaigns
// Create a new campaign. Status always starts as 'DRAFT' — it must be
// explicitly activated via PATCH /:id/activate once the admin is ready.
//
// Request body:
//   { name, start_date, end_date, reward_type, reward_value }
//
// Success response — 201 Created:
//   { campaign: { id, name, start_date, end_date, reward_type, reward_value,
//                 status, created_at } }
//
// Error responses:
//   400 Bad Request  — missing or invalid fields
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.post('/', ...adminOnly, async (req, res, next) => {
  try {
    const { name, start_date, end_date, reward_type, reward_value } = req.body;

    // ── Input Validation ─────────────────────────────────────────────────────
    // All five fields are required. We check for truthiness to catch both
    // missing keys (undefined) and empty strings ('').
    const missing = [];
    if (!name)         missing.push('name');
    if (!start_date)   missing.push('start_date');
    if (!end_date)     missing.push('end_date');
    if (!reward_type)  missing.push('reward_type');
    if (!reward_value) missing.push('reward_value');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}.`,
        code:  'MISSING_FIELDS',
      });
    }

    // Validate that start_date and end_date are parseable dates.
    const start = new Date(start_date);
    const end   = new Date(end_date);

    if (isNaN(start.getTime())) {
      return res.status(400).json({
        error: 'Invalid start_date. Use ISO 8601 format (e.g., 2026-11-01T00:00:00Z).',
        code:  'INVALID_START_DATE',
      });
    }
    if (isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid end_date. Use ISO 8601 format (e.g., 2026-12-31T23:59:59Z).',
        code:  'INVALID_END_DATE',
      });
    }
    if (end <= start) {
      return res.status(400).json({
        error: 'end_date must be after start_date.',
        code:  'INVALID_DATE_RANGE',
      });
    }

    // ── Database Insert ───────────────────────────────────────────────────────
    // Status is NOT accepted from the request body — it is always forced to
    // 'DRAFT' here. This prevents a caller from creating an already-ACTIVE
    // campaign, bypassing the activation step (and any future pre-activation
    // checks we may add).
    const result = await pool.query(
      `INSERT INTO campaigns (name, start_date, end_date, reward_type, reward_value, status)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT')
       RETURNING id, name, start_date, end_date, reward_type, reward_value, status, created_at`,
      [name, start, end, reward_type, reward_value]
    );

    return res.status(201).json({ campaign: result.rows[0] });

  } catch (err) {
    // Pass unexpected errors to the global error handler in index.js,
    // which logs the full stack and sends a safe 500 to the client.
    next(err);
  }
});


// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/rules
// Add a qualification rule to an existing campaign.
//
// Rules are stored as JSONB so we can support any structure without future
// schema changes. Examples:
//   rule_type = 'MIN_DEPOSIT',   rule_value = { "amount": 5000, "currency": "ETB" }
//   rule_type = 'ACCOUNT_TYPE',  rule_value = { "type": "SAVINGS" }
//   rule_type = 'BRANCH_REGION', rule_value = { "region": "Addis Ababa" }
//
// Request body:
//   { rule_type, rule_value }   — rule_value must be a JSON object/array, not a scalar.
//
// Success response — 201 Created:
//   { rule: { id, campaign_id, rule_type, rule_value } }
//
// Error responses:
//   400 Bad Request  — missing fields or non-object rule_value
//   404 Not Found    — campaign_id does not exist
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.post('/:id/rules', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({
        error: 'Campaign ID must be a number.',
        code:  'INVALID_CAMPAIGN_ID',
      });
    }

    const { rule_type, rule_value } = req.body;

    // ── Input Validation ─────────────────────────────────────────────────────
    if (!rule_type) {
      return res.status(400).json({
        error: 'Missing required field: rule_type.',
        code:  'MISSING_FIELDS',
      });
    }
    // rule_value must be provided and must be a JSON object/array (not a primitive).
    // We store it as JSONB; sending a plain string like "hello" would be misleading.
    if (rule_value === undefined || rule_value === null) {
      return res.status(400).json({
        error: 'Missing required field: rule_value.',
        code:  'MISSING_FIELDS',
      });
    }
    if (typeof rule_value !== 'object') {
      return res.status(400).json({
        error: 'rule_value must be a JSON object or array, not a scalar.',
        code:  'INVALID_RULE_VALUE',
      });
    }

    // ── Verify campaign exists ────────────────────────────────────────────────
    // We check this explicitly so we can return a clear 404 rather than a
    // cryptic FK violation error from the DB.
    const campaignCheck = await pool.query(
      'SELECT id, name, status FROM campaigns WHERE id = $1',
      [campaignId]
    );
    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        error: `Campaign with id ${campaignId} not found.`,
        code:  'CAMPAIGN_NOT_FOUND',
      });
    }

    // ── Database Insert ───────────────────────────────────────────────────────
    // pg automatically serializes a JS object to a JSONB-compatible string
    // when the column type is JSONB. We pass rule_value as-is.
    const result = await pool.query(
      `INSERT INTO campaign_rules (campaign_id, rule_type, rule_value)
       VALUES ($1, $2, $3)
       RETURNING id, campaign_id, rule_type, rule_value`,
      [campaignId, rule_type, rule_value]
    );

    return res.status(201).json({ rule: result.rows[0] });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// PATCH /api/campaigns/:id/activate
// Transition a campaign from 'DRAFT' → 'ACTIVE'.
//
// WHY A DEDICATED ENDPOINT (not just PATCH /campaigns/:id with { status })?
//   - State transitions in a banking context must be explicit and auditable.
//   - A future version will add pre-activation checks here (e.g., "must have
//     at least one rule", "dates must not overlap another ACTIVE campaign").
//   - The DB CHECK constraint already prevents invalid status values, but this
//     endpoint also prevents backwards transitions (EXPIRED → ACTIVE).
//
// Success response — 200 OK:
//   { campaign: { id, name, status: 'ACTIVE', ... } }
//
// Error responses:
//   400 Bad Request — campaign is not in 'DRAFT' status
//   404 Not Found   — campaign_id does not exist
//   500 Server Error
// ---------------------------------------------------------------------------
router.patch('/:id/activate', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({
        error: 'Campaign ID must be a number.',
        code:  'INVALID_CAMPAIGN_ID',
      });
    }

    // ── Fetch current state ───────────────────────────────────────────────────
    const campaignCheck = await pool.query(
      'SELECT id, name, status FROM campaigns WHERE id = $1',
      [campaignId]
    );
    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        error: `Campaign with id ${campaignId} not found.`,
        code:  'CAMPAIGN_NOT_FOUND',
      });
    }

    const campaign = campaignCheck.rows[0];

    // ── Guard: only DRAFT campaigns can be activated ──────────────────────────
    // This enforces the DRAFT → ACTIVE one-way transition.
    // An already-ACTIVE campaign cannot be re-activated (idempotent but harmless).
    // An EXPIRED campaign cannot be brought back to ACTIVE (business rule).
    if (campaign.status !== 'DRAFT') {
      return res.status(400).json({
        error: `Campaign "${campaign.name}" is already '${campaign.status}'. Only 'DRAFT' campaigns can be activated.`,
        code:  'INVALID_STATUS_TRANSITION',
      });
    }

    // ── Activate ──────────────────────────────────────────────────────────────
    const result = await pool.query(
      `UPDATE campaigns
       SET status = 'ACTIVE'
       WHERE id = $1
       RETURNING id, name, start_date, end_date, reward_type, reward_value, status, created_at`,
      [campaignId]
    );

    return res.status(200).json({ campaign: result.rows[0] });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// GET /api/campaigns
// List all campaigns with their rules aggregated as a JSON array.
//
// Using json_agg + json_build_object so each campaign row already contains
// its rules array — no N+1 query problem, no extra round-trips.
//
// Supports pagination per RULES.md §7:
//   ?page=1&limit=20   (defaults: page=1, limit=20)
//
// Success response — 200 OK:
//   {
//     "total": 5,
//     "page": 1,
//     "limit": 20,
//     "campaigns": [
//       {
//         "id": 1,
//         "name": "Q4 Savings Drive",
//         "status": "ACTIVE",
//         "rules": [
//           { "id": 1, "rule_type": "MIN_DEPOSIT", "rule_value": { "amount": 5000 } }
//         ]
//       },
//       ...
//     ]
//   }
//
// Error responses:
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.get('/', ...adminOnly, async (req, res, next) => {
  try {
    // ── Pagination ────────────────────────────────────────────────────────────
    // parseInt with base 10 and a fallback for non-numeric or missing values.
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // ── Total count (for the frontend paginator) ──────────────────────────────
    const countResult = await pool.query('SELECT COUNT(*) AS total FROM campaigns');
    const total = parseInt(countResult.rows[0].total, 10);

    // ── Main query: campaigns + aggregated rules ───────────────────────────────
    // LEFT JOIN: campaigns with zero rules still appear (rules = []).
    // json_agg with FILTER (WHERE cr.id IS NOT NULL) prevents [null] in the
    //   rules array when a campaign has no rules yet.
    // ORDER BY c.created_at DESC: newest campaign first.
    // LIMIT / OFFSET: applied to campaigns (not to the join rows) via subquery
    //   or by letting PostgreSQL handle grouping before pagination.
    //
    // Note on parameterized LIMIT/OFFSET:
    //   We pass $1 and $2 as parameters — never interpolated into the string —
    //   per RULES.md §2 "Never use string concatenation for SQL queries."
    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.start_date,
         c.end_date,
         c.reward_type,
         c.reward_value,
         c.status,
         c.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id',         cr.id,
               'rule_type',  cr.rule_type,
               'rule_value', cr.rule_value
             ) ORDER BY cr.id
           ) FILTER (WHERE cr.id IS NOT NULL),
           '[]'
         ) AS rules
       FROM campaigns c
       LEFT JOIN campaign_rules cr ON cr.campaign_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.status(200).json({
      total,
      page,
      limit,
      campaigns: result.rows,
    });

  } catch (err) {
    next(err);
  }
});


module.exports = router;
