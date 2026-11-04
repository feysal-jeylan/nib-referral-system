/**
 * referral-api/routes/campaigns.js
 * ----------------------------------
 * Router for all /api/campaigns endpoints.
 *
 * All routes require:
 *   1. authenticateToken  — a valid, unexpired JWT in the HttpOnly cookie.
 *   2. authorizeRole(['ADMIN']) — caller must be an ADMIN.
 *
 * Endpoints:
 *   POST   /api/campaigns              — Create a new campaign (status = 'DRAFT')
 *   POST   /api/campaigns/:id/rules    — Add a qualification rule to a campaign
 *   DELETE /api/campaigns/:id/rules/:ruleId — Remove a rule from a campaign
 *   PATCH  /api/campaigns/:id/activate — Transition campaign DRAFT -> ACTIVE
 *   PUT    /api/campaigns/:id          — Update campaign fields (partial update)
 *   DELETE /api/campaigns/:id          — Delete a campaign (blocked if has referrals)
 *   GET    /api/campaigns              — List all campaigns with rules (paginated, Prisma)
 *   GET    /api/campaigns/:id/stats    — Referral count for a single campaign
 *
 * V8 (Prisma migration):
 *   All raw pool.query() calls replaced with Prisma Client methods.
 *   prisma.$transaction() used for the transactional DELETE.
 *
 * Per RULES.md §2 & §3:
 *   - Prisma uses parameterised queries internally — no string concatenation.
 *   - Raw DB errors are never sent to the client.
 *   - GET endpoints support pagination (?page=1&limit=20).
 */

'use strict';

const express = require('express');
const prisma  = require('../db-prisma');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

const adminOnly = [authenticateToken, authorizeRole(['ADMIN'])];

const VALID_OPERATORS = [
  'GREATER_THAN',
  'LESS_THAN',
  'EQUALS',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN_OR_EQUAL',
  'NOT_EQUALS',
];

const VALID_RULE_TYPES = ['MIN_DEPOSIT', 'ACCOUNT_TYPE'];


// ---------------------------------------------------------------------------
// POST /api/campaigns
// Create a new campaign. Status always starts as 'DRAFT'.
// ---------------------------------------------------------------------------
router.post('/', ...adminOnly, async (req, res, next) => {
  try {
    const {
      name,
      start_date,
      end_date,
      reward_type,
      reward_value,
      description,
      reward_threshold,
    } = req.body;

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
      return res.status(400).json({ error: 'Invalid start_date. Use ISO 8601 format.', code: 'INVALID_START_DATE' });
    }
    if (isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid end_date. Use ISO 8601 format.', code: 'INVALID_END_DATE' });
    }
    if (end <= start) {
      return res.status(400).json({ error: 'end_date must be after start_date.', code: 'INVALID_DATE_RANGE' });
    }

    const threshold = reward_threshold != null ? parseInt(reward_threshold, 10) : null;
    if (reward_threshold != null && (isNaN(threshold) || threshold < 0)) {
      return res.status(400).json({ error: 'reward_threshold must be a non-negative integer.', code: 'INVALID_REWARD_THRESHOLD' });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description:      description ?? null,
        start_date:       start,
        end_date:         end,
        reward_type,
        reward_value,
        reward_threshold: threshold,
        is_active:        true,
        status:           'DRAFT',
      },
    });

    return res.status(201).json({ campaign });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/rules
// Add a qualification rule to an existing campaign.
// ---------------------------------------------------------------------------
router.post('/:id/rules', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });
    }

    const { rule_type, operator, rule_value } = req.body;

    if (!rule_type) {
      return res.status(400).json({ error: 'Missing required field: rule_type.', code: 'MISSING_FIELDS' });
    }
    if (!VALID_RULE_TYPES.includes(rule_type)) {
      return res.status(400).json({
        error: `Invalid rule_type "${rule_type}". Valid values: ${VALID_RULE_TYPES.join(', ')}.`,
        code:  'INVALID_RULE_TYPE',
      });
    }
    if (!operator) {
      return res.status(400).json({ error: 'Missing required field: operator.', code: 'MISSING_FIELDS' });
    }
    if (!VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({
        error: `Invalid operator "${operator}". Valid values: ${VALID_OPERATORS.join(', ')}.`,
        code:  'INVALID_OPERATOR',
      });
    }
    if (rule_value === undefined || rule_value === null) {
      return res.status(400).json({ error: 'Missing required field: rule_value.', code: 'MISSING_FIELDS' });
    }
    if (typeof rule_value !== 'object' || Array.isArray(rule_value)) {
      return res.status(400).json({ error: 'rule_value must be a JSON object.', code: 'INVALID_RULE_VALUE' });
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
    if (!campaign) {
      return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });
    }

    const rule = await prisma.campaignRule.create({
      data: {
        campaign_id: campaignId,
        rule_type,
        operator,
        rule_value,
      },
    });

    return res.status(201).json({ rule });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/campaigns/:id/rules/:ruleId
// Remove a single rule from a campaign.
// ---------------------------------------------------------------------------
router.delete('/:id/rules/:ruleId', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const ruleId     = parseInt(req.params.ruleId, 10);

    if (isNaN(campaignId) || isNaN(ruleId)) {
      return res.status(400).json({ error: 'Campaign ID and Rule ID must be valid integers.', code: 'INVALID_ID' });
    }

    // deleteMany with compound where — returns count; 0 means not found.
    const { count } = await prisma.campaignRule.deleteMany({
      where: { id: ruleId, campaign_id: campaignId },
    });

    if (count === 0) {
      return res.status(404).json({ error: `Rule ${ruleId} not found for campaign ${campaignId}.`, code: 'RULE_NOT_FOUND' });
    }

    return res.status(200).json({ message: 'Rule deleted.' });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// PATCH /api/campaigns/:id/activate
// Transition a campaign from 'DRAFT' -> 'ACTIVE'.
// ---------------------------------------------------------------------------
router.patch('/:id/activate', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });
    }

    const existing = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: { id: true, name: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });
    }
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: `Campaign "${existing.name}" is already '${existing.status}'. Only 'DRAFT' campaigns can be activated.`,
        code:  'INVALID_STATUS_TRANSITION',
      });
    }

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data:  { status: 'ACTIVE' },
    });

    return res.status(200).json({ campaign });

  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// PUT /api/campaigns/:id
// Partial update of editable campaign fields.
// ---------------------------------------------------------------------------
router.put('/:id', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });
    }

    const curr = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: { name: true, start_date: true, end_date: true, reward_value: true, description: true, reward_threshold: true },
    });

    if (!curr) {
      return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });
    }

    const {
      name          = curr.name,
      start_date    = curr.start_date,
      end_date      = curr.end_date,
      reward_value  = curr.reward_value,
      description   = curr.description,
      reward_threshold,
    } = req.body;

    const start = new Date(start_date);
    const end   = new Date(end_date);

    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start_date.', code: 'INVALID_START_DATE' });
    if (isNaN(end.getTime()))   return res.status(400).json({ error: 'Invalid end_date.',   code: 'INVALID_END_DATE' });
    if (end <= start)           return res.status(400).json({ error: 'end_date must be after start_date.', code: 'INVALID_DATE_RANGE' });
    if (!String(name).trim())   return res.status(400).json({ error: 'name cannot be empty.', code: 'MISSING_FIELDS' });
    if (!String(reward_value).trim()) return res.status(400).json({ error: 'reward_value cannot be empty.', code: 'MISSING_FIELDS' });

    const threshold = reward_threshold !== undefined
      ? (reward_threshold != null ? parseInt(reward_threshold, 10) : null)
      : curr.reward_threshold;

    if (threshold !== null && (isNaN(threshold) || threshold < 0)) {
      return res.status(400).json({ error: 'reward_threshold must be a non-negative integer or null.', code: 'INVALID_REWARD_THRESHOLD' });
    }

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        name:             String(name).trim(),
        start_date:       start,
        end_date:         end,
        reward_value:     String(reward_value).trim(),
        description:      description ?? null,
        reward_threshold: threshold,
      },
    });

    return res.status(200).json({ campaign });

  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: `Campaign not found.`, code: 'CAMPAIGN_NOT_FOUND' });
    }
    next(err);
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/campaigns/:id
// Hard-delete a campaign and all its rules.
// Blocked if the campaign has any referrals linked to it.
// ---------------------------------------------------------------------------
router.delete('/:id', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });
    }

    const campaign = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: { id: true, name: true },
    });

    if (!campaign) {
      return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });
    }

    // Safety guard: block deletion if referrals are linked to this campaign.
    const referralCount = await prisma.referral.count({ where: { campaign_id: campaignId } });
    if (referralCount > 0) {
      return res.status(409).json({
        error: `Cannot delete campaign "${campaign.name}" — it has ${referralCount} referral(s) linked to it.`,
        code:  'CAMPAIGN_HAS_REFERRALS',
      });
    }

    // Delete rules first (FK cascade), then the campaign — both in one transaction.
    // campaign_rules has ON DELETE CASCADE in the DB schema, but we are explicit here
    // for clarity and to guarantee atomicity at the application layer.
    await prisma.$transaction([
      prisma.campaignRule.deleteMany({ where: { campaign_id: campaignId } }),
      prisma.campaign.delete({ where: { id: campaignId } }),
    ]);

    console.log(`[campaigns] Campaign "${campaign.name}" (id=${campaignId}) deleted by admin.`);
    return res.status(200).json({ message: `Campaign "${campaign.name}" deleted.` });

  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Campaign not found.', code: 'CAMPAIGN_NOT_FOUND' });
    }
    next(err);
  }
});


// ---------------------------------------------------------------------------
// GET /api/campaigns
// List all campaigns with their rules aggregated (paginated).
// Uses Prisma with include: { rules: true }.
// Response shape: { total, page, limit, campaigns: [...] }
// ---------------------------------------------------------------------------
router.get('/', ...adminOnly, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    const [total, rows] = await prisma.$transaction([
      prisma.campaign.count(),
      prisma.campaign.findMany({
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        include: { rules: true },
      }),
    ]);

    return res.status(200).json({
      total:     Number(total),
      page,
      limit,
      campaigns: rows,
    });

  } catch (err) {
    console.error('[GET /api/campaigns] Prisma error:', err.message);
    next(err);
  }
});


// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/stats
// Referral count for a single campaign.
// ---------------------------------------------------------------------------
router.get('/:id/stats', ...adminOnly, async (req, res, next) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });
    }

    const campaign = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: { id: true },
    });

    if (!campaign) {
      return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });
    }

    const totalReferrals = await prisma.referral.count({ where: { campaign_id: campaignId } });

    return res.status(200).json({
      campaign_id:     campaignId,
      total_referrals: totalReferrals,
    });

  } catch (err) {
    next(err);
  }
});


module.exports = router;
