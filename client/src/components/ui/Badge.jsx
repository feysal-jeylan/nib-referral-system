/**
 * components/ui/Badge.jsx
 * ────────────────────────
 * Collection of pill/badge display components used across the dashboard.
 * All are pure presentational — no state, no side-effects.
 */

// ── Reward badge metadata ──────────────────────────────────────────────────────
const REWARD_META = {
  Gold:   { cls: 'badge--gold',   label: '🥇 Gold'   },
  Silver: { cls: 'badge--silver', label: '🥈 Silver' },
  Bronze: { cls: 'badge--bronze', label: '🥉 Bronze' },
};

/**
 * RewardBadge — Gold / Silver / Bronze tier badge.
 * Props: tier {string | null}
 */
export function RewardBadge({ tier }) {
  if (!tier) return <span className="badge badge--none">None</span>;
  const m = REWARD_META[tier] ?? { cls: 'badge--none', label: tier };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

/**
 * StatusPill — referral status (PENDING / SUCCESSFUL / REJECTED).
 * Props: status {string}
 */
export function StatusPill({ status }) {
  const labels = { PENDING: 'Pending', SUCCESSFUL: 'Successful', REJECTED: 'Rejected' };
  return (
    <span className={`status-pill status-pill--${status}`}>
      {labels[status] ?? status}
    </span>
  );
}

/**
 * AgentStatusPill — agent approval status (PENDING / APPROVED / REJECTED).
 * Props: status {string}
 */
export function AgentStatusPill({ status }) {
  if (!status) return null;
  return (
    <span className={`agent-status-pill agent-status-pill--${status}`}>
      {status}
    </span>
  );
}

/**
 * CampaignStatusPill — campaign lifecycle status (DRAFT / ACTIVE / ENDED).
 * Props: status {string}
 */
export function CampaignStatusPill({ status }) {
  return (
    <span className={`camp-status-pill camp-status-pill--${status}`}>
      {status}
    </span>
  );
}

/**
 * IntegrationStatusPill — Temenos webhook event status.
 * Props: status {string}
 */
export function IntegrationStatusPill({ status }) {
  return (
    <span className={`integ-status-pill integ-status-pill--${status}`}>
      {status}
    </span>
  );
}

