/**
 * features/dashboard/pages/Overview.jsx
 * ──────────────────────────────────────
 * Phase 4: Executive metrics dashboard.
 *
 * Sections:
 *  1. KPI Metric Cards  (4 cards — agents, referrals, pending, campaigns)
 *  2. Line Chart        (Referrals over last 7 days)
 *  3. Bar Chart         (Campaign distribution — referrals per campaign)
 *  4. Recent Activity   (5 latest referrals with status pills)
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
  Users, CheckCircle2, Clock, Megaphone, TrendingUp, BarChart2,
} from 'lucide-react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';

// ── Brand palette ─────────────────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const GOLD      = '#D4AF37';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.10)';
const SUCCESS   = '#2E7D32';
const PENDING_C = '#E65100';
const REJECT_C  = '#B71C1C';

// Bar chart palette — brand browns + gold
const BAR_COLORS = [
  BRAND, GOLD, '#A0522D', '#D4956A', '#C8860A',
  '#6D4C41', '#B8860B', '#8B6914',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(s) {
  if (s === 'SUCCESSFUL') return SUCCESS;
  if (s === 'PENDING')    return PENDING_C;
  return REJECT_C;
}
function statusBg(s) {
  if (s === 'SUCCESSFUL') return 'rgba(46,125,50,0.10)';
  if (s === 'PENDING')    return 'rgba(230,81,0,0.10)';
  return 'rgba(183,28,28,0.10)';
}

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, accent, loading }) {
  return (
    <div
      className="bg-white rounded-xl p-6 flex items-start gap-4 shadow-sm"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div
        className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
        style={{ background: `${accent}18` }}
      >
        <Icon size={22} style={{ color: accent }} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: MUTED }}>
          {label}
        </p>
        {loading ? (
          <div className="h-8 w-16 rounded bg-[#F0EAE4] animate-pulse" />
        ) : (
          <p className="text-3xl font-bold tabular-nums" style={{ color: CHOCOLATE }}>
            {value ?? 0}
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
      className="rounded-lg px-3 py-2 text-xs shadow-lg max-w-[200px]"
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
  const max  = 10;
  const text = payload.value?.length > max
    ? payload.value.slice(0, max) + '…'
    : payload.value;
  return (
    <text x={x} y={y + 10} textAnchor="middle" fill={MUTED} fontSize={11}>
      {text}
    </text>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, subtitle, children, action }) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <div>
          <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>{title}</h2>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Overview({ user, isAdmin, onToast }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/dashboard/stats')
      .then(r => setStats(r.data))
      .catch(() => onToast({ type: 'error', message: '🔴 Failed to load dashboard metrics.' }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rot = stats?.referralsOverTime    ?? [];
  const cd  = stats?.campaignDistribution ?? [];
  const ra  = stats?.recentActivity       ?? [];

  return (
    <div className="p-6 space-y-6" style={{ background: IVORY, minHeight: '100%' }}>

      {/* ── 1. KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Approved Agents"
          value={stats?.totalAgents}
          accent={BRAND}
          loading={loading}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Successful Referrals"
          value={stats?.totalReferrals}
          accent={SUCCESS}
          loading={loading}
        />
        <MetricCard
          icon={Clock}
          label="Pending Approvals"
          value={stats?.pendingApprovals}
          accent={PENDING_C}
          loading={loading}
        />
        <MetricCard
          icon={Megaphone}
          label="Active Campaigns"
          value={stats?.activeCampaigns}
          accent={GOLD}
          loading={loading}
        />
      </div>

      {/* ── 2. Charts Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Line Chart — Referrals Over Time */}
        <Section
          title="Referrals Over Time"
          subtitle="All referrals submitted in the last 7 days"
          action={<TrendingUp size={16} style={{ color: MUTED }} />}
        >
          <div className="px-2 pt-5 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-52"><Spinner /></div>
            ) : rot.every(d => d.count === 0) ? (
              <div className="flex flex-col items-center justify-center h-52 gap-2">
                <TrendingUp size={28} style={{ color: MUTED }} strokeWidth={1.4} />
                <p className="text-xs" style={{ color: MUTED }}>No referral data for the last 7 days.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={rot} margin={{ top: 8, right: 24, left: -10, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(138,77,31,0.07)"
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
              <div className="flex items-center justify-center h-52"><Spinner /></div>
            ) : cd.every(d => d.count === 0) ? (
              <div className="flex flex-col items-center justify-center h-52 gap-2">
                <BarChart2 size={28} style={{ color: MUTED }} strokeWidth={1.4} />
                <p className="text-xs" style={{ color: MUTED }}>No campaign data yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={cd} margin={{ top: 8, right: 24, left: -10, bottom: 20 }} barSize={28}>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(138,77,31,0.07)"
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

      {/* ── 3. Recent Activity ────────────────────────────────────────────── */}
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
                className="flex items-center justify-between gap-4 px-6 py-4 transition-colors duration-100"
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
  );
}
