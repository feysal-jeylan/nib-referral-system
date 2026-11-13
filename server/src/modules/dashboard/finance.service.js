/**
 * src/modules/dashboard/finance.service.js
 * ─────────────────────────────────────────────
 * Data-access layer for financial payouts & reward configuration.
 */

'use strict';

const prisma = require('@/config/db');

/**
 * Returns finance overview: all approved agents with successful referral count,
 * calculated total earned, mock pending payout status, and total liability sum.
 */
async function getFinanceOverview() {
  const agentsRaw = await prisma.$queryRaw`
    SELECT 
      a.id,
      a.name,
      a.email,
      a.phone,
      a.referral_code,
      COUNT(r.id)::int AS successful_referrals,
      COALESCE(SUM(COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(c.reward_value, ''), '[^0-9.]', '', 'g'), '')::numeric, 0)), 0)::numeric AS total_earned
    FROM agents a
    LEFT JOIN referrals r ON r.agent_id = a.id AND r.status = 'SUCCESSFUL'
    LEFT JOIN campaigns c ON r.campaign_id = c.id
    WHERE a.status = 'APPROVED'
    GROUP BY a.id, a.name, a.email, a.phone, a.referral_code
    ORDER BY total_earned DESC, successful_referrals DESC, a.name ASC
  `;

  const agents = agentsRaw.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    referral_code: a.referral_code,
    successful_referrals: Number(a.successful_referrals ?? 0),
    total_earned: Number(a.total_earned ?? 0),
    payout_status: 'PENDING',
  }));

  const totalPayout = agents.reduce((sum, a) => sum + a.total_earned, 0);

  return {
    agents,
    total_payout: totalPayout,
    totalLiability: totalPayout,
  };
}

/**
 * Returns system reward rules configuration tiers (Bronze, Silver, Gold).
 */
async function getSystemConfig() {
  const rules = await prisma.$queryRaw`
    SELECT id, min_referrals, reward_name, created_at
    FROM reward_rules
    ORDER BY min_referrals ASC
  `;

  return {
    reward_rules: rules.map((r) => ({
      id: r.id,
      min_referrals: Number(r.min_referrals),
      reward_name: r.reward_name,
      created_at: r.created_at,
    })),
  };
}

/**
 * Updates reward rules thresholds atomically within a transaction.
 * @param {Array<{ id: number, min_referrals: number }>} rulesArray
 */
async function updateSystemConfig(rulesArray) {
  return await prisma.$transaction(async (tx) => {
    for (const rule of rulesArray) {
      await tx.$executeRaw`
        UPDATE reward_rules
        SET min_referrals = ${Number(rule.min_referrals)}
        WHERE id = ${Number(rule.id)}
      `;
    }

    const updated = await tx.$queryRaw`
      SELECT id, min_referrals, reward_name, created_at
      FROM reward_rules
      ORDER BY min_referrals ASC
    `;

    return updated.map((r) => ({
      id: r.id,
      min_referrals: Number(r.min_referrals),
      reward_name: r.reward_name,
      created_at: r.created_at,
    }));
  });
}

module.exports = {
  getFinanceOverview,
  getSystemConfig,
  updateSystemConfig,
};
