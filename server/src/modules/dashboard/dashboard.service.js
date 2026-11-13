/**
 * src/modules/dashboard/dashboard.service.js
 * ─────────────────────────────────────────────
 * Data-access layer for the executive dashboard metrics.
 * Uses Prisma aggregate queries — never fetches full record sets into JS.
 */

'use strict';

const prisma = require('@/config/db');

/**
 * Returns all KPI stats for the Overview page in a single call.
 * Uses Promise.all so all queries run in parallel.
 */
async function getDashboardStats() {
  // ── Date range for "last 7 days" ──────────────────────────────────────────
  const now   = new Date();
  const day0  = new Date(now);
  day0.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(day0);
  sevenDaysAgo.setDate(day0.getDate() - 6); // inclusive: today + 6 previous days

  // ── Parallel aggregate queries ────────────────────────────────────────────
  const [
    totalAgents,
    totalReferrals,
    successfulReferrals,
    pendingApprovals,
    activeCampaigns,
    payoutRaw,
    topAgentsRaw,
    referralsRaw,       // last 7 days, grouped by date in SQL
    campaignDist,       // per-campaign successful referral counts
    recentActivity,     // 5 most recent referrals
  ] = await Promise.all([

    // 1. Total agent count
    prisma.agent.count(),

    // 2. Total referral count
    prisma.referral.count(),

    // 3. Successful referral count
    prisma.referral.count({ where: { status: 'SUCCESSFUL' } }),

    // 4. Pending referral count
    prisma.referral.count({ where: { status: 'PENDING' } }),

    // 5. Active campaign count
    prisma.campaign.count({ where: { status: 'ACTIVE' } }),

    // 6. Total payout for SUCCESSFUL referrals (parsed numeric reward_value from campaigns)
    prisma.$queryRaw`
      SELECT 
        COALESCE(SUM(COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(c.reward_value, ''), '[^0-9.]', '', 'g'), '')::numeric, 0)), 0)::numeric AS total_payout
      FROM referrals r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      WHERE r.status = 'SUCCESSFUL'
    `,

    // 7. Top 5 agents by successful referral count & their total earnings
    prisma.$queryRaw`
      SELECT 
        a.id,
        a.name,
        COUNT(r.id)::int AS successful_count,
        COALESCE(SUM(COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(c.reward_value, ''), '[^0-9.]', '', 'g'), '')::numeric, 0)), 0)::numeric AS total_earned
      FROM referrals r
      JOIN agents a ON r.agent_id = a.id
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      WHERE r.status = 'SUCCESSFUL'
      GROUP BY a.id, a.name
      ORDER BY successful_count DESC, total_earned DESC
      LIMIT 5
    `,

    // 8. Referrals over last 7 days — grouped by calendar date using raw SQL
    //    DATE(created_at) is timezone-agnostic relative to the DB server.
    prisma.$queryRaw`
      SELECT
        TO_CHAR(created_at::date, 'YYYY-MM-DD') AS date,
        COUNT(*)::int                            AS count
      FROM referrals
      WHERE created_at >= ${sevenDaysAgo}
      GROUP BY created_at::date
      ORDER BY created_at::date ASC
    `,

    // 9. Campaign distribution — successful referrals per campaign (top 8)
    prisma.$queryRaw`
      SELECT
        c.name,
        COUNT(r.id)::int AS count
      FROM campaigns c
      LEFT JOIN referrals r
        ON r.campaign_id = c.id AND r.status = 'SUCCESSFUL'
      GROUP BY c.id, c.name
      ORDER BY count DESC
      LIMIT 8
    `,

    // 10. Recent activity — 5 latest referrals with agent name
    prisma.referral.findMany({
      take:    5,
      orderBy: { created_at: 'desc' },
      select: {
        id:             true,
        customer_name:  true,
        customer_phone: true,
        status:         true,
        created_at:     true,
        agent: { select: { name: true, referral_code: true } },
        campaign: { select: { name: true } },
      },
    }),
  ]);

  // ── Conversion Rate: (SUCCESSFUL / Total) * 100 rounded to 1 decimal ───────
  const conversionRate = totalReferrals > 0
    ? Number(((successfulReferrals / totalReferrals) * 100).toFixed(1))
    : 0.0;

  // ── Build the 7-day series (fill in missing days with count: 0) ──────────
  const dateMap = new Map(referralsRaw.map(r => [r.date, r.count]));
  const referralsOverTime = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo);
    d.setDate(sevenDaysAgo.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    // Abbreviated day label: "Mon", "Tue", …
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    return { date: label, fullDate: key, count: dateMap.get(key) ?? 0 };
  });

  return {
    totalAgents:          Number(totalAgents),
    totalReferrals:       Number(totalReferrals),
    successfulReferrals:  Number(successfulReferrals),
    pendingApprovals:     Number(pendingApprovals),
    activeCampaigns:      Number(activeCampaigns),
    totalPayout:          Number(payoutRaw[0]?.total_payout ?? 0),
    conversionRate,
    topAgents: topAgentsRaw.map(a => ({
      id:               a.id,
      name:             a.name,
      successful_count: Number(a.successful_count ?? 0),
      successfulCount:  Number(a.successful_count ?? 0),
      total_earned:     Number(a.total_earned ?? 0),
      totalEarned:      Number(a.total_earned ?? 0),
    })),
    referralsOverTime,
    campaignDistribution: campaignDist.map(r => ({
      name:  r.name,
      count: Number(r.count),
    })),
    recentActivity: recentActivity.map(r => ({
      id:            r.id,
      customerName:  r.customer_name ?? '—',
      agentName:     r.agent?.name ?? '—',
      campaignName:  r.campaign?.name ?? '—',
      status:        r.status,
      createdAt:     r.created_at,
    })),
  };
}

module.exports = { getDashboardStats };
