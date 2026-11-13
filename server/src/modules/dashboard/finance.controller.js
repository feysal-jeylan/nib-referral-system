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

module.exports = {
  getFinance,
  getConfig,
};
