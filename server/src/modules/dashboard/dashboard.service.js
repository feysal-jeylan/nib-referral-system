/**
 * src/modules/dashboard/dashboard.service.js
 * ─────────────────────────────────────────────
 * Data-access layer for the operational dashboard metrics.
 * Uses Prisma aggregate queries — never fetches full record sets into JS.
 */

'use strict';

const prisma = require('@/config/db');

/**
 * Returns operational KPI stats for the Overview page in a single call.
 * Uses Promise.all so all queries run in parallel.
 */
async function getDashboardStats() {
  // ── Parallel aggregate queries ────────────────────────────────────────────
  const [
    totalAgents,
    totalReferrals,
    successfulReferrals,
    pendingApprovals,
    activeCampaigns,
    topAgentsRaw,
    referralsRaw,       // guaranteed 7-day timeline ending TODAY via generate_series
    campaignDist,       // per-campaign successful referral counts
    recentActivity,     // 5 most recent referrals
  ] = await Promise.all([

    // 1. Total APPROVED agent count
    prisma.agent.count({ where: { status: 'APPROVED' } }),

    // 2. Total referral count (ALL referrals: PENDING, SUCCESSFUL, REJECTED)
    prisma.referral.count(),

    // 3. Successful referral count
    prisma.referral.count({ where: { status: 'SUCCESSFUL' } }),

    // 4. Pending referral count
    prisma.referral.count({ where: { status: 'PENDING' } }),

    // 5. Active campaign count
    prisma.campaign.count({ where: { status: 'ACTIVE' } }),

    // 6. Top 5 agents by successful referral count
    prisma.$queryRaw`
      SELECT 
        a.id,
        a.name,
        COUNT(r.id)::int AS successful_count
      FROM referrals r
      JOIN agents a ON r.agent_id = a.id
      WHERE r.status = 'SUCCESSFUL'
      GROUP BY a.id, a.name
      ORDER BY successful_count DESC
      LIMIT 5
    `,

    // 7. Referrals over last 7 days — guaranteed 7-day timeline ending TODAY
    //    Uses CURRENT_DATE and generate_series to fill missing dates with 0
    prisma.$queryRaw`
      SELECT
        TO_CHAR(day::date, 'YYYY-MM-DD') AS full_date,
        TRIM(TO_CHAR(day::date, 'Dy'))   AS day_name,
        COUNT(r.id)::int                 AS count
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS day
      LEFT JOIN referrals r
        ON r.created_at::date = day::date
      GROUP BY day::date
      ORDER BY day::date ASC
    `,

    // 8. Campaign distribution — successful referrals per campaign (top 8)
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

    // 9. Recent activity — 5 latest referrals with agent name
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

  // ── Conversion Rate: (SUCCESSFUL / Total) * 100, returns 0 if total is 0 ──
  const conversionRate = totalReferrals > 0
    ? Number(((successfulReferrals / totalReferrals) * 100).toFixed(1))
    : 0;

  // ── Build the 7-day series with "Today" as the final point ───────────────
  const referralsOverTime = referralsRaw.map((r, idx, arr) => {
    const isToday = idx === arr.length - 1;
    return {
      date:     isToday ? 'Today' : r.day_name,
      day:      r.day_name,
      fullDate: r.full_date,
      count:    Number(r.count ?? 0),
    };
  });

  return {
    totalAgents:          Number(totalAgents),
    totalReferrals:       Number(totalReferrals),
    successfulReferrals:  Number(successfulReferrals),
    pendingApprovals:     Number(pendingApprovals),
    activeCampaigns:      Number(activeCampaigns),
    conversionRate,
    topAgents: topAgentsRaw.map(a => ({
      id:               a.id,
      name:             a.name,
      successful_count: Number(a.successful_count ?? 0),
      successfulCount:  Number(a.successful_count ?? 0),
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
