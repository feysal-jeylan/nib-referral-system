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
    pendingApprovals,
    activeCampaigns,
    referralsRaw,       // last 7 days, grouped by date in SQL
    campaignDist,       // per-campaign successful referral counts
    recentActivity,     // 5 most recent referrals
  ] = await Promise.all([

    // 1. Approved agent count
    prisma.agent.count({ where: { status: 'APPROVED' } }),

    // 2. Successful referral count
    prisma.referral.count({ where: { status: 'SUCCESSFUL' } }),

    // 3. Pending referral count
    prisma.referral.count({ where: { status: 'PENDING' } }),

    // 4. Active campaign count
    prisma.campaign.count({ where: { status: 'ACTIVE' } }),

    // 5. Referrals over last 7 days — grouped by calendar date using raw SQL
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

    // 6. Campaign distribution — successful referrals per campaign (top 8)
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

    // 7. Recent activity — 5 latest referrals with agent name
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
    pendingApprovals:     Number(pendingApprovals),
    activeCampaigns:      Number(activeCampaigns),
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

