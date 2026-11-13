/**
 * features/dashboard/pages/Overview.jsx
 * ──────────────────────────────────────
 * Executive Advanced Analytics Dashboard.
 *
 * Sections:
 *  1. Row 1: KPI Metric Cards
 *     - Total Agents (Brand Brown)
 *     - Total Payout (Gold, formatted as X,XXX ETB, Wallet icon)
 *     - Conversion Rate (Sage Green, XX.X%, TrendingUp icon)
 *     - Active Campaigns (Muted Brown)
 *  2. Row 2: Analytics Charts
 *     - Referrals Over Time (Line Chart)
 *     - Campaign Distribution (Bar Chart)
 *  3. Row 3: Split Widgets
 *     - Column A: Top Performing Agents (Rank badges #1, #2..., Trophy icon for #1, Agent Name, Successful Referrals, Total Earned)
 *     - Column B: Recent Activity (5 most recent referrals with status pills)
 *
 * Props: user, isAdmin, onToast
 */

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  BarChart, Bar, Cell,
} from 'recharts';
import {
  Users, Wallet, TrendingUp, Megaphone, Trophy, BarChart2,
} from 'lucide-react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';

// ── Brand palette ─────────────────────────────────────────────────────────────
const BRAND       = '#8A4D1F';
const CHOCOLATE   = '#3E2723';
const GOLD        = '#D4AF37';
const MUTED       = '#9C8577';
const MUTED_BROWN = '#7F483B';
const IVORY       = '#FAF8F5';
const BORDER      = 'rgba(138,77,31,0.12)';
const SUCCESS     = '#1A5C34';
const PENDING_C   = '#E65100';
const REJECT_C    = '#B71C1C';

// Bar chart palette — brand browns + gold
const BAR_COLORS = [
  BRAND, GOLD, '#A0522D', '#D4956A', '#C8860A',
  '#6D4C41', '#B8860B', '#8B6914',
];

// ── Status Helpers ────────────────────────────────────────────────────────────
function statusColor(s) {
  if (s === 'SUCCESSFUL') return SUCCESS;
  if (s === 'PENDING')    return PENDING_C;
  return REJECT_C;
}

function statusBg(s) {
  if (s === 'SUCCESSFUL') return 'rgba(26,92,52,0.10)';
  if (s === 'PENDING')    return 'rgba(230,81,0,0.10)';
  return 'rgba(183,28,28,0.10)';
}

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, subtitle, accent, loading }) {
  return (
    <div
      className="bg-white rounded-xl p-5 flex items-start gap-4 shadow-sm transition-all duration-200 hover:shadow-md"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div
        className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-xs"
        style={{ background: `${accent}15` }}
      >
        <Icon size={24} style={{ color: accent }} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: MUTED }}>
          {label}
        </p>
        {loading ? (
          <div className="h-8 w-24 rounded bg-[#F0EAE4] animate-pulse my-0.5" />
        ) : (
          <p className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight" style={{ color: CHOCOLATE }}>
            {value ?? 0}
          </p>
        )}
        {subtitle && (
          <p className="text-[11px] mt-1 font-medium truncate" style={{ color: MUTED }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Custom Line tooltip ───────────────────────────────────────────────────────
function LineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: '#fff', border: `1px solid ${BORDER}`, color: CHOCOLATE }}
    >
      <p className="font-semibold mb-0.5">{label}</p>
      <p style={{ color: BRAND }}>
        {payload[0].value} referral{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ── Custom Bar tooltip ────────────────────────────────────────────────────────
function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg max-w-[220px]"
      style={{ background: '#fff', border: `1px solid ${BORDER}`, color: CHOCOLATE }}
    >
      <p className="font-semibold mb-0.5 truncate">{label}</p>
      <p style={{ color: GOLD }}>
        {payload[0].value} successful referral{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ── Custom X-axis tick (truncate long campaign names) ─────────────────────────
function BarTick({ x, y, payload }) {
  const max  = 12;
  const text = payload.value?.length > max
    ? payload.value.slice(0, max) + '…'
    : payload.value;
  return (
    <text x={x} y={y + 12} textAnchor="middle" fill={MUTED} fontSize={11}>
      {text}
    </text>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, subtitle, children, action }) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <div>
          <h2 className="font-bold text-sm tracking-wide" style={{ color: CHOCOLATE }}>{title}</h2>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

// ── Rank Badge Helper ─────────────────────────────────────────────────────────
function RankBadge({ rank }) {
  if (rank === 1) {
    return (
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-xs"
        style={{
          background: 'linear-gradient(135deg, #FFF9E6 0%, #FFE082 100%)',
          color: '#B8860B',
          border: '1px solid #F3E2A9',
        }}
        title="Top Performer"
      >
        <Trophy size={14} className="text-[#B8860B]" strokeWidth={2.5} />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
        style={{
          background: 'linear-gradient(135deg, #F5F2EE 0%, #E0D7D0 100%)',
          color: '#4E342E',
          border: '1px solid #D7CCC8',
        }}
      >
        #2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
        style={{
          background: 'linear-gradient(135deg, #FBF0E8 0%, #E8BEA5 100%)',
          color: '#8A4D1F',
          border: '1px solid #D7B59F',
        }}
      >
        #3
      </div>
    );
  }
  return (
    <div
      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs"
      style={{
        background: '#FAF8F5',
        color: MUTED,
        border: `1px solid ${BORDER}`,
      }}
    >
      #{rank}
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function Overview({ onToast }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(r => setStats(r.data))
      .catch(() => {
        if (onToast) {
          onToast({ type: 'error', message: '🔴 Failed to load dashboard metrics.' });
        }
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rot = stats?.referralsOverTime    ?? [];
  const cd  = stats?.campaignDistribution ?? [];
  const ra  = stats?.recentActivity       ?? [];
  const ta  = stats?.topAgents            ?? [];

  // Payout formatted as "X,XXX ETB"
  const formattedPayout = `${Number(stats?.totalPayout ?? 0).toLocaleString()} ETB`;

  // Conversion rate formatted as "XX.X%"
  const formattedConversionRate = `${Number(stats?.conversionRate ?? 0).toFixed(1)}%`;

  return (
    <div className="p-6 space-y-6" style={{ background: IVORY, minHeight: '100%' }}>

      {/* ── Row 1: KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Agents */}
        <MetricCard
          icon={Users}
          label="Total Agents"
          value={stats?.totalAgents}
          subtitle="Registered agent network"
          accent={BRAND}
          loading={loading}
        />

        {/* Total Payout */}
        <MetricCard
          icon={Wallet}
          label="Total Payout"
          value={formattedPayout}
          subtitle="Earned reward liability"
          accent={GOLD}
          loading={loading}
        />

        {/* Conversion Rate */}
        <MetricCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={formattedConversionRate}
          subtitle="Successful referral ratio"
          accent={SUCCESS}
          loading={loading}
        />

        {/* Active Campaigns */}
        <MetricCard
          icon={Megaphone}
          label="Active Campaigns"
          value={stats?.activeCampaigns}
          subtitle="Live marketing initiatives"
          accent={MUTED_BROWN}
          loading={loading}
        />
      </div>

      {/* ── Row 2: Charts Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Line Chart — Referrals Over Time */}
        <Section
          title="Referrals Over Time"
          subtitle="All referrals submitted in the last 7 days"
          action={<TrendingUp size={16} style={{ color: MUTED }} />}
        >
          <div className="px-2 pt-5 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-56"><Spinner /></div>
            ) : rot.every(d => d.count === 0) ? (
              <div className="flex flex-col items-center justify-center h-56 gap-2">
                <TrendingUp size={28} style={{ color: MUTED }} strokeWidth={1.4} />
                <p className="text-xs" style={{ color: MUTED }}>No referral data for the last 7 days.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <LineChart data={rot} margin={{ top: 8, right: 24, left: -10, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(138,77,31,0.08)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: MUTED, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: MUTED, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <ReTooltip
                    content={<LineTooltip />}
                    cursor={{ stroke: `${BRAND}22`, strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={BRAND}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#fff', stroke: BRAND, strokeWidth: 2.5 }}
                    activeDot={{ r: 6, fill: BRAND, stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>

        {/* Bar Chart — Campaign Distribution */}
        <Section
          title="Campaign Performance"
          subtitle="Successful referrals generated per campaign (top 8)"
          action={<BarChart2 size={16} style={{ color: MUTED }} />}
        >
          <div className="px-2 pt-5 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-56"><Spinner /></div>
            ) : cd.every(d => d.count === 0) ? (
              <div className="flex flex-col items-center justify-center h-56 gap-2">
                <BarChart2 size={28} style={{ color: MUTED }} strokeWidth={1.4} />
                <p className="text-xs" style={{ color: MUTED }}>No campaign referral data yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={cd} margin={{ top: 8, right: 24, left: -10, bottom: 20 }} barSize={28}>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(138,77,31,0.08)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={<BarTick />}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: MUTED, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <ReTooltip
                    content={<BarTooltip />}
                    cursor={{ fill: 'rgba(138,77,31,0.04)' }}
                  />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                    {cd.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Section>
      </div>

      {/* ── Row 3: Split Widgets (Top Agents & Recent Activity) ───────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Column A: Top Performing Agents */}
        <Section
          title="Top Performing Agents"
          subtitle="Ranked by successful referral volume & earned rewards"
          action={<Trophy size={16} style={{ color: GOLD }} />}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : ta.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Trophy size={28} style={{ color: MUTED }} strokeWidth={1.4} />
              <p className="text-xs" style={{ color: MUTED }}>No successful agent referrals yet.</p>
            </div>
          ) : (
            <ul>
              {ta.map((agent, i) => {
                const rank = i + 1;
                const count = agent.successful_count ?? agent.successfulCount ?? 0;
                const earned = agent.total_earned ?? agent.totalEarned ?? 0;

                return (
                  <li
                    key={agent.id ?? i}
                    className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors duration-100"
                    style={{ borderBottom: i < ta.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = IVORY; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  >
                    {/* Rank Badge + Agent Name & Referral Count */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <RankBadge rank={rank} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: CHOCOLATE }}>
                          {agent.name}
                        </p>
                        <p className="text-xs font-medium truncate mt-0.5" style={{ color: MUTED }}>
                          <span className="font-semibold" style={{ color: BRAND }}>{count}</span>
                          {' '}successful referral{count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Total Earned Payout */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums" style={{ color: CHOCOLATE }}>
                        {Number(earned).toLocaleString()} ETB
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
                        Total Earned
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Column B: Recent Activity */}
        <Section
          title="Recent Activity"
          subtitle="The 5 most recently submitted referrals"
        >
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : ra.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs" style={{ color: MUTED }}>No referral activity yet.</p>
            </div>
          ) : (
            <ul>
              {ra.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors duration-100"
                  style={{ borderBottom: i < ra.length - 1 ? `1px solid ${BORDER}` : 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background = IVORY; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                >
                  {/* Index badge + names */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                      style={{ background: `${BRAND}14`, color: BRAND }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: CHOCOLATE }}>
                        {r.customerName}
                      </p>
                      <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>
                        via <span className="font-medium" style={{ color: CHOCOLATE }}>{r.agentName}</span>
                        {r.campaignName !== '—' && (
                          <> · <span className="italic">{r.campaignName}</span></>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Status + date */}
                  <div className="flex-shrink-0 flex items-center gap-3">
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                      style={{ color: statusColor(r.status), background: statusBg(r.status) }}
                    >
                      {r.status}
                    </span>
                    <span
                      className="text-xs tabular-nums whitespace-nowrap hidden sm:block"
                      style={{ color: MUTED }}
                    >
                      {new Date(r.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

      </div>

    </div>
  );
}
