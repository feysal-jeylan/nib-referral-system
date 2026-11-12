/**
 * features/dashboard/pages/AgentOverview.jsx
 * ────────────────────────────────────────────
 * Personal dashboard for agents (RBAC).
 * Calls GET /api/agents/:id/stats — the backend already enforces that an
 * agent can only read their own record (RBAC middleware).
 *
 * Sections:
 *  1. Referral Code card  — prominent, copyable
 *  2. Stats row           — Successful Referrals · Reward Tier
 *  3. Recent Referrals    — last 5, with status pills
 *
 * Props: user, isAdmin, onToast
 */

import { useCallback, useEffect, useState } from 'react';
import { Copy, CheckCircle2, Award, TrendingUp, Clock, XCircle } from 'lucide-react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';

// ── Brand palette ─────────────────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const GOLD      = '#D4AF37';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.10)';

// ── Status pill helpers ───────────────────────────────────────────────────────
function statusColor(s) {
  if (s === 'SUCCESSFUL') return '#2E7D32';
  if (s === 'PENDING')    return '#E65100';
  return '#B71C1C';
}
function statusBg(s) {
  if (s === 'SUCCESSFUL') return 'rgba(46,125,50,0.10)';
  if (s === 'PENDING')    return 'rgba(230,81,0,0.10)';
  return 'rgba(183,28,28,0.10)';
}
function StatusPill({ status }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: statusColor(status), background: statusBg(status) }}
    >
      {status === 'SUCCESSFUL' && <CheckCircle2 size={11} strokeWidth={2.5} />}
      {status === 'PENDING'    && <Clock        size={11} strokeWidth={2.5} />}
      {status === 'REJECTED'   && <XCircle      size={11} strokeWidth={2.5} />}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, accent = BRAND, loading }) {
  return (
    <div
      className="bg-white rounded-xl p-6 flex items-start gap-4 shadow-sm"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div
        className="rounded-lg p-2.5 flex-shrink-0"
        style={{ background: `${accent}18` }}
      >
        <Icon size={22} style={{ color: accent }} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium mb-1" style={{ color: MUTED }}>{label}</p>
        {loading ? (
          <div className="h-7 w-16 rounded bg-gray-100 animate-pulse" />
        ) : (
          <p className="text-2xl font-bold leading-none" style={{ color: CHOCOLATE }}>
            {value ?? '—'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AgentOverview({ user, onToast }) {
  const agentId = user?.agent_id;

  const [stats,         setStats]         = useState(null);
  const [referralCode,  setReferralCode]  = useState(null);
  const [recentRefs,    setRecentRefs]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [copied,        setCopied]        = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      // 1. Agent stats (successful count + reward tier)
      const { data: statsData } = await api.get(`/agents/${agentId}/stats`);
      setStats(statsData);

      // 2. Referral code — from the agents list (agent sees only their own record)
      const { data: agentRes } = await api.get('/agents');
      const agentRecord = agentRes?.agents?.[0] ?? agentRes?.data?.[0] ?? null;
      setReferralCode(agentRecord?.referral_code ?? null);

      // 3. Recent referrals — last 5
      const { data: refRes } = await api.get('/referrals?page=1&limit=5');
      setRecentRefs(refRes?.data ?? refRes?.referrals ?? []);
    } catch (err) {
      console.error('[AgentOverview] fetch error:', err.message);
      onToast?.({ type: 'error', message: '🔴 Failed to load your dashboard data.' });
    } finally {
      setLoading(false);
    }
  }, [agentId, onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Copy referral code ────────────────────────────────────────────────────
  async function handleCopy() {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.({ type: 'error', message: 'Could not copy to clipboard.' });
    }
  }

  // ── Tier badge styling ────────────────────────────────────────────────────
  function tierAccent(tier) {
    if (!tier) return MUTED;
    const t = tier.toLowerCase();
    if (t.includes('gold'))   return GOLD;
    if (t.includes('silver')) return '#78909C';
    if (t.includes('bronze')) return '#8D6038';
    return BRAND;
  }

  const tier       = stats?.current_reward ?? null;
  const tierColor  = tierAccent(tier);
  const successful = stats?.successful_referrals ?? 0;

  return (
    <div className="p-6 space-y-6" style={{ background: IVORY }}>

      {/* ── 1. Referral Code Hero Card ─────────────────────────────────── */}
      <div
        className="rounded-xl p-6 shadow-sm"
        style={{
          background: `linear-gradient(135deg, ${BRAND} 0%, #6B3514 100%)`,
          border: `1px solid ${BRAND}`,
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-white/60 mb-1">
              Your Unique Referral Code
            </p>
            {loading ? (
              <div className="h-10 w-48 rounded-lg bg-white/10 animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-black tracking-widest text-white mt-1 select-all">
                {referralCode ?? '— —'}
              </p>
            )}
            <p className="text-xs text-white/50 mt-2">
              Share this code with customers to track your referrals.
            </p>
          </div>
          <button
            onClick={handleCopy}
            disabled={!referralCode || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold
                       transition-all duration-150 disabled:opacity-40"
            style={{
              background: copied ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
            onMouseEnter={e => { if (!copied) e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={e => { if (!copied) e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          >
            {copied
              ? <><CheckCircle2 size={15} strokeWidth={2.5} /> Copied!</>
              : <><Copy size={15} strokeWidth={2}      /> Copy Code</>
            }
          </button>
        </div>
      </div>

      {/* ── 2. Stats Row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Total Successful Referrals"
          value={loading ? null : successful}
          accent={BRAND}
          loading={loading}
        />
        <StatCard
          icon={Award}
          label="Current Reward Tier"
          value={loading ? null : (tier ?? 'No tier yet')}
          accent={tierColor}
          loading={loading}
        />
      </div>

      {/* ── 3. Recent Referrals ────────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <div>
            <h2 className="font-bold text-sm" style={{ color: CHOCOLATE }}>
              Recent Referrals
            </h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              Your 5 most recent referral submissions.
            </p>
          </div>
          {!loading && recentRefs.length > 0 && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: IVORY, color: MUTED }}
            >
              {recentRefs.length} shown
            </span>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Spinner />
            <p className="text-sm" style={{ color: MUTED }}>Loading your referrals…</p>
          </div>
        ) : recentRefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <p className="text-2xl">📋</p>
            <p className="text-sm font-semibold" style={{ color: CHOCOLATE }}>No referrals yet</p>
            <p className="text-xs" style={{ color: MUTED }}>
              Referrals you submit will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: BORDER }}>
            {recentRefs.map((ref, idx) => (
              <li
                key={ref.id ?? idx}
                className="flex items-center justify-between px-6 py-3.5 gap-4"
              >
                {/* Customer info */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: CHOCOLATE }}>
                    {ref.customer_name ?? ref.customerName ?? '—'}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>
                    {ref.customer_account ?? ref.customerAccount ?? ''}
                  </p>
                </div>

                {/* Status + date */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {ref.created_at && (
                    <span className="text-xs hidden sm:block" style={{ color: MUTED }}>
                      {new Date(ref.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short',
                      })}
                    </span>
                  )}
                  <StatusPill status={ref.status ?? 'PENDING'} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

