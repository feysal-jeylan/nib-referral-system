/**
 * src/modules/referrals/referrals.controller.js
 * ───────────────────────────────────────────────
 * HTTP layer for referral endpoints.
 * Validation + req/res only. All DB work in referrals.service.js.
 */

'use strict';

const svc = require('./referrals.service');

// ── GET /api/referrals ────────────────────────────────────────────────────────
async function listReferrals(req, res, next) {
  try {
    const page   = Math.max(1,  parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const status = (req.query.status ?? '').trim().toUpperCase();
    const search = (req.query.search ?? '').trim();

    const VALID_STATUSES = ['PENDING', 'SUCCESSFUL', 'REJECTED'];
    const safeStatus = VALID_STATUSES.includes(status) ? status : '';

    const result = await svc.listReferrals(
      req.user.role, req.user.agent_id, page, limit, { status: safeStatus, search }
    );
    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/referrals] Prisma error:', err.message);
    next(err);
  }
}

// ── PATCH /api/referrals/:id/status  (ADMIN) ─────────────────────────────────
async function updateStatus(req, res, next) {
  const referralId = parseInt(req.params.id, 10);
  if (isNaN(referralId)) {
    return res.status(400).json({ error: 'Referral ID must be a valid integer.', code: 'INVALID_ID' });
  }

  const status = req.body.status?.trim().toUpperCase();
  if (!status || !svc.ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${svc.ALLOWED_STATUSES.join(', ')}.`,
      code:  'INVALID_STATUS',
    });
  }

  try {
    const updated = await svc.updateReferralStatus(referralId, status);
    return res.status(200).json({
      referral_id:    updated.id,
      agent_id:       updated.agent_id,
      customer_name:  updated.customer_name,
      customer_phone: updated.customer_phone,
      status:         updated.status,
      created_at:     updated.created_at,
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: `Referral with id ${referralId} not found.`, code: 'REFERRAL_NOT_FOUND' });
    }
    console.error('[PATCH /api/referrals/:id/status] Prisma error:', err.message);
    next(err);
  }
}

// ── DELETE /api/referrals/:id  (ADMIN) ───────────────────────────────────────
async function deleteReferral(req, res, next) {
  const referralId = parseInt(req.params.id, 10);
  if (isNaN(referralId)) {
    return res.status(400).json({ error: 'Referral ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const result = await svc.deleteReferral(referralId);
    return res.status(200).json({
      message: `Referral #${result.id} deleted successfully.`,
      id: result.id,
    });
  } catch (err) {
    if (err.status === 404 || err.code === 'REFERRAL_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: 'REFERRAL_NOT_FOUND' });
    }
    if (err.status === 403 || err.code === 'FORBIDDEN_DELETE') {
      return res.status(403).json({ error: err.message, code: 'FORBIDDEN_DELETE' });
    }
    console.error('[DELETE /api/referrals/:id] Prisma error:', err.message);
    next(err);
  }
}

module.exports = { listReferrals, updateStatus, deleteReferral };
