/**
 * features/finance/pages/FinancePage.jsx
 * ───────────────────────────────────────
 * Dedicated Finance & Payouts Ledger.
 * Data fetching: TanStack Query (useQuery + useMutation)
 * Props: user, isAdmin, onToast
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Check,
  CheckCircle2,
  RefreshCw,
  Clock,
  ShieldAlert,
  Download,
} from 'lucide-react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import AccessDenied from '@/components/ui/AccessDenied';
import usePermissions from '@/features/auth/usePermissions';
import useAppStore from '@/store/useAppStore';

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const IVORY     = '#FAF8F5';
const BORDER    = 'rgba(138,77,31,0.12)';

// ── Query key factory ─────────────────────────────────────────────────────────
const financeKeys = {
  all:    () => ['finance'],
  ledger: () => ['finance', 'ledger'],
};

export default function FinancePage({ onToast }) {
  const { hasPermission, hasAnyPermission, isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const canView   = hasAnyPermission(['view_finance', 'manage_finance']) || isAdmin;
  const canManage = hasPermission('manage_finance') || isAdmin;

  // ── useQuery: fetch finance ledger ────────────────────────────────────────
  const {
    data: financeData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: financeKeys.ledger(),
    queryFn: async () => {
      const res = await api.get('/dashboard/finance');
      return res.data;
    },
    enabled: canView,
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Failed to load financial records.';
      onToast?.({ type: 'error', message: `🔴 ${msg}` });
    },
  });

  // ── useMutation: Mark as Paid ─────────────────────────────────────────────
  const payMutation = useMutation({
    mutationFn: (agent) => api.patch(`/dashboard/finance/pay/${agent.id}`),
    onSuccess: (_, agent) => {
      onToast?.({ type: 'success', message: `✅ Payout for ${agent.name} marked as settled.` });
      queryClient.invalidateQueries({ queryKey: financeKeys.all() });
    },
    onError: (err) => {
      const msg = err.response?.data?.error ?? 'Failed to process payout settlement.';
      onToast?.({ type: 'error', message: `❌ ${msg}` });
    },
  });

  // ── CSV Data Export ───────────────────────────────────────────────────────
  function handleExportCSV() {
    const list = financeData?.agents ?? [];
    if (!list || list.length === 0) {
      onToast?.({ type: 'warning', message: 'No financial records available to export.' });
      return;
    }

    const headers = [
      '"Agent Name"',
      '"Email"',
      '"Phone"',
      '"Successful Referrals"',
      '"Total Earned (ETB)"',
      '"Payout Status"',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/"/g, '""');
    };

    const rows = list.map((agent) => {
      const name  = escapeCsv(agent.name  || '');
      const email = escapeCsv(agent.email || '');
      const phone = escapeCsv(agent.phone || '');
      const rawReferrals   = Number(String(agent.successful_referrals ?? 0).replace(/[^0-9]/g, ''))    || 0;
      const rawTotalEarned = Number(String(agent.total_earned         ?? 0).replace(/[^0-9.]/g, '')) || 0;
      const payoutStatus   = escapeCsv(
        agent.payout_status || (Number(agent.available_balance ?? 0) > 0 ? 'PENDING' : 'PAID')
      );
      return `"${name}","${email}","${phone}","${rawReferrals}","${rawTotalEarned}","${payoutStatus}"`;
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `NIB_Finance_Payouts_${today}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast?.({ type: 'success', message: 'Financial ledger exported to CSV successfully.' });
  }

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!canView) {
    return <AccessDenied onGoHome={() => useAppStore.getState().setActivePage('overview')} />;
  }

  const agentsList     = financeData?.agents ?? [];
  const totalLiability = financeData?.total_payout ?? financeData?.totalLiability ?? 0;
  const payingAgentId  = payMutation.isPending ? payMutation.variables?.id : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" style={{ background: IVORY, minHeight: '100%' }}>

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b" style={{ borderColor: BORDER }}>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 tracking-tight" style={{ color: CHOCOLATE }}>
            <Wallet size={22} style={{ color: BRAND }} />
            Finance &amp; Payouts Ledger
          </h1>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            Track agent performance earnings, monitor cumulative liability, and execute commission settlements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={isLoading || agentsList.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition hover:bg-stone-50 disabled:opacity-50 cursor-pointer shadow-2xs"
            style={{ borderColor: 'rgba(138,77,31,0.28)', color: BRAND, background: '#fff' }}
          >
            <Download size={14} style={{ color: BRAND }} />
            <span>Export CSV</span>
          </Button>

          <button
            onClick={() => refetch()}
            title="Refresh Ledger"
            disabled={isLoading}
            className="p-2 rounded-lg border transition hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
            style={{ borderColor: BORDER, color: MUTED, background: '#fff' }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <span
            className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border shadow-2xs"
            style={{
              background:   canManage ? 'rgba(138,77,31,0.10)' : 'rgba(156,133,119,0.12)',
              borderColor:  canManage ? 'rgba(138,77,31,0.25)' : 'rgba(156,133,119,0.25)',
              color:        canManage ? BRAND : MUTED,
            }}
          >
            {canManage ? '💼 Payout Authority' : '👁️ View Only'}
          </span>
        </div>
      </div>

      {/* ── Liability Summary Card ───────────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 border"
        style={{
          borderColor: 'rgba(212,175,55,0.40)',
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFDF9 100%)',
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xs"
            style={{ background: 'rgba(212,175,55,0.18)', color: '#B8860B' }}
          >
            <Wallet size={28} strokeWidth={2} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
              Total Outstanding Liability
            </p>
            <h3 className="text-3xl font-extrabold tracking-tight tabular-nums mt-0.5" style={{ color: CHOCOLATE }}>
              {isLoading ? '—' : `${Number(totalLiability).toLocaleString()} ETB`}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              Cumulative referral rewards accrued across approved agents.
            </p>
          </div>
        </div>

        <div className="flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Eligible for Settlement</span>
          </span>
        </div>
      </div>

      {/* ── Payouts Data Table ───────────────────────────────────────────────── */}
      <div
        className="bg-white rounded-xl shadow-sm overflow-hidden"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between border-b"
          style={{ borderColor: BORDER }}
        >
          <div>
            <h3 className="font-bold text-sm tracking-wide" style={{ color: CHOCOLATE }}>
              Agent Earnings &amp; Payout Ledger
            </h3>
            <p className="text-xs" style={{ color: MUTED }}>
              Verified referral disbursements and agent account balances.
            </p>
          </div>
          <span className="text-xs font-medium" style={{ color: MUTED }}>
            {agentsList.length} approved agent{agentsList.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spinner size={28} style={{ color: BRAND }} />
            <p className="text-xs font-medium" style={{ color: MUTED }}>Synchronizing financial ledger…</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <ShieldAlert size={36} className="text-red-500" />
            <p className="text-sm font-semibold" style={{ color: CHOCOLATE }}>Failed to load financial records</p>
            <p className="text-xs max-w-sm" style={{ color: MUTED }}>
              Unable to reach the core referral finance service. Please try again.
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        ) : agentsList.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No agent records found"
            sub="No approved agents with performance history exist yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr
                  className="border-b uppercase font-semibold tracking-wider text-[11px]"
                  style={{ background: '#FAF8F5', borderColor: BORDER, color: MUTED }}
                >
                  <th className="py-3.5 px-6">Agent</th>
                  <th className="py-3.5 px-6">Referral Code</th>
                  <th className="py-3.5 px-6 text-center">Successful Referrals</th>
                  <th className="py-3.5 px-6 text-right">Available Balance</th>
                  <th className="py-3.5 px-6 text-right">Total Paid</th>
                  <th className="py-3.5 px-6 text-right">Settlement Action</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: BORDER }}>
                {agentsList.map((agent) => {
                  const hasBalance = Number(agent.available_balance ?? 0) > 0;
                  return (
                    <tr key={agent.id} className="hover:bg-[#FAF8F5]/60 transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-bold text-sm" style={{ color: CHOCOLATE }}>{agent.name}</p>
                        <p className="text-[11px]" style={{ color: MUTED }}>{agent.phone || agent.email}</p>
                      </td>

                      <td className="py-4 px-6">
                        <span
                          className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md border"
                          style={{ background: '#FAF8F5', borderColor: '#E5DED6', color: BRAND }}
                        >
                          {agent.referral_code ?? '—'}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className="font-bold text-sm tabular-nums" style={{ color: CHOCOLATE }}>
                          {agent.successful_referrals ?? 0}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <span
                          className="font-bold text-sm tabular-nums"
                          style={{ color: hasBalance ? '#1A5C34' : CHOCOLATE }}
                        >
                          {Number(agent.available_balance ?? 0).toLocaleString()} ETB
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <span className="font-semibold text-sm tabular-nums" style={{ color: MUTED }}>
                          {Number(agent.total_paid ?? 0).toLocaleString()} ETB
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        {hasBalance ? (
                          canManage ? (
                            <Button
                              type="button"
                              disabled={payingAgentId === agent.id}
                              onClick={() => payMutation.mutate(agent)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition shadow-2xs cursor-pointer hover:opacity-90 active:scale-95"
                              style={{ background: BRAND }}
                            >
                              <Check size={13} className="mr-1" />
                              <span>{payingAgentId === agent.id ? 'Processing…' : 'Mark as Paid'}</span>
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock size={12} className="text-amber-700" />
                              <span>Pending Settlement</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={12} className="text-emerald-700" />
                            <span>Settled</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
