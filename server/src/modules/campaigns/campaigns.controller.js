/**
 * src/modules/campaigns/campaigns.controller.js
 * ───────────────────────────────────────────────
 * HTTP layer for campaign endpoints.
 * Handles req/res, input validation, and HTTP status codes.
 * Delegates ALL database work to campaigns.service.js.
 *
 * Rule: Never let raw errors or Prisma internals reach the client.
 */

'use strict';

const svc = require('./campaigns.service');

// ── POST /api/campaigns ───────────────────────────────────────────────────────
async function createCampaign(req, res, next) {
  try {
    const { name, start_date, end_date, reward_type, reward_value, description, reward_threshold } = req.body;

    // Required-field validation
    const missing = [];
    if (!name)         missing.push('name');
    if (!start_date)   missing.push('start_date');
    if (!end_date)     missing.push('end_date');
    if (!reward_type)  missing.push('reward_type');
    if (!reward_value) missing.push('reward_value');
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.`, code: 'MISSING_FIELDS' });
    }

    // Date validation
    const start = new Date(start_date);
    const end   = new Date(end_date);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start_date. Use ISO 8601 format.', code: 'INVALID_START_DATE' });
    if (isNaN(end.getTime()))   return res.status(400).json({ error: 'Invalid end_date. Use ISO 8601 format.',   code: 'INVALID_END_DATE' });
    if (end <= start)           return res.status(400).json({ error: 'end_date must be after start_date.',       code: 'INVALID_DATE_RANGE' });

    // Threshold validation
    const threshold = reward_threshold != null ? parseInt(reward_threshold, 10) : null;
    if (reward_threshold != null && (isNaN(threshold) || threshold < 0)) {
      return res.status(400).json({ error: 'reward_threshold must be a non-negative integer.', code: 'INVALID_REWARD_THRESHOLD' });
    }

    const campaign = await svc.createCampaign({ name, description, start_date, end_date, reward_type, reward_value, reward_threshold: threshold });
    return res.status(201).json({ campaign });
  } catch (err) { next(err); }
}

// ── POST /api/campaigns/:id/rules ─────────────────────────────────────────────
async function addRule(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });

    const { rule_type, operator, rule_value } = req.body;

    if (!rule_type) return res.status(400).json({ error: 'Missing required field: rule_type.', code: 'MISSING_FIELDS' });
    if (!svc.VALID_RULE_TYPES.includes(rule_type)) {
      return res.status(400).json({ error: `Invalid rule_type "${rule_type}". Valid values: ${svc.VALID_RULE_TYPES.join(', ')}.`, code: 'INVALID_RULE_TYPE' });
    }
    if (!operator) return res.status(400).json({ error: 'Missing required field: operator.', code: 'MISSING_FIELDS' });
    if (!svc.VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ error: `Invalid operator "${operator}". Valid values: ${svc.VALID_OPERATORS.join(', ')}.`, code: 'INVALID_OPERATOR' });
    }
    if (rule_value === undefined || rule_value === null) {
      return res.status(400).json({ error: 'Missing required field: rule_value.', code: 'MISSING_FIELDS' });
    }
    if (typeof rule_value !== 'object' || Array.isArray(rule_value)) {
      return res.status(400).json({ error: 'rule_value must be a JSON object.', code: 'INVALID_RULE_VALUE' });
    }

    const campaign = await svc.findCampaignById(campaignId);
    if (!campaign) return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });

    const rule = await svc.addRule(campaignId, { rule_type, operator, rule_value });
    return res.status(201).json({ rule });
  } catch (err) { next(err); }
}

// ── DELETE /api/campaigns/:id/rules/:ruleId ───────────────────────────────────
async function deleteRule(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const ruleId     = parseInt(req.params.ruleId, 10);
    if (isNaN(campaignId) || isNaN(ruleId)) {
      return res.status(400).json({ error: 'Campaign ID and Rule ID must be valid integers.', code: 'INVALID_ID' });
    }

    const { count } = await svc.deleteRule(campaignId, ruleId);
    if (count === 0) return res.status(404).json({ error: `Rule ${ruleId} not found for campaign ${campaignId}.`, code: 'RULE_NOT_FOUND' });

    return res.status(200).json({ message: 'Rule deleted.' });
  } catch (err) { next(err); }
}

// ── PATCH /api/campaigns/:id/activate ────────────────────────────────────────
async function activateCampaign(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });

    const existing = await svc.findCampaignById(campaignId);
    if (!existing) return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: `Campaign "${existing.name}" is already '${existing.status}'. Only 'DRAFT' campaigns can be activated.`,
        code:  'INVALID_STATUS_TRANSITION',
      });
    }

    const campaign = await svc.activateCampaign(campaignId);
    return res.status(200).json({ campaign });
  } catch (err) { next(err); }
}

// ── PUT /api/campaigns/:id ────────────────────────────────────────────────────
async function updateCampaign(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });

    const curr = await svc.findCampaignForUpdate(campaignId);
    if (!curr) return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });

    const {
      name         = curr.name,
      start_date   = curr.start_date,
      end_date     = curr.end_date,
      reward_value = curr.reward_value,
      description  = curr.description,
      reward_threshold,
    } = req.body;

    const start = new Date(start_date);
    const end   = new Date(end_date);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start_date.', code: 'INVALID_START_DATE' });
    if (isNaN(end.getTime()))   return res.status(400).json({ error: 'Invalid end_date.',   code: 'INVALID_END_DATE' });
    if (end <= start)           return res.status(400).json({ error: 'end_date must be after start_date.', code: 'INVALID_DATE_RANGE' });
    if (!String(name).trim())         return res.status(400).json({ error: 'name cannot be empty.',         code: 'MISSING_FIELDS' });
    if (!String(reward_value).trim()) return res.status(400).json({ error: 'reward_value cannot be empty.', code: 'MISSING_FIELDS' });

    const threshold = reward_threshold !== undefined
      ? (reward_threshold != null ? parseInt(reward_threshold, 10) : null)
      : curr.reward_threshold;
    if (threshold !== null && (isNaN(threshold) || threshold < 0)) {
      return res.status(400).json({ error: 'reward_threshold must be a non-negative integer or null.', code: 'INVALID_REWARD_THRESHOLD' });
    }

    const campaign = await svc.updateCampaign(campaignId, {
      name:             String(name).trim(),
      start_date:       start,
      end_date:         end,
      reward_value:     String(reward_value).trim(),
      description:      description ?? null,
      reward_threshold: threshold,
    });

    return res.status(200).json({ campaign });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Campaign not found.', code: 'CAMPAIGN_NOT_FOUND' });
    next(err);
  }
}

// ── DELETE /api/campaigns/:id ─────────────────────────────────────────────────
async function deleteCampaign(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });

    const campaign = await svc.findCampaignById(campaignId);
    if (!campaign) return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });

    const referralCount = await svc.countReferralsByCampaign(campaignId);
    if (referralCount > 0) {
      return res.status(409).json({
        error: `Cannot delete campaign "${campaign.name}" — it has ${referralCount} referral(s) linked to it.`,
        code:  'CAMPAIGN_HAS_REFERRALS',
      });
    }

    await svc.deleteCampaignWithRules(campaignId);
    console.log(`[campaigns] Campaign "${campaign.name}" (id=${campaignId}) deleted by admin.`);
    return res.status(200).json({ message: `Campaign "${campaign.name}" deleted.` });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Campaign not found.', code: 'CAMPAIGN_NOT_FOUND' });
    next(err);
  }
}

// ── GET /api/campaigns ────────────────────────────────────────────────────────
async function listCampaigns(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const [total, rows] = await svc.listCampaigns(page, limit);
    return res.status(200).json({ total: Number(total), page, limit, campaigns: rows });
  } catch (err) {
    console.error('[GET /api/campaigns] Prisma error:', err.message);
    next(err);
  }
}

// ── GET /api/campaigns/:id/stats ──────────────────────────────────────────────
async function getCampaignStats(req, res, next) {
  try {
    const campaignId = parseInt(req.params.id, 10);
    if (isNaN(campaignId)) return res.status(400).json({ error: 'Campaign ID must be a number.', code: 'INVALID_CAMPAIGN_ID' });

    const campaign = await svc.findCampaignById(campaignId);
    if (!campaign) return res.status(404).json({ error: `Campaign with id ${campaignId} not found.`, code: 'CAMPAIGN_NOT_FOUND' });

    const totalReferrals = await svc.countReferrals(campaignId);
    return res.status(200).json({ campaign_id: campaignId, total_referrals: totalReferrals });
  } catch (err) { next(err); }
}

module.exports = {
  createCampaign,
  addRule,
  deleteRule,
  activateCampaign,
  updateCampaign,
  deleteCampaign,
  listCampaigns,
  getCampaignStats,
};

