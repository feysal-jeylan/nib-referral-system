/**
 * features/dashboard/pages/AgentOverview.jsx
 * ────────────────────────────────────────────
 * Personal dashboard for agents (RBAC).
 *
 * Sections:
 *  1. Referral Code Hero Card — prominent with one-click copy button
 *  2. Stats Row              — Successful Referrals & Reward Tier (None, Bronze, Silver, Gold)
 *  3. Recent Activity List   — Last 5 referrals with status pills and proper empty state
 *
 * Props: user, onToast
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  CheckCircle2,
  Award,
  TrendingUp,
  Clock,
  XCircle,
  FileText,
  Sparkles,
} from 'lucide-react';
import useAppStore from '@/store/useAppStore';
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

// ── Reward Tier calculation ───────────────────────────────────────────────────
// 0–2 = None, 3–4 = Bronze, 5–9 = Silver, 10+ = Gold
function calculateTier(successfulCount, serverTier) {
  const count = Number(successfulCount) || 0;
  if (count >= 10) return 'Gold';
  if (count >= 5)  return 'Silver';
  if (count >= 3)  return 'Bronze';
  return serverTier && serverTier !== 'None' ? serverTier : 'None';
}

function tierAccent(tier) {
  if (!tier || tier === 'None') return '#9C8577';
  const t = tier.toLowerCase();
  if (t.includes('gold'))   return GOLD;
  if (t.includes('silver')) return '#78909C';
  if (t.includes('bronze')) return '#8D6038';
  return BRAND;
}

// ── Stat Card Component ───────────────────────────────────────────────────────
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
          <div className="h-7 w-20 rounded bg-stone-100 animate-pulse mt-0.5" />
        ) : (
          <p className="text-2xl font-bold leading-none" style={{ color: CHOCOLATE }}>
            {value ?? '—'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main AgentOverview ────────────────────────────────────────────────────────
export default function AgentOverview({ user: propUser, onToast }) {
  const storeUser = useAppStore((s) => s.user);
  const user      = storeUser || propUser;

  const [referralCode, setReferralCode] = useState(null);
  const [stats,        setStats]        = useState(null);
  const [recentRefs,   setRecentRefs]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [copied,       setCopied]       = useState(false);

  // ── Fetch Agent Profile, Stats, and Recent Referrals ───────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Agent profile (/api/agents filters by authenticated JWT agent_id)
      const { data: agentRes } = await api.get('/agents');
      const agentRecord = agentRes?.data?.[0] ?? agentRes?.agents?.[0] ?? null;

      if (agentRecord) {
        if (agentRecord.referral_code) {
          setReferralCode(agentRecord.referral_code);
        }
      }

      const agentId = agentRecord?.id ?? user?.agent_id;

      // 2. Fetch Agent stats
      if (agentId) {
        try {
          const { data: statsData } = await api.get(`/agents/${agentId}/stats`);
          setStats(statsData);
        } catch {
          // Fallback stats from agentRecord if endpoint is unavailable
          if (agentRecord) {
            setStats({
              successful_referrals: agentRecord.successful_referrals ?? 0,
              current_reward: agentRecord.current_reward ?? null,
            });
          }
        }
      } else if (agentRecord) {
        setStats({
          successful_referrals: agentRecord.successful_referrals ?? 0,
          current_reward: agentRecord.current_reward ?? null,
        });
      }

      // 3. Fetch Recent referrals (last 5)
      try {
        const { data: refRes } = await api.get('/referrals?page=1&limit=5');
        const list = refRes?.data ?? refRes?.referrals ?? [];
        const validList = Array.isArray(list) ? list : [];
        setRecentRefs(validList);

        // Fallback for referral code from referral rows if not yet set
        if (!agentRecord?.referral_code && validList[0]?.referral_code) {
          setReferralCode(validList[0].referral_code);
        }
      } catch {
        setRecentRefs([]);
      }
    } catch (err) {
      console.error('[AgentOverview] fetch error:', err.message);
      onToast?.({ type: 'error', message: '🔴 Failed to load your dashboard data.' });
    } finally {
      setLoading(false);
    }
  }, [user?.agent_id, onToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Copy referral code to clipboard ─────────────────────────────────────────
  async function handleCopy() {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      onToast?.({ type: 'success', message: '📋 Referral code copied to clipboard!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.({ type: 'error', message: 'Could not copy code to clipboard.' });
    }
  }

  // Derive stats values
  const successfulCount = stats?.successful_referrals ?? 0;
  const currentTier     = calculateTier(successfulCount, stats?.current_reward);
  const tierColor       = tierAccent(currentTier);

  return (
    <div className="p-6 space-y-6" style={{ background: IVORY }}>

      {/* ── 1. Referral Code Hero Card ─────────────────────────────────────── */}
      <div
        className="rounded-xl p-6 sm:p-8 shadow-sm transition-all"
        style={{
          background: `linear-gradient(135deg, ${BRAND} 0%, #5E2F0D 100%)`,
          border: `1px solid ${BRAND}`,
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[#F0C854]" />
              <p className="text-xs font-bold tracking-widest uppercase text-white/70">
                Your Unique Referral Code
              </p>
            </div>

            {loading ? (
              <div className="h-10 w-44 rounded-lg bg-white/10 animate-pulse my-2" />
            ) : (
              <p className="text-3xl sm:text-4xl font-extrabold tracking-wider text-white select-all font-mono">
                {referralCode || 'Pending Assignment'}
              </p>
            )}

            <p className="text-xs text-white/60">
              Provide this code to customers when opening accounts to claim referral commissions.
            </p>
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={handleCopy}
              disabled={!referralCode || loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-bold
                         transition-all duration-150 shadow-sm disabled:opacity-40"
              style={{
                background: copied ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.18)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.30)',
              }}
              onMouseEnter={(e) => {
                if (!copied) e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
              }}
              onMouseLeave={(e) => {
                if (!copied) e.currentTarget.style.background = 'rgba(255,255,255,0.18)';
              }}
            >
              {copied ? (
                <>
                  <CheckCircle2 size={16} strokeWidth={2.5} className="text-emerald-300" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={16} strokeWidth={2} />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Total Successful Referrals"
          value={loading ? null : successfulCount}
          accent={BRAND}
          loading={loading}
        />
        <StatCard
          icon={Award}
          label="Current Reward Tier"
          value={loading ? null : currentTier}
          accent={tierColor}
          loading={loading}
        />
      </div>

      {/* ── 3. Recent Activity List ─────────────────────────────────────────── */}
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
              Recent Activity
            </h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              Your 5 most recent referral submissions
            </p>
          </div>

          {!loading && recentRefs.length > 0 && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: IVORY, color: MUTED }}
            >
              {recentRefs.length} referral{recentRefs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* List content / Loading / Empty State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14">
            <Spinner />
            <p className="text-sm font-medium" style={{ color: MUTED }}>Loading activity…</p>
          </div>
        ) : recentRefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-14 px-4 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-1"
              style={{ background: 'rgba(138,77,31,0.08)', color: BRAND }}
            >
              <FileText size={22} strokeWidth={1.8} />
            </div>
            <p className="text-sm font-semibold" style={{ color: CHOCOLATE }}>
              No referrals yet. Share your code to get started!
            </p>
            <p className="text-xs max-w-sm" style={{ color: MUTED }}>
              Customers who register accounts using your referral code will appear in this list.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: BORDER }}>
            {recentRefs.map((ref, idx) => (
              <li
                key={ref.id ?? idx}
                className="flex items-center justify-between px-6 py-3.5 gap-4 hover:bg-stone-50/50 transition"
              >
                {/* Customer name & details */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: CHOCOLATE }}>
                    {ref.customer_name ?? ref.customerName ?? 'Prospective Customer'}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>
                    {ref.customer_phone ?? ref.customer_account ?? ref.customerAccount ?? 'Account opening in progress'}
                  </p>
                </div>

                {/* Date & Status Pill */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {ref.created_at && (
                    <span className="text-xs hidden sm:block" style={{ color: MUTED }}>
                      {new Date(ref.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
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
