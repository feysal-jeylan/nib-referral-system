/**
 * src/modules/referrals/referrals.service.js
 * ────────────────────────────────────────────
 * Data-access layer for referral operations.
 * All Prisma queries live here — no HTTP logic.
 */

'use strict';

const prisma = require('@/config/db');

const ALLOWED_STATUSES = ['SUCCESSFUL', 'REJECTED'];

// ── List referrals (RBAC-filtered, paginated, status-filtered) ────────────────
async function listReferrals(role, agentId, page, limit, { status = '' } = {}) {
  const skip = (page - 1) * limit;

  const baseWhere   = role === 'AGENT' ? { agent_id: agentId } : {};
  const statusFilter = status ? { status } : {};
  const where = { ...baseWhere, ...statusFilter };

  const [total, rows] = await prisma.$transaction([
    prisma.referral.count({ where }),
    prisma.referral.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      include: { agent: { select: { name: true, referral_code: true } } },
    }),
  ]);

  const data = rows.map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    customer_phone: r.customer_phone,
    agent_name:     r.agent?.name ?? null,
    referral_code:  r.agent?.referral_code ?? null,
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

module.exports = { ALLOWED_STATUSES, listReferrals, updateReferralStatus };

