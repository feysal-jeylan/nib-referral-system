/**
 * src/modules/referrals/referrals.service.js
 * ────────────────────────────────────────────
 * Data-access layer for referral operations.
 * All Prisma queries live here — no HTTP logic.
 */

'use strict';

const prisma = require('@/config/db');

const ALLOWED_STATUSES = ['SUCCESSFUL', 'REJECTED'];

// ── List referrals (RBAC-filtered, paginated, status-filtered, searchable) ────
async function listReferrals(role, agentId, page, limit, { status = '', search = '' } = {}) {
  // SEC-P2-01: Guard against unlinked/missing agentId exposing all bank referrals
  if (role === 'AGENT' && !agentId) {
    const err = new Error('Agent ID missing from session');
    err.status = 403;
    err.code   = 'FORBIDDEN';
    throw err;
  }

  const skip = (page - 1) * limit;

  const baseWhere   = role === 'AGENT' ? { agent_id: agentId } : {};
  const statusFilter = status ? { status } : {};
  const searchFilter = search
    ? {
        OR: [
          { customer_name:  { contains: search, mode: 'insensitive' } },
          { customer_phone: { contains: search, mode: 'insensitive' } },
          { agent:    { referral_code: { contains: search, mode: 'insensitive' } } },
          { agent:    { name:          { contains: search, mode: 'insensitive' } } },
          { campaign: { campaign_code: { contains: search, mode: 'insensitive' } } },
          { campaign: { name:          { contains: search, mode: 'insensitive' } } },
        ],
      }
    : {};
  const where = { ...baseWhere, ...statusFilter, ...searchFilter };

  const [total, rows] = await prisma.$transaction([
    prisma.referral.count({ where }),
    prisma.referral.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      include: {
        agent:    { select: { name: true, referral_code: true } },
        campaign: { select: { name: true, campaign_code: true } },
      },
    }),
  ]);

  const data = rows.map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    customer_phone: r.customer_phone,
    agent_name:     r.agent?.name ?? null,
    referral_code:  r.agent?.referral_code ?? null,
    campaign_name:  r.campaign?.name ?? null,
    campaign_code:  r.campaign?.campaign_code ?? null,
    status:         r.status,
    created_at:     r.created_at,
  }));

  return {
    data,
    meta: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) },
  };
}

// ── Update referral status ────────────────────────────────────────────────────
async function updateReferralStatus(referralId, status) {
  return prisma.referral.update({
    where:  { id: referralId },
    data:   { status },
    select: {
      id:             true,
      agent_id:       true,
      customer_name:  true,
      customer_phone: true,
      status:         true,
      created_at:     true,
    },
  });
}

// ── Delete referral (Admin only; blocked if SUCCESSFUL) ───────────────────────
async function deleteReferral(referralId) {
  const referral = await prisma.referral.findUnique({
    where:  { id: referralId },
    select: { id: true, status: true, customer_name: true },
  });

  if (!referral) {
    const err = new Error(`Referral with id ${referralId} not found.`);
    err.code = 'REFERRAL_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (referral.status === 'SUCCESSFUL') {
    const err = new Error('Cannot delete successful financial records.');
    err.code = 'FORBIDDEN_DELETE';
    err.status = 403;
    throw err;
  }

  await prisma.referral.delete({
    where: { id: referralId },
  });

  return { id: referralId, customer_name: referral.customer_name };
}

module.exports = {
  ALLOWED_STATUSES,
  listReferrals,
  updateReferralStatus,
  deleteReferral,
};
