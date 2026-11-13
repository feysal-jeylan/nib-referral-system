/**
 * src/modules/dashboard/finance.controller.js
 * ─────────────────────────────────────────────
 * HTTP layer for financial payouts and system configuration.
 */

'use strict';

const svc = require('./finance.service');

// ── GET /api/dashboard/finance (Admin only) ──────────────────────────────────
async function getFinance(req, res, next) {
  try {
    const data = await svc.getFinanceOverview();
    return res.status(200).json(data);
  } catch (err) {
    console.error('[GET /api/dashboard/finance] Error:', err.message);
    next(err);
  }
}

// ── GET /api/dashboard/config (Admin only) ───────────────────────────────────
async function getConfig(req, res, next) {
  try {
    const data = await svc.getSystemConfig();
    return res.status(200).json(data);
  } catch (err) {
    console.error('[GET /api/dashboard/config] Error:', err.message);
    next(err);
  }
}

// ── PUT /api/dashboard/config (Admin only) ───────────────────────────────────
async function updateConfig(req, res, next) {
  try {
    const rules = Array.isArray(req.body) ? req.body : (req.body.rules || req.body.rulesArray);

    if (!Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({
        error: 'Invalid request: rules array is required.',
        code: 'VALIDATION_ERROR',
      });
    }

    for (const rule of rules) {
      if (
        rule.id == null ||
        rule.min_referrals == null ||
        isNaN(Number(rule.min_referrals)) ||
        Number(rule.min_referrals) < 0
      ) {
        return res.status(400).json({
          error: 'Each rule must contain a valid id and a non-negative min_referrals number.',
          code: 'VALIDATION_ERROR',
        });
      }
    }

    const updated = await svc.updateSystemConfig(rules);

    return res.status(200).json({
      message: 'Reward rules configuration updated successfully.',
      reward_rules: updated,
    });
  } catch (err) {
    console.error('[PUT /api/dashboard/config] Error:', err.message);
    next(err);
  }
}

module.exports = {
  getFinance,
  getConfig,
  updateConfig,
};
