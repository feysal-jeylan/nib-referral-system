/**
 * features/referrals/ReferralTable.jsx
 * ──────────────────────────────────────
 * Displays referrals with:
 *   - Customer, Phone, Agent, Referral Code
 *   - Campaign Code monospace badge
 *   - Status pill
 *   - Inline Approve / Reject for PENDING applications
 *   - Three-dot DropdownMenu actions on each row:
 *       • View Details
 *       • Delete (disabled for SUCCESSFUL referrals)
 *
 * Props:
 *   referrals       {object[]}
 *   loading         {boolean}
 *   onStatusChange  {(id: number|string, newStatus: string) => Promise<void>}
 *   onViewDetails   {(referral: object) => void}
 *   onDeleteRequest {(referral: object) => void}
 *   isAdmin         {boolean}
 */

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ReferralTable({
  referrals,
  loading,
  onStatusChange,
  onViewDetails,
  onDeleteRequest,
  isAdmin,
}) {
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
      <table className="min-w-[850px] w-full text-sm border-collapse" aria-label="Referral list">
        <thead>
          <tr className="bg-panel border-b border-border">
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">#</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Customer</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Phone</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Agent</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Code</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Campaign Code</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Status</th>
            {isAdmin && (
              <th scope="col" className="px-6 py-3 text-right text-[11px] font-semibold text-text-3 uppercase tracking-widest">Actions</th>
            )}
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
                <td className="px-6 py-4 text-text-2">{r.agent_name || '—'}</td>
                <td className="px-6 py-4">
                  {r.referral_code ? (
                    <code className="font-mono text-xs bg-brand-light text-brand px-2 py-0.5 rounded">
                      {r.referral_code}
                    </code>
                  ) : (
                    <span className="text-text-3 text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {r.campaign_code ? (
                    <code className="font-mono text-xs bg-[#FAF8F5] border border-border text-[#4A3728] px-2 py-0.5 rounded font-semibold">
                      {r.campaign_code}
                    </code>
                  ) : (
                    <span className="text-text-3 text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4"><StatusPill status={r.status} /></td>
                {isAdmin && (
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {r.status === 'PENDING' && (
                        <div className="flex items-center gap-1.5 mr-1">
                          <button
                            id={`approve-btn-${r.id}`}
                            disabled={busy}
                            onClick={() => handleAction(r.id, 'SUCCESSFUL')}
                            aria-label={`Approve referral for ${r.customer_name}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Approve referral"
                          >
                            {busy ? <Spinner small /> : '✓ Approve'}
                          </button>
                          <button
                            id={`reject-btn-${r.id}`}
                            disabled={busy}
                            onClick={() => handleAction(r.id, 'REJECTED')}
                            aria-label={`Reject referral for ${r.customer_name}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-reject-bg text-reject-txt border border-reject-bdr hover:bg-[#f9e5e1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Reject referral"
                          >
                            {busy ? <Spinner small /> : '✕ Reject'}
                          </button>
                        </div>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-text-3 hover:text-text-1 hover:bg-panel rounded-md"
                            aria-label={`Actions for referral #${r.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 bg-white border border-[#E5DED6] shadow-md z-50">
                          <DropdownMenuItem
                            onClick={() => onViewDetails?.(r)}
                            className="cursor-pointer text-[#3E2723] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#3E2723]"
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={r.status === 'SUCCESSFUL'}
                            onClick={() => {
                              if (r.status !== 'SUCCESSFUL') {
                                onDeleteRequest?.(r);
                              }
                            }}
                            className="cursor-pointer text-[#C0392B] focus:text-[#C0392B] focus:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={r.status === 'SUCCESSFUL' ? 'Cannot delete successful financial records' : 'Delete referral'}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
