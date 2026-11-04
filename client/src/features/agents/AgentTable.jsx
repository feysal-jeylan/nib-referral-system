/**
 * features/agents/AgentTable.jsx
 * ───────────────────────────────
 * Displays all agents (or just the current agent for non-admin users).
 * Pure display component — no fetch calls.
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
      <div className="state-box">
        <Spinner />
        <p>Loading agents…</p>
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
    <div className="table-wrap">
      <table className="data-table" aria-label="Agent list">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Name</th>
            <th scope="col">Referral Code</th>
            <th scope="col">Successful Referrals</th>
            <th scope="col">Reward Tier</th>
            {isAdmin && <th scope="col">Status</th>}
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => (
            <tr key={a.id} className="data-row">
              <td className="td--index">{i + 1}</td>
              <td className="td--name">{a.name}</td>
              <td>
                {a.referral_code
                  ? <code className="code-chip">{a.referral_code}</code>
                  : <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>—</span>
                }
              </td>
              <td className="td--count">
                <span className="count-pill">{a.successful_referrals}</span>
              </td>
              <td><RewardBadge tier={a.current_reward} /></td>
              {isAdmin && <td><AgentStatusPill status={a.status} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

