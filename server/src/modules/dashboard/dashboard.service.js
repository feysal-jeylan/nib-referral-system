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
    topAgentsRaw,
    referralsRaw,       // last 7 days, grouped by date in SQL
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

    // 7. Referrals over last 7 days — grouped by calendar date using raw SQL
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
