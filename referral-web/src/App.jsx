/**
 * referral-web/src/App.jsx
 * ─────────────────────────
 * Nib International Bank — Internal Referral Dashboard
 *
 * Auth integration:
 *   - useAuth() provides { user, loading, logout } from AuthContext.
 *   - If loading: show full-page spinner (prevents login-screen flash).
 *   - If user is null: render <Login /> (not authenticated).
 *   - If user exists: render the full dashboard.
 *
 * Security: EVERY fetch call includes `credentials: 'include'` so the
 * browser attaches the HttpOnly JWT cookie automatically. No token is
 * ever stored in JavaScript — it lives only in the browser's cookie jar.
 *
 * V2 Architecture change (RULES.md §6):
 *   The manual "Register Referral" form (ReferralForm) has been removed.
 *   Customers are now registered exclusively via the Temenos webhook
 *   (POST /api/integration/account-opened). A static informational box
 *   replaces the form in both the Admin Dashboard and Agent Portal.
 *
 * V5 Architecture change (RULES.md §6):
 *   Public agent self-registration is now supported. Applicants submit via
 *   POST /api/agents/apply (no auth). Admins approve via the new
 *   "Pending Agent Applications" section which calls PATCH /api/agents/:id/approve.
 *   The AgentTable now shows a Status column for Admin users.
 *
 * Sections:
 *   1.  Primitive UI components (Toast, StatusPill, RewardBadge, Spinner, InfoBox)
 *   2.  AgentStatusPill       — coloured pill for PENDING / APPROVED / REJECTED agents
 *   3.  AgentForm             — ADMIN: register a new agent (POST /api/agents)
 *   4.  AgentTable            — show all agents with reward tier and status (ADMIN)
 *   5.  ReferralTable         — show referrals with approve/reject actions (ADMIN)
 *   6.  CampaignForm          — ADMIN: create a new campaign (POST /api/campaigns)
 *   7.  CampaignTable         — ADMIN: list campaigns with rules + activate action
 *   8.  CampaignStatusPill    — coloured pill for DRAFT / ACTIVE / EXPIRED
 *   9.  IntegrationLogsTable  — ADMIN: Temenos webhook audit log
 *  10.  IntegrationStatusPill — coloured pill for RECEIVED / PROCESSED / FAILED
 *  11.  App (root)            — auth gate, orchestrates state, data fetching, toasts
 *  12.  Dashboard             — rendered when authenticated, holds all business logic
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import './Login.css';
import { useAuth } from './AuthContext';
import Login from './Login';
import ChangePassword from './ChangePassword';

// ─── Config ───────────────────────────────────────────────────────────────────
const API = '/api'; // Vite dev-proxy rewrites /api → http://localhost:3000

// ─── Shared fetch options — ALWAYS include credentials ───────────────────────
// credentials: 'include' tells the browser to attach all cookies (including
// the HttpOnly JWT token) to every request. Without this, the API returns 401.
const FETCH_OPTS = { credentials: 'include' };

// ─── Reward badge metadata ────────────────────────────────────────────────────
const REWARD_META = {
  Gold:   { cls: 'badge--gold',   label: '🥇 Gold'   },
  Silver: { cls: 'badge--silver', label: '🥈 Silver' },
  Bronze: { cls: 'badge--bronze', label: '🥉 Bronze' },
};

// ─── 1. Primitive UI ─────────────────────────────────────────────────────────

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.type}`} role="alert" aria-live="assertive">
      <span>{toast.message}</span>
      <button className="toast__close" onClick={onDismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}

function StatusPill({ status }) {
  const labels = { PENDING: 'Pending', SUCCESSFUL: 'Successful', REJECTED: 'Rejected' };
  return (
    <span className={`status-pill status-pill--${status}`}>
      {labels[status] ?? status}
    </span>
  );
}

function RewardBadge({ tier }) {
  if (!tier) return <span className="badge badge--none">None</span>;
  const m = REWARD_META[tier] ?? { cls: 'badge--none', label: tier };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

function Spinner({ small = false }) {
  return <div className={small ? 'spinner spinner--sm' : 'spinner'} aria-hidden="true" />;
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="state-box">
      <span className="state-box__icon" aria-hidden="true">{icon}</span>
      <p className="state-box__title">{title}</p>
      <p className="state-box__sub">{sub}</p>
    </div>
  );
}

/*
  InfoBox — replaces the removed ReferralForm in both Admin and Agent views.
  Communicates the V2 architecture to users so they understand why there is no
  manual entry form — referrals arrive automatically from Temenos.
*/
function InfoBox({ message }) {
  return (
    <div className="info-box" role="note">
      <span className="info-box__icon" aria-hidden="true">ℹ</span>
      <p className="info-box__text">{message}</p>
    </div>
  );
}

// ─── 2. AgentStatusPill ───────────────────────────────────────────────────────
//
// Colour-coded pill for the agent `status` field added in V5.
//   PENDING  → amber/yellow — awaiting Admin review
//   APPROVED → green        — agent is active and can log in
//   REJECTED → muted grey   — application was declined
function AgentStatusPill({ status }) {
  if (!status) return null;
  return (
    <span className={`agent-status-pill agent-status-pill--${status}`}>
      {status}
    </span>
  );
}

// ─── 3. AgentForm ─────────────────────────────────────────────────────────────
function AgentForm({ onCreated, onToast }) {
  const [form, setForm]             = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res  = await fetch(`${API}/agents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
        ...FETCH_OPTS,
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          onToast({ type: 'error', message: '🔒 Your session has expired. Please log in again.' });
          return;
        }
        const msg = res.status === 409
          ? '⚠️ An agent with this phone number or email already exists.'
          : (data.error ?? 'Something went wrong. Please try again.');
        onToast({ type: 'error', message: msg });
        return;
      }

      onCreated({
        id: data.id, name: data.name,
        referral_code: data.referral_code,
        status: data.status ?? 'APPROVED',
        successful_referrals: 0, current_reward: null,
      });
      onToast({
        type: 'success',
        message: `✅ Agent "${data.name}" created — Code: ${data.referral_code} · Temp Password: ${data.temp_password}`,
      });
      setForm({ name: '', phone: '', email: '' });
      nameRef.current?.focus();
    } catch {
      onToast({ type: 'error', message: '🔴 Cannot reach the server. Is the API running?' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id="agent-form"
      className="agent-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Register a new agent"
    >
      <h2 className="form__title">Register New Agent</h2>
      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="agent-name">Full Name</label>
          <input id="agent-name" name="name" type="text"
            placeholder="e.g. Abebe Kebede"
            value={form.name} onChange={handleChange}
            required ref={nameRef} autoComplete="off" />
        </div>
        <div className="form__field">
          <label htmlFor="agent-phone">Phone Number</label>
          <input id="agent-phone" name="phone" type="tel"
            placeholder="e.g. 0911234567"
            value={form.phone} onChange={handleChange}
            required autoComplete="off" />
        </div>
        <div className="form__field form__field--wide">
          <label htmlFor="agent-email">Email Address</label>
          <input id="agent-email" name="email" type="email"
            placeholder="e.g. abebe@nib.com"
            value={form.email} onChange={handleChange}
            required autoComplete="off" />
        </div>
      </div>
      <button id="submit-agent-btn" type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting && <Spinner small />}
        {submitting ? 'Registering…' : 'Register Agent'}
      </button>
    </form>
  );
}

// ─── 4. AgentTable ────────────────────────────────────────────────────────────
//
// isAdmin controls whether the Status column is shown. Agents only see their
// own row and do not need to see a status pill (they are already approved).
function AgentTable({ agents, loading, isAdmin }) {
  if (loading) return <div className="state-box"><Spinner /><p>Loading agents…</p></div>;
  if (!agents.length) return (
    <EmptyState icon="🏦" title="No agents yet"
      sub="Register your first agent using the form above." />
  );
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
              {isAdmin && (
                <td><AgentStatusPill status={a.status} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 5. ReferralTable ─────────────────────────────────────────────────────────
//
// isAdmin controls whether the Actions column (Approve / Reject) is shown.
// When false (AGENT view), the column is hidden entirely — agents can only
// read their own referral list, not modify statuses.
function ReferralTable({ referrals, loading, onStatusChange, isAdmin }) {
  const [updating, setUpdating] = useState(new Set());

  async function handleAction(id, newStatus) {
    setUpdating(prev => new Set(prev).add(id));
    await onStatusChange(id, newStatus);
    setUpdating(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  if (loading) return <div className="state-box"><Spinner /><p>Loading referrals…</p></div>;
  if (!referrals.length) return (
    <EmptyState icon="📋" title="No referrals yet"
      sub={isAdmin
        ? 'Referrals appear here once Temenos sends a webhook event.'
        : 'No referrals have been registered under your code yet.'} />
  );

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

// ─── 6. CampaignForm ──────────────────────────────────────────────────────────
function CampaignForm({ onCreated, onToast }) {
  const EMPTY = { name: '', start_date: '', end_date: '', reward_type: 'CASH', reward_value: '' };
  const [form, setForm]             = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/campaigns`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          start_date: form.start_date ? new Date(form.start_date).toISOString() : '',
          end_date:   form.end_date   ? new Date(form.end_date).toISOString()   : '',
        }),
        ...FETCH_OPTS,
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          onToast({ type: 'error', message: '🔒 Your session has expired. Please log in again.' });
          return;
        }
        onToast({ type: 'error', message: data.error ?? 'Failed to create campaign.' });
        return;
      }

      onCreated();
      onToast({ type: 'success', message: `✅ Campaign "${data.campaign.name}" created as DRAFT.` });
      setForm(EMPTY);
      nameRef.current?.focus();
    } catch {
      onToast({ type: 'error', message: '🔴 Cannot reach the server. Is the API running?' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id="campaign-form"
      className="agent-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Create a new campaign"
    >
      <h2 className="form__title">Create New Campaign</h2>
      <div className="form__grid form__grid--3col">
        <div className="form__field">
          <label htmlFor="camp-name">Campaign Name</label>
          <input
            id="camp-name" name="name" type="text"
            placeholder="e.g. Q4 Savings Drive"
            value={form.name} onChange={handleChange}
            required ref={nameRef} autoComplete="off"
          />
        </div>
        <div className="form__field">
          <label htmlFor="camp-start">Start Date</label>
          <input
            id="camp-start" name="start_date" type="date"
            value={form.start_date} onChange={handleChange}
            required
          />
        </div>
        <div className="form__field">
          <label htmlFor="camp-end">End Date</label>
          <input
            id="camp-end" name="end_date" type="date"
            value={form.end_date} onChange={handleChange}
            required
          />
        </div>
        <div className="form__field">
          <label htmlFor="camp-reward-type">Reward Type</label>
          <select
            id="camp-reward-type" name="reward_type"
            value={form.reward_type} onChange={handleChange}
            required
          >
            <option value="CASH">CASH</option>
            <option value="BADGE">BADGE</option>
          </select>
        </div>
        <div className="form__field form__field--wide">
          <label htmlFor="camp-reward-value">Reward Value</label>
          <input
            id="camp-reward-value" name="reward_value" type="text"
            placeholder="e.g. 500 ETB or Gold Tier Badge"
            value={form.reward_value} onChange={handleChange}
            required autoComplete="off"
          />
        </div>
      </div>
      <button id="submit-campaign-btn" type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting && <Spinner small />}
        {submitting ? 'Creating…' : 'Create Campaign'}
      </button>
    </form>
  );
}

// ─── 7. CampaignTable ─────────────────────────────────────────────────────────
function CampaignTable({ campaigns, loading, onActivated, onToast }) {
  const [activating, setActivating] = useState(new Set());

  async function handleActivate(id, name) {
    setActivating(prev => new Set(prev).add(id));
    try {
      const res  = await fetch(`${API}/campaigns/${id}/activate`, {
        method: 'PATCH',
        ...FETCH_OPTS,
      });
      const data = await res.json();
      if (!res.ok) {
        onToast({ type: 'error', message: data.error ?? 'Activation failed.' });
        return;
      }
      onActivated();
      onToast({ type: 'success', message: `✅ Campaign "${name}" is now ACTIVE.` });
    } catch {
      onToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    } finally {
      setActivating(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  if (loading) return <div className="state-box"><Spinner /><p>Loading campaigns…</p></div>;
  if (!campaigns.length) return (
    <EmptyState icon="📋" title="No campaigns yet"
      sub="Create your first campaign using the form above." />
  );

  return (
    <div className="table-wrap">
      <table className="data-table" aria-label="Campaign list">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Name / Rules</th>
            <th scope="col">Start Date</th>
            <th scope="col">End Date</th>
            <th scope="col">Reward</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const busy  = activating.has(c.id);
            const rules = Array.isArray(c.rules) ? c.rules : [];
            return (
              <tr key={c.id} className="data-row">
                <td className="td--index">{i + 1}</td>
                <td className="td--name">
                  <span>{c.name}</span>
                  {rules.length > 0 && (
                    <div className="rule-tags">
                      {rules.map(r => {
                        const val = Object.values(r.rule_value ?? {})[0] ?? '';
                        return (
                          <span key={r.id} className="rule-tag">
                            {r.rule_type}: {String(val)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>
                  {new Date(c.start_date).toLocaleDateString()}
                </td>
                <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>
                  {new Date(c.end_date).toLocaleDateString()}
                </td>
                <td>
                  <span className="reward-chip reward-chip--type">{c.reward_type}</span>
                  {' '}
                  <span className="reward-chip reward-chip--value">{c.reward_value}</span>
                </td>
                <td><CampaignStatusPill status={c.status} /></td>
                <td>
                  {c.status === 'DRAFT' ? (
                    <button
                      id={`activate-btn-${c.id}`}
                      className="btn btn--activate"
                      disabled={busy}
                      onClick={() => handleActivate(c.id, c.name)}
                      aria-label={`Activate campaign ${c.name}`}
                    >
                      {busy ? <Spinner small /> : '▶ Activate'}
                    </button>
                  ) : c.status === 'ACTIVE' ? (
                    <span className="badge badge--active-indicator" aria-label="Campaign is active">
                      Active
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 8. CampaignStatusPill ───────────────────────────────────────────────────
function CampaignStatusPill({ status }) {
  return (
    <span className={`camp-status-pill camp-status-pill--${status}`}>
      {status}
    </span>
  );
}

// ─── 9. IntegrationLogsTable ─────────────────────────────────────────────────
//
// ADMIN-ONLY. Displays the last 20 rows from integration_logs in a table.
// Each row shows: Transaction ID, Customer Name (from JSONB payload),
// Status pill (RECEIVED / PROCESSED / FAILED), and Date.
function IntegrationLogsTable({ logs, loading }) {
  if (loading) return <div className="state-box"><Spinner /><p>Loading integration logs…</p></div>;
  if (!logs.length) return (
    <EmptyState
      icon="📡"
      title="No integration events yet"
      sub="Events appear here when Temenos sends a webhook to POST /api/integration/account-opened."
    />
  );

  return (
    <div className="table-wrap">
      <table className="data-table" aria-label="Temenos integration log">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Transaction ID</th>
            <th scope="col">Customer Name</th>
            <th scope="col">Status</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <tr key={log.id} className="data-row">
              <td className="td--index">{i + 1}</td>
              <td>
                <code className="code-chip">{log.transaction_id}</code>
              </td>
              <td className="td--name">
                {log.payload?.customer_name ?? '—'}
              </td>
              <td>
                <IntegrationStatusPill status={log.status} />
              </td>
              <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {new Date(log.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 10. IntegrationStatusPill ────────────────────────────────────────────────
function IntegrationStatusPill({ status }) {
  return (
    <span className={`integ-status-pill integ-status-pill--${status}`}>
      {status}
    </span>
  );
}

// ─── 11. App (root) ───────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, logout } = useAuth();

  const [agents,     setAgents]     = useState([]);
  const [referrals,  setReferrals]  = useState([]);
  const [agentsLoading,    setAgentsLoading]    = useState(true);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [toast,      setToast]      = useState(null);
  const toastTimer = useRef(null);

  // ── Gate 1: Auth loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="auth-loading" role="status" aria-label="Checking authentication…">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <p className="auth-loading__text">Verifying session…</p>
      </div>
    );
  }

  // ── Gate 2: Not authenticated ────────────────────────────────────────────
  if (!user) return <Login />;

  // ── Gate 2.5: Forced password change ─────────────────────────────────────
  if (user.must_change_password) return <ChangePassword />;

  // ── Gate 3: Authenticated + password set → Dashboard ─────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return <Dashboard
    user={user}
    logout={logout}
    agents={agents}           setAgents={setAgents}
    referrals={referrals}     setReferrals={setReferrals}
    agentsLoading={agentsLoading}       setAgentsLoading={setAgentsLoading}
    referralsLoading={referralsLoading} setReferralsLoading={setReferralsLoading}
    toast={toast}             setToast={setToast}
    toastTimer={toastTimer}
  />;
}

// ─── 12. Dashboard ────────────────────────────────────────────────────────────
//
// Extracted so all hooks run unconditionally (Rules of Hooks).
function Dashboard({
  user, logout,
  agents, setAgents,
  referrals, setReferrals,
  agentsLoading, setAgentsLoading,
  referralsLoading, setReferralsLoading,
  toast, setToast, toastTimer,
}) {
  const isAdmin = user.role === 'ADMIN';
  const isAgent = user.role === 'AGENT';

  // ── ADMIN-only state ─────────────────────────────────────────────────────
  const [campaigns,        setCampaigns]        = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [integLogs,        setIntegLogs]        = useState([]);
  const [integLogsLoading, setIntegLogsLoading] = useState(true);

  // ── Per-row loading state for approve / reject actions ───────────────────
  // Stores the Set of agent IDs currently being approved or rejected.
  const [actioning, setActioning] = useState(new Set());

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const fetches = [
          fetch(`${API}/agents`,    FETCH_OPTS),
          fetch(`${API}/referrals`, FETCH_OPTS),
        ];
        if (isAdmin) {
          fetches.push(fetch(`${API}/campaigns`,        FETCH_OPTS));
          fetches.push(fetch(`${API}/integration/logs`, FETCH_OPTS));
        }

        const responses = await Promise.all(fetches);
        const [aData, rData] = await Promise.all([
          responses[0].json(),
          responses[1].json(),
        ]);

        setAgents(Array.isArray(aData) ? aData : []);
        setReferrals(Array.isArray(rData) ? rData : (rData.referrals ?? []));

        if (isAdmin) {
          const cData = await responses[2].json();
          setCampaigns(Array.isArray(cData.campaigns) ? cData.campaigns : []);

          const lData = await responses[3].json();
          setIntegLogs(Array.isArray(lData.logs) ? lData.logs : []);
        }
      } catch {
        showToast({ type: 'error', message: '🔴 Failed to load data. Is the API running?' });
      } finally {
        setAgentsLoading(false);
        setReferralsLoading(false);
        setCampaignsLoading(false);
        setIntegLogsLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refresh helpers ──────────────────────────────────────────────────────
  const refreshAgents = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/agents`, FETCH_OPTS);
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      showToast({ type: 'error', message: '🔴 Could not refresh agent list.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCampaigns = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/campaigns`, FETCH_OPTS);
      const data = await res.json();
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch {
      showToast({ type: 'error', message: '🔴 Could not refresh campaigns.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshIntegLogs = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/integration/logs`, FETCH_OPTS);
      const data = await res.json();
      setIntegLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      showToast({ type: 'error', message: '🔴 Could not refresh integration logs.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toast ────────────────────────────────────────────────────────────────
  function showToast(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  // ── Agent created (admin manually registers) ─────────────────────────────
  function handleAgentCreated(newAgent) {
    setAgents(prev => [newAgent, ...prev]);
  }

  // ── Approve a pending agent ──────────────────────────────────────────────
  async function handleApprove(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      const res  = await fetch(`${API}/agents/${id}/approve`, {
        method: 'PATCH',
        ...FETCH_OPTS,
      });
      const data = await res.json();

      if (!res.ok) {
        showToast({ type: 'error', message: data.error ?? 'Approval failed.' });
        return;
      }

      // Refresh the full agent list so status pill updates everywhere.
      await refreshAgents();

      showToast({
        type: 'success',
        message: `✅ "${name}" approved — Code: ${data.referral_code} · Temp Password: ${data.temp_password}`,
      });
    } catch {
      showToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Reject a pending agent ───────────────────────────────────────────────
  async function handleReject(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      const res  = await fetch(`${API}/agents/${id}/reject`, {
        method: 'PATCH',
        ...FETCH_OPTS,
      });
      const data = await res.json();

      if (!res.ok) {
        showToast({ type: 'error', message: data.error ?? 'Rejection failed.' });
        return;
      }

      await refreshAgents();
      showToast({ type: 'success', message: `Application from "${name}" has been rejected.` });
    } catch {
      showToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Status update (Approve / Reject referral) ────────────────────────────
  async function handleStatusChange(referralId, newStatus) {
    try {
      const res = await fetch(`${API}/referrals/${referralId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
        ...FETCH_OPTS,
      });

      if (!res.ok) {
        const data = await res.json();
        showToast({ type: 'error', message: data.error ?? 'Status update failed.' });
        return;
      }

      // Update in-place — no full reload needed.
      setReferrals(prev =>
        prev.map(r => r.id === referralId ? { ...r, status: newStatus } : r)
      );

      if (newStatus === 'SUCCESSFUL') {
        const aRes  = await fetch(`${API}/agents`, FETCH_OPTS);
        const aData = await aRes.json();
        setAgents(Array.isArray(aData) ? aData : []);
      }

      showToast({
        type: 'success',
        message: `✅ Referral ${newStatus === 'SUCCESSFUL' ? 'approved' : 'rejected'} successfully.`,
      });
    } catch {
      showToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    }
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  async function handleLogout() {
    await logout();
  }

  // ── Derived: pending agent applications (filtered client-side) ───────────
  //
  // Client-side filter is intentional — GET /api/agents already returns the
  // full list for ADMIN users (including PENDING/REJECTED rows).  We do not
  // need a separate API call; we simply partition the array.
  const pendingAgents = agents.filter(a => a.status === 'PENDING');

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand">
            <span className="app-header__logo" aria-hidden="true">🏦</span>
            <div>
              <h1 className="app-header__title">
                {isAdmin ? 'Nib International Bank' : 'Agent Portal'}
              </h1>
              <p className="app-header__subtitle">
                {isAdmin
                  ? 'Internal Referral Management System'
                  : 'Nib International Bank — Your Referral Dashboard'}
              </p>
            </div>
          </div>
          <div className="header-user">
            <div className="header-user__info">
              <p className="header-user__name">{user.username}</p>
              <p className="header-user__role">
                {isAdmin ? '🛡️ Admin' : '👤 Agent'}
              </p>
            </div>
            <button id="logout-btn" className="btn--logout" onClick={handleLogout} aria-label="Sign out">
              ↩ Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── ADMIN: Register Agent form ──────────────────────────────── */}
        {isAdmin && (
          <section className="card" aria-labelledby="agent-form-heading">
            <AgentForm onCreated={handleAgentCreated} onToast={showToast} />
          </section>
        )}

        {/* ── Agent Dashboard — ALL roles ─────────────────────────────── */}
        <section className="card" aria-labelledby="agent-dashboard-heading">
          <div className="section-header">
            <h2 id="agent-dashboard-heading" className="section-header__title">
              {isAdmin ? 'Agent Dashboard' : 'My Profile'}
            </h2>
            <span className="section-header__count">
              {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <AgentTable agents={agents} loading={agentsLoading} isAdmin={isAdmin} />
        </section>

        {/*
          ── ADMIN: Pending Agent Applications ────────────────────────────────
          Only shown to ADMIN users. Displays applicants who submitted via the
          public POST /api/agents/apply endpoint and are awaiting review.
          Filtered client-side from the agents array (status === 'PENDING').
        */}
        {isAdmin && (
          <section className="card" aria-labelledby="pending-agents-heading">
            <div className="section-header">
              <h2 id="pending-agents-heading" className="section-header__title">
                Pending Agent Applications
              </h2>
              <span
                className={`section-header__count${pendingAgents.length > 0 ? ' section-header__count--alert' : ''}`}
              >
                {pendingAgents.length} pending
              </span>
            </div>

            {agentsLoading ? (
              <div className="state-box"><Spinner /><p>Loading applications…</p></div>
            ) : pendingAgents.length === 0 ? (
              <EmptyState
                icon="✅"
                title="No pending applications"
                sub="All agent applications have been reviewed. New applicants appear here automatically."
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table" aria-label="Pending agent applications">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Name</th>
                      <th scope="col">Phone</th>
                      <th scope="col">Email</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgents.map((a, i) => {
                      const busy = actioning.has(a.id);
                      return (
                        <tr key={a.id} className="data-row">
                          <td className="td--index">{i + 1}</td>
                          <td className="td--name">{a.name}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>
                            {a.phone ?? '—'}
                          </td>
                          <td style={{ color: 'var(--text-2)' }}>
                            {a.email ?? '—'}
                          </td>
                          <td>
                            <div className="action-group">
                              <button
                                id={`agent-approve-btn-${a.id}`}
                                className="btn btn--approve"
                                disabled={busy}
                                onClick={() => handleApprove(a.id, a.name)}
                                aria-label={`Approve application from ${a.name}`}
                              >
                                {busy ? <Spinner small /> : '✓ Approve'}
                              </button>
                              <button
                                id={`agent-reject-btn-${a.id}`}
                                className="btn btn--reject"
                                disabled={busy}
                                onClick={() => handleReject(a.id, a.name)}
                                aria-label={`Reject application from ${a.name}`}
                              >
                                {busy ? <Spinner small /> : '✕ Reject'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/*
          ── V2 Architecture: Referral Registration Removed ─────────────────
          The manual "Register Referral" form has been removed per the V2
          architecture approved by the supervisor (RULES.md §6). Customers
          arrive exclusively via the Temenos core banking webhook. This
          informational box replaces the form for both Admin and Agent users.
        */}
        <section className="card" aria-labelledby="temenos-info-heading">
          <div className="section-header">
            <h2 id="temenos-info-heading" className="section-header__title">
              Core Banking Integration
            </h2>
          </div>
          <div style={{ padding: '0 24px 22px' }}>
            <InfoBox
              message="Customer referrals are automatically synced from the Core Banking System (Temenos). No manual entry is required."
            />
          </div>
        </section>

        {/* ── Recent Referrals — ALL roles ─────────────────────────────── */}
        <section className="card" aria-labelledby="referral-table-heading">
          <div className="section-header">
            <h2 id="referral-table-heading" className="section-header__title">
              {isAdmin ? 'Recent Referrals' : 'My Referrals'}
            </h2>
            <span className="section-header__count">
              {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ReferralTable
            referrals={referrals}
            loading={referralsLoading}
            onStatusChange={handleStatusChange}
            isAdmin={isAdmin}
          />
        </section>

        {/*
          ── ADMIN-ONLY sections below this point ───────────────────────────
          The isAgent check at the top of the component tree is the primary
          guard; the backend also enforces ADMIN-only on all these endpoints.
        */}
        {isAdmin && (
          <>
            {/* Campaign creation form */}
            <section className="card" aria-labelledby="campaign-form-heading">
              <CampaignForm onCreated={refreshCampaigns} onToast={showToast} />
            </section>

            {/* Campaign list */}
            <section className="card" aria-labelledby="campaign-table-heading">
              <div className="section-header">
                <h2 id="campaign-table-heading" className="section-header__title">
                  Campaign Management
                </h2>
                <span className="section-header__count">
                  {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
                </span>
              </div>
              <CampaignTable
                campaigns={campaigns}
                loading={campaignsLoading}
                onActivated={refreshCampaigns}
                onToast={showToast}
              />
            </section>

            {/* Temenos Integration Logs */}
            <section className="card" aria-labelledby="integ-logs-heading">
              <div className="section-header">
                <h2 id="integ-logs-heading" className="section-header__title">
                  Temenos Integration Logs
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="section-header__count">
                    {integLogs.length} event{integLogs.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    className="btn btn--ghost"
                    onClick={refreshIntegLogs}
                    aria-label="Refresh integration logs"
                    title="Refresh"
                  >
                    ↺ Refresh
                  </button>
                </div>
              </div>
              <IntegrationLogsTable logs={integLogs} loading={integLogsLoading} />
            </section>
          </>
        )}

      </main>

      {/* ── Toast ───────────────────────────────────────────────────── */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
