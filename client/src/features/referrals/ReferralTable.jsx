/**
 * features/referrals/ReferralTable.jsx
 * ──────────────────────────────────────
 * Displays referrals and provides Approve / Reject action buttons for admins.
 * This component does NOT own fetch logic — status changes are delegated up to
 * the Dashboard via the onStatusChange prop.
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
      <div className="state-box">
        <Spinner />
        <p>Loading referrals…</p>
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
    <div className="table-wrap">
      <table className="data-table" aria-label="Referral list">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Customer</th>
            <th scope="col">Phone</th>
            <th scope="col">Agent</th>
            <th scope="col">Code</th>
            <th scope="col">Status</th>
            {isAdmin && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {referrals.map((r, i) => {
            const busy = updating.has(r.id);
            return (
              <tr key={r.id} className="data-row">
                <td className="td--index">{i + 1}</td>
                <td className="td--name">{r.customer_name}</td>
                <td style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.customer_phone}
                </td>
                <td>{r.agent_name}</td>
                <td><code className="code-chip">{r.referral_code}</code></td>
                <td><StatusPill status={r.status} /></td>
                {isAdmin && (
                  <td>
                    {r.status === 'PENDING' ? (
                      <div className="action-group">
                        <button
                          id={`approve-btn-${r.id}`}
                          className="btn btn--approve"
                          disabled={busy}
                          onClick={() => handleAction(r.id, 'SUCCESSFUL')}
                          aria-label={`Approve referral for ${r.customer_name}`}
                        >
                          {busy ? <Spinner small /> : '✓ Approve'}
                        </button>
                        <button
                          id={`reject-btn-${r.id}`}
                          className="btn btn--reject"
                          disabled={busy}
                          onClick={() => handleAction(r.id, 'REJECTED')}
                          aria-label={`Reject referral for ${r.customer_name}`}
                        >
                          {busy ? <Spinner small /> : '✕ Reject'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>—</span>
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

