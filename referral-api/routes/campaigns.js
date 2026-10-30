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
 *   DELETE /api/campaigns/:id/rules/:ruleId — Remove a rule from a campaign
 *   PATCH /api/campaigns/:id/activate — Transition campaign from DRAFT → ACTIVE
 *   GET   /api/campaigns              — List all campaigns with their rules (paginated)
 *   GET   /api/campaigns/:id/stats    — Referral count for a single campaign
 *
 * V6 additions per Task 4:
 *   - POST /api/campaigns now accepts: description, reward_threshold
 *   - POST /api/campaigns/:id/rules now accepts: operator
 *   - GET  /api/campaigns now returns: description, reward_threshold, is_active,
 *     and operator inside each rule object
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

// Valid operator values (must match CHECK constraint in schema_v6_rule_engine.sql)
const VALID_OPERATORS = [
  'GREATER_THAN',
  'LESS_THAN',
  'EQUALS',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN_OR_EQUAL',
  'NOT_EQUALS',
];

// Valid rule types supported by the rule engine (services/ruleEngine.js)
const VALID_RULE_TYPES = ['MIN_DEPOSIT', 'ACCOUNT_TYPE'];


// ---------------------------------------------------------------------------
// POST /api/campaigns
// Create a new campaign. Status always starts as 'DRAFT' — it must be
// explicitly activated via PATCH /:id/activate once the admin is ready.
//
// Request body:
//   {
//     name, start_date, end_date, reward_type, reward_value,
//     description?,       // optional text summary
//     reward_threshold?   // optional integer min referrals
//   }
//
// Success response — 201 Created:
//   { campaign: { id, name, description, start_date, end_date, reward_type,
//                 reward_value, reward_threshold, is_active, status, created_at } }
//
// Error responses:
//   400 Bad Request  — missing or invalid fields
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.post('/', ...adminOnly, async (req, res, next) => {
  try {
    const {
      name,
      start_date,
      end_date,
      reward_type,
      reward_value,
      description,       // optional
      reward_threshold,  // optional integer
    } = req.body;

    // ── Input Validation ─────────────────────────────────────────────────────
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

    // reward_threshold, if provided, must be a positive integer.
    const threshold = reward_threshold != null ? parseInt(reward_threshold, 10) : null;
    if (reward_threshold != null && (isNaN(threshold) || threshold < 0)) {
      return res.status(400).json({
        error: 'reward_threshold must be a non-negative integer.',
        code:  'INVALID_REWARD_THRESHOLD',
      });
    }

    // ── Database Insert ───────────────────────────────────────────────────────
    const result = await pool.query(
      `INSERT INTO campaigns
         (name, description, start_date, end_date, reward_type, reward_value,
          reward_threshold, is_active, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 'DRAFT')
       RETURNING id, name, description, start_date, end_date, reward_type, reward_value,
                 reward_threshold, is_active, status, created_at`,
      [name, description ?? null, start, end, reward_type, reward_value, threshold]
    );

    return res.status(201).json({ campaign: result.rows[0] });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/rules
// Add a qualification rule to an existing campaign.
//
// V6 update: now also accepts `operator` (required).
//
// Supported rule_types: MIN_DEPOSIT, ACCOUNT_TYPE
// Supported operators:  GREATER_THAN, LESS_THAN, EQUALS,
//                       GREATER_THAN_OR_EQUAL, LESS_THAN_OR_EQUAL, NOT_EQUALS
//
// Request body:
//   {
//     rule_type,   // 'MIN_DEPOSIT' | 'ACCOUNT_TYPE'
//     operator,    // one of VALID_OPERATORS
//     rule_value   // JSON object: { "amount": 5000 } or { "type": "SAVINGS" }
//   }
//
// Success response — 201 Created:
//   { rule: { id, campaign_id, rule_type, operator, rule_value } }
//
// Error responses:
//   400 Bad Request  — missing fields, invalid operator, non-object rule_value
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

    const { rule_type, operator, rule_value } = req.body;

    // ── Input Validation ─────────────────────────────────────────────────────
    if (!rule_type) {
      return res.status(400).json({
        error: 'Missing required field: rule_type.',
        code:  'MISSING_FIELDS',
      });
    }

    if (!VALID_RULE_TYPES.includes(rule_type)) {
      return res.status(400).json({
        error: `Invalid rule_type "${rule_type}". Valid values: ${VALID_RULE_TYPES.join(', ')}.`,
        code:  'INVALID_RULE_TYPE',
      });
    }

    // operator is required in V6
    if (!operator) {
      return res.status(400).json({
        error: 'Missing required field: operator.',
        code:  'MISSING_FIELDS',
      });
    }

    if (!VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({
        error: `Invalid operator "${operator}". Valid values: ${VALID_OPERATORS.join(', ')}.`,
        code:  'INVALID_OPERATOR',
      });
    }

    if (rule_value === undefined || rule_value === null) {
      return res.status(400).json({
        error: 'Missing required field: rule_value.',
        code:  'MISSING_FIELDS',
      });
    }
    if (typeof rule_value !== 'object' || Array.isArray(rule_value)) {
      return res.status(400).json({
        error: 'rule_value must be a JSON object (e.g., { "amount": 5000 }).',
        code:  'INVALID_RULE_VALUE',
      });
    }

    // ── Verify campaign exists ────────────────────────────────────────────────
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
    const result = await pool.query(
      `INSERT INTO campaign_rules (campaign_id, rule_type, operator, rule_value)
       VALUES ($1, $2, $3, $4)
       RETURNING id, campaign_id, rule_type, operator, rule_value`,
      [campaignId, rule_type, operator, rule_value]
    );

    return res.status(201).json({ rule: result.rows[0] });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/campaigns/:id/rules/:ruleId
// Remove a single rule from a campaign.
//
// Allows the Admin to correct a mistakenly added rule in the Rules Builder UI
// without having to recreate the entire campaign.
//
// Success response — 200 OK:
//   { message: "Rule deleted." }
//
// Error responses:
//   400 Bad Request — invalid campaign or rule id
//   404 Not Found   — rule does not exist for this campaign
//   500 Server Error
// ---------------------------------------------------------------------------
router.delete('/:id/rules/:ruleId', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const ruleId     = parseInt(req.params.ruleId, 10);

    if (isNaN(campaignId) || isNaN(ruleId)) {
      return res.status(400).json({
        error: 'Campaign ID and Rule ID must be valid integers.',
        code:  'INVALID_ID',
      });
    }

    const result = await pool.query(
      `DELETE FROM campaign_rules
       WHERE id = $1 AND campaign_id = $2
       RETURNING id`,
      [ruleId, campaignId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: `Rule ${ruleId} not found for campaign ${campaignId}.`,
        code:  'RULE_NOT_FOUND',
      });
    }

    return res.status(200).json({ message: 'Rule deleted.' });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// PATCH /api/campaigns/:id/activate
// Transition a campaign from 'DRAFT' → 'ACTIVE'.
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

    if (campaign.status !== 'DRAFT') {
      return res.status(400).json({
        error: `Campaign "${campaign.name}" is already '${campaign.status}'. Only 'DRAFT' campaigns can be activated.`,
        code:  'INVALID_STATUS_TRANSITION',
      });
    }

    const result = await pool.query(
      `UPDATE campaigns
       SET status = 'ACTIVE'
       WHERE id = $1
       RETURNING id, name, description, start_date, end_date, reward_type, reward_value,
                 reward_threshold, is_active, status, created_at`,
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
// V6 update: includes description, reward_threshold, is_active in campaign rows
// and operator inside each rule object.
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
//         "id": 1, "name": "Q4 Savings Drive", "status": "ACTIVE",
//         "description": "...", "reward_threshold": 5, "is_active": true,
//         "rules": [
//           { "id": 1, "rule_type": "MIN_DEPOSIT", "operator": "GREATER_THAN_OR_EQUAL",
//             "rule_value": { "amount": 5000 } }
//         ]
//       }
//     ]
//   }
// ---------------------------------------------------------------------------
router.get('/', ...adminOnly, async (req, res, next) => {
  try {
    // ── Pagination ────────────────────────────────────────────────────────────
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM campaigns');
    const total = parseInt(countResult.rows[0].total, 10);

    // ── Main query: campaigns + aggregated rules ───────────────────────────────
    // json_agg FILTER (WHERE cr.id IS NOT NULL) prevents [null] when no rules exist.
    // operator is now included in the rule JSON object.
    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.start_date,
         c.end_date,
         c.reward_type,
         c.reward_value,
         c.reward_threshold,
         c.is_active,
         c.status,
         c.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id',         cr.id,
               'rule_type',  cr.rule_type,
               'operator',   cr.operator,
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


// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/stats
// Return aggregate statistics for a single campaign.
//
// Success response — 200 OK:
//   { "campaign_id": 1, "total_referrals": 42 }
// ---------------------------------------------------------------------------
router.get('/:id/stats', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({
        error: 'Campaign ID must be a number.',
        code:  'INVALID_CAMPAIGN_ID',
      });
    }

    const campaignCheck = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1',
      [campaignId]
    );
    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        error: `Campaign with id ${campaignId} not found.`,
        code:  'CAMPAIGN_NOT_FOUND',
      });
    }

    const statsResult = await pool.query(
      'SELECT COUNT(*) AS total_referrals FROM referrals WHERE campaign_id = $1',
      [campaignId]
    );

    return res.status(200).json({
      campaign_id:     campaignId,
      total_referrals: parseInt(statsResult.rows[0].total_referrals, 10),
    });

  } catch (err) {
    next(err);
  }
});


module.exports = router;
