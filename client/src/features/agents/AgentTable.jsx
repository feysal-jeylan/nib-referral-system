/**
 * features/agents/AgentTable.jsx
 * ───────────────────────────────
 * Displays agents table with:
 *   - Inline Approve / Reject for PENDING applications
 *   - Three-dot DropdownMenu actions on each row:
 *       • View Details
 *       • Edit Profile
 *       • Suspend Agent (when APPROVED) / Activate Agent (when SUSPENDED)
 *       • Delete Agent (with 409 referral protection)
 *
 * Props:
 *   agents          {object[]}
 *   loading         {boolean}
 *   isAdmin         {boolean}
 *   actioning       {Set<number>}
 *   onApprove       {(id, name) => void}
 *   onReject        {(id, name) => void}
 *   onViewDetails   {(agent) => void}
 *   onEditProfile   {(agent) => void}
 *   onToggleSuspend {(agent) => void}
 *   onDeleteAgent   {(agent) => void}
 */
import { MoreVertical } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { RewardBadge, AgentStatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  onViewDetails,
  onEditProfile,
  onToggleSuspend,
  onDeleteAgent,
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

  const showActions = isAdmin;

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
                className={`px-6 py-3 text-[11px] font-semibold uppercase tracking-wider ${
                  h === 'Actions' ? 'text-right' : 'text-left'
                }`}
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
                  {a.referral_code ? (
                    <code
                      className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ background: 'rgba(138,77,31,0.08)', color: BRAND }}
                    >
                      {a.referral_code}
                    </code>
                  ) : (
                    <span className="text-xs" style={{ color: MUTED }}>—</span>
                  )}
                </td>

                <td className="px-6 py-4">
                  <span
                    className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-full text-xs font-bold px-2"
                    style={{ background: 'rgba(212,175,55,0.15)', color: '#7C5900' }}
                    title="Successful referrals"
                  >
                    {a.successful_referrals ?? 0}
                  </span>
                </td>

                <td className="px-6 py-4"><RewardBadge tier={a.current_reward} /></td>

                <td className="px-6 py-4"><AgentStatusPill status={a.status} /></td>

                {showActions && (
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {a.status === 'PENDING' && (
                        <div className="flex items-center gap-1.5 mr-1">
                          <button
                            disabled={busy}
                            onClick={() => onApprove?.(a.id, a.name)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(46,125,50,0.10)', color: '#2E7D32', border: '1px solid rgba(46,125,50,0.25)' }}
                            title="Approve agent"
                          >
                            {busy ? <Spinner small /> : '✓ Approve'}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => onReject?.(a.id, a.name)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.25)' }}
                            title="Reject agent"
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
                            className="h-8 w-8 p-0 text-text-3 hover:text-text-1 hover:bg-[#FAF8F5] rounded-md"
                            aria-label={`Actions for ${a.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 bg-white border border-[#E5DED6] shadow-md z-50">
                          <DropdownMenuItem
                            onClick={() => onViewDetails?.(a)}
                            className="cursor-pointer text-[#3E2723] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#3E2723]"
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onEditProfile?.(a)}
                            className="cursor-pointer text-[#3E2723] hover:bg-[#FAF8F5] focus:bg-[#F5EDE6] focus:text-[#3E2723]"
                          >
                            Edit Profile
                          </DropdownMenuItem>

                          {a.status === 'APPROVED' && (
                            <DropdownMenuItem
                              onClick={() => onToggleSuspend?.(a)}
                              className="cursor-pointer text-[#7A2518] hover:bg-[#FDF3F0] focus:bg-[#FDF3F0] focus:text-[#7A2518]"
                            >
                              Suspend Agent
                            </DropdownMenuItem>
                          )}

                          {a.status === 'SUSPENDED' && (
                            <DropdownMenuItem
                              onClick={() => onToggleSuspend?.(a)}
                              className="cursor-pointer text-[#1A5C34] hover:bg-[#F2FAF4] focus:bg-[#F2FAF4] focus:text-[#1A5C34]"
                            >
                              Activate Agent
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onDeleteAgent?.(a)}
                            className="cursor-pointer text-[#C0392B] focus:text-[#C0392B] focus:bg-destructive/10"
                          >
                            Delete Agent
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
