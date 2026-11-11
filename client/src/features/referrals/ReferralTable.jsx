/**
 * features/referrals/ReferralTable.jsx
 * ──────────────────────────────────────
 * Displays referrals and provides Approve / Reject action buttons for admins.
 * This component does NOT own fetch logic — status changes are delegated up to
 * the Dashboard via the onStatusChange prop.
 * Pure Tailwind — no App.css dependency.
 *
 * Props:
 *   referrals      {object[]}
 *   loading        {boolean}
 *   onStatusChange {(id: string, newStatus: string) => Promise<void>}
 *   isAdmin        {boolean}
 */
import { useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/Badge';

export default function ReferralTable({ referrals, loading, onStatusChange, isAdmin }) {
  const [updating, setUpdating] = useState(new Set());

  async function handleAction(id, newStatus) {
    setUpdating(prev => new Set(prev).add(id));
    await onStatusChange(id, newStatus);
    setUpdating(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Spinner />
        <p className="text-text-3 text-sm">Loading referrals…</p>
      </div>
    );
  }
  if (!referrals.length) {
    return (
      <EmptyState
        icon="📋"
        title="No referrals yet"
        sub={
          isAdmin
            ? 'Referrals appear here once Temenos sends a webhook event.'
            : 'No referrals have been registered under your code yet.'
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto w-full">
      <table className="min-w-[800px] w-full text-sm border-collapse" aria-label="Referral list">
        <thead>
          <tr className="bg-panel border-b border-border">
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">#</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Customer</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Phone</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Agent</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Code</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Status</th>
            {isAdmin && <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {referrals.map((r, i) => {
            const busy = updating.has(r.id);
            return (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                <td className="px-6 py-4 text-text-3 text-xs tabular-nums">{i + 1}</td>
                <td className="px-6 py-4 text-text-1 font-medium">{r.customer_name}</td>
                <td className="px-6 py-4 text-text-2 tabular-nums">{r.customer_phone}</td>
                <td className="px-6 py-4 text-text-2">{r.agent_name}</td>
                <td className="px-6 py-4">
                  <code className="font-mono text-xs bg-brand-light text-brand px-2 py-0.5 rounded">
                    {r.referral_code}
                  </code>
                </td>
                <td className="px-6 py-4"><StatusPill status={r.status} /></td>
                {isAdmin && (
                  <td className="px-6 py-4">
                    {r.status === 'PENDING' ? (
                      <div className="flex items-center gap-2">
                        <button
                          id={`approve-btn-${r.id}`}
                          disabled={busy}
                          onClick={() => handleAction(r.id, 'SUCCESSFUL')}
                          aria-label={`Approve referral for ${r.customer_name}`}
                          className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner small /> : '✓ Approve'}
                        </button>
                        <button
                          id={`reject-btn-${r.id}`}
                          disabled={busy}
                          onClick={() => handleAction(r.id, 'REJECTED')}
                          aria-label={`Reject referral for ${r.customer_name}`}
                          className="inline-flex items-center gap-1.5 bg-reject-bg text-reject-txt border border-reject-bdr text-xs font-semibold px-3 py-1.5 rounded transition-colors hover:bg-[#f9e5e1] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner small /> : '✕ Reject'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-text-3 text-xs">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
