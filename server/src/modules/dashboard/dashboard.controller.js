/**
 * src/modules/dashboard/dashboard.controller.js
 * ───────────────────────────────────────────────
 * HTTP layer for the executive dashboard endpoints.
 */

'use strict';

const svc = require('./dashboard.service');

// ── GET /api/dashboard/stats  (ADMIN only) ────────────────────────────────────
async function getStats(req, res, next) {
  try {
    const stats = await svc.getDashboardStats();
    return res.status(200).json(stats);
  } catch (err) {
    console.error('[GET /api/dashboard/stats] Error:', err.message);
    next(err);
  }
}

module.exports = { getStats };

