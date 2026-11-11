/**
 * features/agents/AgentTable.jsx
 * ───────────────────────────────
 * Displays all agents (or just the current agent for non-admin users).
 * Pure display component — no fetch calls.
 * Pure Tailwind — no App.css dependency.
 *
 * Props:
 *   agents  {object[]}
 *   loading {boolean}
 *   isAdmin {boolean}
 */
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { RewardBadge, AgentStatusPill } from '@/components/ui/Badge';

export default function AgentTable({ agents, loading, isAdmin }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Spinner />
        <p className="text-text-3 text-sm">Loading agents…</p>
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

  return (
    <div className="overflow-x-auto w-full">
      <table className="min-w-[800px] w-full text-sm border-collapse" aria-label="Agent list">
        <thead>
          <tr className="bg-panel border-b border-border">
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">#</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Name</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Referral Code</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Successful Referrals</th>
            <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Reward Tier</th>
            {isAdmin && <th scope="col" className="px-6 py-3 text-left text-[11px] font-semibold text-text-3 uppercase tracking-widest">Status</th>}
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => (
            <tr key={a.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
              <td className="px-6 py-4 text-text-3 text-xs tabular-nums">{i + 1}</td>
              <td className="px-6 py-4 text-text-1 font-medium">{a.name}</td>
              <td className="px-6 py-4">
                {a.referral_code
                  ? <code className="font-mono text-xs bg-brand-light text-brand px-2 py-0.5 rounded">{a.referral_code}</code>
                  : <span className="text-text-3 text-xs">—</span>
                }
              </td>
              <td className="px-6 py-4">
                <span
                  className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-full bg-gold-light text-[#7C5900] text-xs font-bold px-2"
                  title="Successful referrals"
                >
                  {a.successful_referrals}
                </span>
              </td>
              <td className="px-6 py-4"><RewardBadge tier={a.current_reward} /></td>
              {isAdmin && <td className="px-6 py-4"><AgentStatusPill status={a.status} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
