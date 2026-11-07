/**
 * components/ui/Badge.jsx
 * ────────────────────────
 * Collection of pill/badge display components used across the dashboard.
 * All are pure presentational — no state, no side-effects.
 * Pure Tailwind — no App.css dependency.
 */

// ── Pill base class ────────────────────────────────────────────────────────────
const PILL = 'inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wide border';

// ── Reward badge ───────────────────────────────────────────────────────────────
const REWARD_STYLES = {
  Gold:   'bg-gold-light text-[#7C5900] border-[#D4AF37]/40',
  Silver: 'bg-[#F5F5F5] text-[#555] border-[#CCC]',
  Bronze: 'bg-[#FDF3EC] text-[#7A3B1E] border-[#D4956A]/40',
};

/**
 * RewardBadge — Gold / Silver / Bronze tier badge.
 * Props: tier {string | null}
 */
export function RewardBadge({ tier }) {
  if (!tier) {
    return (
      <span className={`${PILL} bg-panel text-text-3 border-border`}>
        None
      </span>
    );
  }
  const cls = REWARD_STYLES[tier] ?? 'bg-panel text-text-3 border-border';
  const labels = { Gold: '🥇 Gold', Silver: '🥈 Silver', Bronze: '🥉 Bronze' };
  return (
    <span className={`${PILL} ${cls}`}>
      {labels[tier] ?? tier}
    </span>
  );
}

// ── Referral status ────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  PENDING:    `${PILL} bg-pending-bg text-pending-txt border-pending-bdr`,
  SUCCESSFUL: `${PILL} bg-success-bg text-success-txt border-success-bdr`,
  REJECTED:   `${PILL} bg-reject-bg text-reject-txt border-reject-bdr`,
};

/**
 * StatusPill — referral status (PENDING / SUCCESSFUL / REJECTED).
 * Props: status {string}
 */
export function StatusPill({ status }) {
  const labels = { PENDING: 'Pending', SUCCESSFUL: 'Successful', REJECTED: 'Rejected' };
  const cls = STATUS_STYLES[status] ?? `${PILL} bg-panel text-text-3 border-border`;
  return <span className={cls}>{labels[status] ?? status}</span>;
}

// ── Agent approval status ──────────────────────────────────────────────────────
const AGENT_STATUS_STYLES = {
  PENDING:  `${PILL} bg-pending-bg text-pending-txt border-pending-bdr`,
  APPROVED: `${PILL} bg-approved-bg text-approved-txt border-approved-bdr`,
  REJECTED: `${PILL} bg-reject-bg text-reject-txt border-reject-bdr`,
};

/**
 * AgentStatusPill — agent approval status (PENDING / APPROVED / REJECTED).
 * Props: status {string}
 */
export function AgentStatusPill({ status }) {
  if (!status) return null;
  const cls = AGENT_STATUS_STYLES[status] ?? `${PILL} bg-panel text-text-3 border-border`;
  return <span className={cls}>{status}</span>;
}

// ── Campaign lifecycle status ──────────────────────────────────────────────────
const CAMP_STATUS_STYLES = {
  DRAFT:  `${PILL} bg-pending-bg text-pending-txt border-pending-bdr`,
  ACTIVE: `${PILL} bg-approved-bg text-approved-txt border-approved-bdr`,
  ENDED:  `${PILL} bg-panel text-text-3 border-border`,
};

/**
 * CampaignStatusPill — campaign lifecycle status (DRAFT / ACTIVE / ENDED).
 * Props: status {string}
 */
export function CampaignStatusPill({ status }) {
  const cls = CAMP_STATUS_STYLES[status] ?? `${PILL} bg-panel text-text-3 border-border`;
  return <span className={cls}>{status}</span>;
}

// ── Integration event status ───────────────────────────────────────────────────
const INTEG_STATUS_STYLES = {
  PROCESSED: `${PILL} bg-success-bg text-success-txt border-success-bdr`,
  FAILED:    `${PILL} bg-reject-bg text-reject-txt border-reject-bdr`,
  PENDING:   `${PILL} bg-pending-bg text-pending-txt border-pending-bdr`,
};

/**
 * IntegrationStatusPill — Temenos webhook event status.
 * Props: status {string}
 */
export function IntegrationStatusPill({ status }) {
  const cls = INTEG_STATUS_STYLES[status] ?? `${PILL} bg-panel text-text-3 border-border`;
  return <span className={cls}>{status}</span>;
}
