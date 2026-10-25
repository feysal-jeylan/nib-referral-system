/**
 * referral-web/src/App.jsx
 * ─────────────────────────
 * Nib International Bank — Internal Referral Dashboard
 *
 * Sections:
 *   1. Primitive UI components (Toast, StatusPill, RewardBadge, Spinner)
 *   2. AgentForm       — register a new agent (POST /api/agents)
 *   3. AgentTable      — shows all agents with reward tier
 *   4. ReferralForm    — register a new referral (POST /api/referrals)
 *   5. ReferralTable   — shows all referrals with approve/reject actions
 *   6. App (root)      — orchestrates state, data fetching, toasts
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

// ─── Config ───────────────────────────────────────────────────────────────────
const API = '/api'; // Vite dev-proxy rewrites /api → http://localhost:3000

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

// ─── 2. AgentForm ─────────────────────────────────────────────────────────────
function AgentForm({ onCreated, onToast }) {
  const [form, setForm]           = useState({ name: '', phone: '', email: '' });
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
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = res.status === 409
          ? '⚠️ An agent with this phone number or email already exists.'
          : (data.error ?? 'Something went wrong. Please try again.');
        onToast({ type: 'error', message: msg });
        return;
      }

      // Optimistic prepend — 0 referrals, no tier yet
      onCreated({
        id: data.id, name: data.name,
        referral_code: data.referral_code,
        successful_referrals: 0, current_reward: null,
      });
      onToast({ type: 'success', message: `✅ Agent "${data.name}" registered — code: ${data.referral_code}` });
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

// ─── 3. AgentTable ────────────────────────────────────────────────────────────
function AgentTable({ agents, loading }) {
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
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => (
            <tr key={a.id} className="data-row">
              <td className="td--index">{i + 1}</td>
              <td className="td--name">{a.name}</td>
              <td><code className="code-chip">{a.referral_code}</code></td>
              <td className="td--count">
                <span className="count-pill">{a.successful_referrals}</span>
              </td>
              <td><RewardBadge tier={a.current_reward} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 4. ReferralForm ──────────────────────────────────────────────────────────
function ReferralForm({ onCreated, onToast }) {
  const [form, setForm]           = useState({ referral_code: '', customer_name: '', customer_phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const codeRef = useRef(null);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res  = await fetch(`${API}/referrals`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        let msg;
        if (res.status === 404) msg = '⚠️ Invalid referral code — no agent found with that code.';
        else if (res.status === 409) msg = '⚠️ A customer with this phone number is already registered.';
        else msg = data.error ?? 'Something went wrong. Please try again.';
        onToast({ type: 'error', message: msg });
        return;
      }

      onCreated(data);
      onToast({ type: 'success', message: `✅ Referral for "${form.customer_name}" submitted successfully.` });
      setForm({ referral_code: '', customer_name: '', customer_phone: '' });
      codeRef.current?.focus();
    } catch {
      onToast({ type: 'error', message: '🔴 Cannot reach the server. Is the API running?' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id="referral-form"
      className="agent-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Submit a new referral"
    >
      <h2 className="form__title">Submit New Referral</h2>
      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="ref-code">Agent Referral Code</label>
          <input id="ref-code" name="referral_code" type="text"
            placeholder="e.g. NIB-X7KP2A"
            value={form.referral_code} onChange={handleChange}
            required ref={codeRef} autoComplete="off"
            style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }} />
        </div>
        <div className="form__field">
          <label htmlFor="ref-phone">Customer Phone</label>
          <input id="ref-phone" name="customer_phone" type="tel"
            placeholder="e.g. 0922345678"
            value={form.customer_phone} onChange={handleChange}
            required autoComplete="off" />
        </div>
        <div className="form__field form__field--wide">
          <label htmlFor="ref-name">Customer Full Name</label>
          <input id="ref-name" name="customer_name" type="text"
            placeholder="e.g. Tigist Alemu"
            value={form.customer_name} onChange={handleChange}
            required autoComplete="off" />
        </div>
      </div>
      <button id="submit-referral-btn" type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting && <Spinner small />}
        {submitting ? 'Submitting…' : 'Submit Referral'}
      </button>
    </form>
  );
}

// ─── 5. ReferralTable ─────────────────────────────────────────────────────────
function ReferralTable({ referrals, loading, onStatusChange }) {
  // Track which referral IDs are currently being updated so we can disable
  // their buttons and show a spinner mid-update without blocking the whole UI.
  const [updating, setUpdating] = useState(new Set());

  async function handleAction(id, newStatus) {
    setUpdating(prev => new Set(prev).add(id));
    await onStatusChange(id, newStatus);
    setUpdating(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  if (loading) return <div className="state-box"><Spinner /><p>Loading referrals…</p></div>;
  if (!referrals.length) return (
    <EmptyState icon="📋" title="No referrals yet"
      sub="Submit your first referral using the form above." />
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
            <th scope="col">Actions</th>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 6. App (root) ────────────────────────────────────────────────────────────
export default function App() {
  const [agents,     setAgents]     = useState([]);
  const [referrals,  setReferrals]  = useState([]);
  const [agentsLoading,    setAgentsLoading]    = useState(true);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [toast,      setToast]      = useState(null);
  const toastTimer = useRef(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [aRes, rRes] = await Promise.all([
          fetch(`${API}/agents`),
          fetch(`${API}/referrals`),
        ]);
        const [aData, rData] = await Promise.all([aRes.json(), rRes.json()]);
        setAgents(Array.isArray(aData) ? aData : []);
        setReferrals(Array.isArray(rData) ? rData : []);
      } catch {
        showToast({ type: 'error', message: '🔴 Failed to load data. Is the API running?' });
      } finally {
        setAgentsLoading(false);
        setReferralsLoading(false);
      }
    }
    load();
  }, []);

  // ── Toast ───────────────────────────────────────────────────────────────────
  function showToast(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }

  // ── Agent created ────────────────────────────────────────────────────────────
  function handleAgentCreated(newAgent) {
    setAgents(prev => [newAgent, ...prev]);
  }

  // ── Referral created ─────────────────────────────────────────────────────────
  // The POST response gives us referral_id, agent_id, customer_id, status, created_at
  // but not the joined names. Reload the full referral list to get everything.
  const handleReferralCreated = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/referrals`);
      const data = await res.json();
      setReferrals(Array.isArray(data) ? data : []);
    } catch {
      showToast({ type: 'error', message: '🔴 Could not refresh referrals.' });
    }
  }, []);

  // ── Status update (Approve / Reject) ─────────────────────────────────────────
  async function handleStatusChange(referralId, newStatus) {
    try {
      const res = await fetch(`${API}/referrals/${referralId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast({ type: 'error', message: data.error ?? 'Status update failed.' });
        return;
      }

      // Update status in-place so the row transitions without a full reload.
      setReferrals(prev =>
        prev.map(r => r.id === referralId ? { ...r, status: newStatus } : r)
      );

      // After a SUCCESSFUL status change, the agent's reward tier might have
      // changed — reload agents list to reflect updated counts and badges.
      if (newStatus === 'SUCCESSFUL') {
        const aRes  = await fetch(`${API}/agents`);
        const aData = await aRes.json();
        setAgents(Array.isArray(aData) ? aData : []);
      }

      const label = newStatus === 'SUCCESSFUL' ? 'approved' : 'rejected';
      showToast({ type: 'success', message: `✅ Referral ${label} successfully.` });

    } catch {
      showToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand">
            <span className="app-header__logo" aria-hidden="true">🏦</span>
            <div>
              <h1 className="app-header__title">Nib International Bank</h1>
              <p className="app-header__subtitle">Internal Referral Management System</p>
            </div>
          </div>
          <span className="app-header__tag">MVP · v1.0</span>
        </div>
      </header>

      <main className="app-main">

        {/* ── Agent Registration ─────────────────────────────────────── */}
        <section className="card" aria-labelledby="agent-form-heading">
          <AgentForm onCreated={handleAgentCreated} onToast={showToast} />
        </section>

        {/* ── Agent Dashboard ────────────────────────────────────────── */}
        <section className="card" aria-labelledby="agent-dashboard-heading">
          <div className="section-header">
            <h2 id="agent-dashboard-heading" className="section-header__title">
              Agent Dashboard
            </h2>
            <span className="section-header__count">
              {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <AgentTable agents={agents} loading={agentsLoading} />
        </section>

        {/* ── Referral Submission ────────────────────────────────────── */}
        <section className="card" aria-labelledby="referral-form-heading">
          <ReferralForm onCreated={handleReferralCreated} onToast={showToast} />
        </section>

        {/* ── Recent Referrals ───────────────────────────────────────── */}
        <section className="card" aria-labelledby="referral-table-heading">
          <div className="section-header">
            <h2 id="referral-table-heading" className="section-header__title">
              Recent Referrals
            </h2>
            <span className="section-header__count">
              {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ReferralTable
            referrals={referrals}
            loading={referralsLoading}
            onStatusChange={handleStatusChange}
          />
        </section>

      </main>

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
