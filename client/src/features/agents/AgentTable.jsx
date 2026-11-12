/**
 * features/agents/AgentTable.jsx
 * ───────────────────────────────
 * Displays agents. Pure display — no fetch calls.
 * Phase 2: Accepts actioning/onApprove/onReject props so PENDING
 * agents can be managed inline (replaces the old Dashboard section).
 *
 * Props:
 *   agents     {object[]}
 *   loading    {boolean}
 *   isAdmin    {boolean}
 *   actioning  {Set<number>}        — IDs currently being acted on
 *   onApprove  {(id, name) => void} — admin only
 *   onReject   {(id, name) => void} — admin only
 */
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { RewardBadge, AgentStatusPill } from '@/components/ui/Badge';

const BRAND     = '#8A4D1F';
const CHOCOLATE = '#3E2723';
const MUTED     = '#9C8577';
const BORDER    = 'rgba(138,77,31,0.10)';
const IVORY     = '#FAF8F5';

export default function AgentTable({
  agents,
  loading,
  isAdmin,
  actioning = new Set(),
  onApprove,
  onReject,
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Spinner />
        <p className="text-sm" style={{ color: MUTED }}>Loading agents…</p>
      </div>
    );
  }
  if (!agents.length) {
    return (
      <EmptyState
        icon="🏦"
        title="No agents yet"
        sub="Register your first agent using the form above."
      />
    );
  }

  const showActions = isAdmin && (onApprove || onReject);

  return (
    <div className="overflow-x-auto w-full">
      <table className="min-w-[800px] w-full text-sm border-collapse" aria-label="Agent list">
        <thead>
          <tr style={{ background: IVORY, borderBottom: `1px solid ${BORDER}` }}>
            {['#', 'Name', 'Referral Code', 'Referrals', 'Reward Tier', 'Status',
              ...(showActions ? ['Actions'] : [])
            ].map(h => (
              <th
                key={h}
                scope="col"
                className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: MUTED }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => {
            const busy = actioning.has(a.id);
            return (
              <tr
                key={a.id}
                className="transition-colors duration-100"
                style={{ borderBottom: `1px solid ${BORDER}` }}
                onMouseEnter={e => { e.currentTarget.style.background = IVORY; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              >
                <td className="px-6 py-4 text-xs tabular-nums" style={{ color: MUTED }}>{i + 1}</td>

                <td className="px-6 py-4 font-medium" style={{ color: CHOCOLATE }}>{a.name}</td>

                <td className="px-6 py-4">
                  {a.referral_code
                    ? <code className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(138,77,31,0.08)', color: BRAND }}>{a.referral_code}</code>
                    : <span className="text-xs" style={{ color: MUTED }}>—</span>
                  }
                </td>

                <td className="px-6 py-4">
                  <span
                    className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-full text-xs font-bold px-2"
                    style={{ background: 'rgba(212,175,55,0.15)', color: '#7C5900' }}
                    title="Successful referrals"
                  >
                    {a.successful_referrals}
                  </span>
                </td>

                <td className="px-6 py-4"><RewardBadge tier={a.current_reward} /></td>

                <td className="px-6 py-4"><AgentStatusPill status={a.status} /></td>

                {showActions && (
                  <td className="px-6 py-4">
                    {a.status === 'PENDING' ? (
                      <div className="flex items-center gap-2">
                        <button
                          disabled={busy}
                          onClick={() => onApprove(a.id, a.name)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(46,125,50,0.10)', color: '#2E7D32', border: '1px solid rgba(46,125,50,0.25)' }}
                        >
                          {busy ? <Spinner small /> : '✓ Approve'}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => onReject(a.id, a.name)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.25)' }}
                        >
                          {busy ? <Spinner small /> : '✕ Reject'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: MUTED }}>—</span>
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
