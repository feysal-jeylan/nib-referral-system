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
 * Sections:
 *   1. Primitive UI components (Toast, StatusPill, RewardBadge, Spinner)
 *   2. AgentForm       — register a new agent (POST /api/agents)
 *   3. AgentTable      — shows all agents with reward tier
 *   4. ReferralForm    — register a new referral (POST /api/referrals)
 *   5. ReferralTable   — shows all referrals with approve/reject actions
 *   6. App (root)      — auth gate, orchestrates state, data fetching, toasts
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
// We define it once here and spread it into every fetch() call below.
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
        ...FETCH_OPTS,  // credentials: 'include' — sends the HttpOnly JWT cookie
      });
      const data = await res.json();

      if (!res.ok) {
        // 401/403 means the session expired while the user was on the page
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

      // Optimistic prepend — 0 referrals, no tier yet
      onCreated({
        id: data.id, name: data.name,
        referral_code: data.referral_code,
        successful_referrals: 0, current_reward: null,
      });
      // Include the temporary password in the success toast so the Admin
      // can immediately hand it to the new agent.
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
//
// Props:
//   onCreated  — called after a successful POST (triggers referral list refresh)
//   onToast    — displays a toast notification
//   lockedCode — when provided (AGENT view), the referral_code field is
//                pre-filled with this value and made readOnly so the agent
//                cannot type someone else's code. The backend also enforces
//                this independently (req.user.agent_id override).
function ReferralForm({ onCreated, onToast, lockedCode }) {
  const [form, setForm]             = useState({
    referral_code:  lockedCode ?? '',
    customer_name:  '',
    customer_phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null); // focus on customer name after submit for agents
  const codeRef = useRef(null);

  // If the locked code arrives after initial render (data loads async), sync it.
  useEffect(() => {
    if (lockedCode) {
      setForm(prev => ({ ...prev, referral_code: lockedCode }));
    }
  }, [lockedCode]);

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
        ...FETCH_OPTS,  // credentials: 'include' — sends the HttpOnly JWT cookie
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          onToast({ type: 'error', message: '🔒 Your session has expired. Please log in again.' });
          return;
        }
        let msg;
        if (res.status === 404) msg = '⚠️ Invalid referral code — no agent found with that code.';
        else if (res.status === 409) msg = '⚠️ A customer with this phone number is already registered.';
        else msg = data.error ?? 'Something went wrong. Please try again.';
        onToast({ type: 'error', message: msg });
        return;
      }

      onCreated(data);
      onToast({ type: 'success', message: `✅ Referral for "${form.customer_name}" submitted successfully.` });
      // After submit: reset editable fields; keep the locked code intact for agents.
      setForm({ referral_code: lockedCode ?? '', customer_name: '', customer_phone: '' });
      // Focus the first editable field for quick re-entry.
      (lockedCode ? nameRef : codeRef).current?.focus();
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
      <h2 className="form__title">Register New Referral</h2>
      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="ref-code">Agent Referral Code</label>
          <input
            id="ref-code"
            name="referral_code"
            type="text"
            placeholder="e.g. NIB-X7KP2A"
            value={form.referral_code}
            onChange={handleChange}
            required
            ref={codeRef}
            autoComplete="off"
            readOnly={!!lockedCode}
            aria-readonly={!!lockedCode}
            title={lockedCode ? 'Your referral code is pre-filled automatically.' : undefined}
            style={{
              textTransform:  'uppercase',
              letterSpacing:  '0.5px',
              // Visual cue: muted + not-allowed cursor when locked
              ...(lockedCode && {
                opacity:  0.7,
                cursor:   'not-allowed',
                background: 'var(--surface-2, #2a2a3a)',
              }),
            }}
          />
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
            required ref={nameRef} autoComplete="off" />
        </div>
      </div>
      <button id="submit-referral-btn" type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting && <Spinner small />}
        {submitting ? 'Submitting…' : 'Register Referral'}
      </button>
    </form>
  );
}

// ─── 5. ReferralTable ─────────────────────────────────────────────────────────
//
// isAdmin controls whether the Actions column (Approve / Reject) is shown.
// When false (AGENT view), the column is hidden entirely — agents can only
// read their own referral list, not modify statuses.
function ReferralTable({ referrals, loading, onStatusChange, isAdmin }) {
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
      sub={isAdmin ? 'Submit your first referral using the form above.' : 'No referrals have been registered under your code yet.'} />
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
            {/* Only admins see the Actions column */}
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

// ─── 6. App (root) ────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth state from context ──────────────────────────────────────────────
  const { user, loading, logout } = useAuth();

  const [agents,     setAgents]     = useState([]);
  const [referrals,  setReferrals]  = useState([]);
  const [agentsLoading,    setAgentsLoading]    = useState(true);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [toast,      setToast]      = useState(null);
  const toastTimer = useRef(null);

  // ── Gate 1: Auth loading — show spinner while /api/auth/me is in-flight ──
  if (loading) {
    return (
      <div className="auth-loading" role="status" aria-label="Checking authentication…">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <p className="auth-loading__text">Verifying session…</p>
      </div>
    );
  }

  // ── Gate 2: Not authenticated — show the login screen ───────────────────
  if (!user) {
    return <Login />;
  }

  // ── Gate 2.5: Forced password change ─────────────────────────────────────
  //
  // The user has a valid JWT (they logged in), but must_change_password = TRUE
  // means they authenticated with a temporary password. We block the Dashboard
  // entirely and show the ChangePassword screen instead.
  //
  // Security rationale:
  //   • Frontend gate: no dashboard HTML is rendered, no API calls fire.
  //   • Backend gate: /api/auth/change-password re-reads must_change_password
  //     from the DB, so a crafted JWT with false cannot bypass it.
  //   • Once the agent sets their password, refreshUser() in AuthContext flips
  //     this to false and the Dashboard renders automatically.
  if (user.must_change_password) {
    return <ChangePassword />;
  }

  // ── Gate 3: Authenticated + password set → render the full Dashboard ─────
  // (Hooks below run unconditionally because early returns are all above)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return <Dashboard
    user={user}
    logout={logout}
    agents={agents}
    setAgents={setAgents}
    referrals={referrals}
    setReferrals={setReferrals}
    agentsLoading={agentsLoading}
    setAgentsLoading={setAgentsLoading}
    referralsLoading={referralsLoading}
    setReferralsLoading={setReferralsLoading}
    toast={toast}
    setToast={setToast}
    toastTimer={toastTimer}
  />;
}

// ─── Dashboard — only rendered when the user is authenticated ────────────────
//
// Extracted into its own component so all its hooks run unconditionally
// (React rules of hooks forbid calling hooks after an early return).
function Dashboard({
  user, logout,
  agents, setAgents,
  referrals, setReferrals,
  agentsLoading, setAgentsLoading,
  referralsLoading, setReferralsLoading,
  toast, setToast, toastTimer,
}) {
  // Derived role flags — computed once here and passed down to keep all
  // role-gating logic centralised in this component.
  const isAdmin = user.role === 'ADMIN';
  const isAgent = user.role === 'AGENT';

  // ── Data loading ────────────────────────────────────────────────────────────
  //
  // credentials: 'include' is spread from FETCH_OPTS onto every fetch call.
  // This attaches the HttpOnly cookie so the server can authenticate the request.
  // Without it, all fetches return 401 because the browser strips cookies
  // from cross-origin requests by default.
  useEffect(() => {
    async function load() {
      try {
        const [aRes, rRes] = await Promise.all([
          fetch(`${API}/agents`,    FETCH_OPTS),  // credentials: 'include'
          fetch(`${API}/referrals`, FETCH_OPTS),  // credentials: 'include'
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derive the agent's own referral code for the locked form field ───────────
  //
  // GET /api/agents returns ONLY the calling agent's own row when the role is
  // AGENT (server-side filter). We grab the first (and only) element's code.
  // This value is passed to ReferralForm as `lockedCode` so the field is
  // pre-filled and read-only — a belt-and-suspenders UX guard on top of the
  // backend security fix in POST /api/referrals.
  const agentOwnCode = isAgent ? (agents[0]?.referral_code ?? '') : null;

  // ── Toast ───────────────────────────────────────────────────────────────────
  function showToast(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
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
      const res  = await fetch(`${API}/referrals`, FETCH_OPTS); // credentials: 'include'
      const data = await res.json();
      setReferrals(Array.isArray(data) ? data : []);
    } catch {
      showToast({ type: 'error', message: '🔴 Could not refresh referrals.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Status update (Approve / Reject) — ADMIN only ────────────────────────────
  async function handleStatusChange(referralId, newStatus) {
    try {
      const res = await fetch(`${API}/referrals/${referralId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
        ...FETCH_OPTS,  // credentials: 'include'
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
        const aRes  = await fetch(`${API}/agents`, FETCH_OPTS); // credentials: 'include'
        const aData = await aRes.json();
        setAgents(Array.isArray(aData) ? aData : []);
      }

      const label = newStatus === 'SUCCESSFUL' ? 'approved' : 'rejected';
      showToast({ type: 'success', message: `✅ Referral ${label} successfully.` });

    } catch {
      showToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    }
  }

  // ── Handle logout ─────────────────────────────────────────────────────────
  async function handleLogout() {
    await logout(); // Calls POST /api/auth/logout to clear the HttpOnly cookie
    // AuthContext sets user=null → App re-renders → <Login /> is shown
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
              {/*
                Role-aware header title:
                  ADMIN → full system name (manages everything)
                  AGENT → "Agent Portal" (read-only personal view)
              */}
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

          {/* ── Right side: user info + logout ─────────────────────────── */}
          <div className="header-user">
            <div className="header-user__info">
              <p className="header-user__name">{user.username}</p>
              {/*
                Show a friendly role badge:
                  'ADMIN' → 'Admin'
                  'AGENT' → 'Agent'
              */}
              <p className="header-user__role">
                {isAdmin ? '🛡️ Admin' : '👤 Agent'}
              </p>
            </div>
            <button
              id="logout-btn"
              className="btn--logout"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              ↩ Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">

        {/*
          ── ADMIN-ONLY: Create Agent form ──────────────────────────────────
          Agents cannot create other agents, so we hide this section entirely.
          The backend enforces this too (authorizeRole(['ADMIN'])), but hiding
          the UI avoids confusing 403 errors in the console.
        */}
        {isAdmin && (
          <section className="card" aria-labelledby="agent-form-heading">
            <AgentForm onCreated={handleAgentCreated} onToast={showToast} />
          </section>
        )}

        {/* ── Agent Dashboard — visible to ALL roles ──────────────────── */}
        {/* ADMIN sees all agents; AGENT sees only their own row (filtered server-side). */}
        <section className="card" aria-labelledby="agent-dashboard-heading">
          <div className="section-header">
            <h2 id="agent-dashboard-heading" className="section-header__title">
              {isAdmin ? 'Agent Dashboard' : 'My Profile'}
            </h2>
            <span className="section-header__count">
              {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <AgentTable agents={agents} loading={agentsLoading} />
        </section>

        {/*
          ── Referral Registration form — visible to ADMIN and AGENT ───────────

          ADMIN: full form — can type any referral code to register a customer
                 under any agent.

          AGENT: same form, but the referral_code field is pre-filled with the
                 agent's own code (agentOwnCode) and set to readOnly.
                 The backend ALSO enforces this: it ignores any referral_code
                 in the body for AGENT requests and forces req.user.agent_id.
        */}
        <section className="card" aria-labelledby="referral-form-heading">
          <ReferralForm
            onCreated={handleReferralCreated}
            onToast={showToast}
            lockedCode={agentOwnCode}
          />
        </section>

        {/* ── Recent Referrals — visible to ALL roles ─────────────────── */}
        {/* ADMIN sees all referrals + approve/reject. AGENT sees only their own (read-only). */}
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

      </main>

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
