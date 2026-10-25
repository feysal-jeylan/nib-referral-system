/**
 * referral-web/src/App.jsx
 * -------------------------
 * Single-page dashboard for the Nib Bank Internal Referral System.
 *
 * Sections:
 *   1. State & Effects — data fetching on mount, form state, toast state
 *   2. Handlers       — form submit (POST /api/agents), optimistic UI update
 *   3. UI             — header, agent form, agent table with reward badges
 *
 * Design decisions:
 *   - No external UI library — plain CSS classes defined in App.css.
 *   - fetch() with the Vite proxy (/api → http://localhost:3000) so the
 *     frontend never hard-codes the backend URL.
 *   - Toast auto-dismisses after 4 s using setTimeout.
 */

import { useEffect, useRef, useState } from 'react';
import './App.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const API = '/api'; // Vite proxy handles the rewrite

// Reward tier colours — keyed to the reward_name strings from reward_rules table
const BADGE_STYLES = {
  Bronze: { bg: '#92400e', text: '#fde68a', label: '🥉 Bronze' },
  Silver: { bg: '#1e3a5f', text: '#bae6fd', label: '🥈 Silver' },
  Gold:   { bg: '#78350f', text: '#fef08a', label: '🥇 Gold'   },
};

// ─── Toast helper ─────────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.type}`} role="alert" aria-live="assertive">
      <span>{toast.message}</span>
      <button className="toast__close" onClick={onDismiss} aria-label="Dismiss notification">✕</button>
    </div>
  );
}

// ─── Reward Badge ─────────────────────────────────────────────────────────────
function RewardBadge({ tier }) {
  if (!tier) {
    return <span className="badge badge--none">— None</span>;
  }
  const style = BADGE_STYLES[tier] ?? { bg: '#374151', text: '#e5e7eb', label: tier };
  return (
    <span
      className="badge"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}

// ─── Agent Table ──────────────────────────────────────────────────────────────
function AgentTable({ agents, loading }) {
  if (loading) {
    return (
      <div className="state-box" aria-label="Loading agents">
        <div className="spinner" aria-hidden="true" />
        <p>Loading agents…</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="state-box state-box--empty">
        <span className="state-box__icon" aria-hidden="true">🏦</span>
        <p className="state-box__title">No agents yet</p>
        <p className="state-box__sub">Register your first agent using the form above.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="agent-table" aria-label="Agent dashboard">
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
          {agents.map((agent, idx) => (
            <tr key={agent.id} className="agent-row">
              <td className="td--index">{idx + 1}</td>
              <td className="td--name">{agent.name}</td>
              <td>
                <code className="code-chip">{agent.referral_code}</code>
              </td>
              <td className="td--count">
                <span className="count-pill">{agent.successful_referrals}</span>
              </td>
              <td>
                <RewardBadge tier={agent.current_reward} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Agent Registration Form ──────────────────────────────────────────────────
function AgentForm({ onCreated, onToast }) {
  const [form, setForm]       = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/agents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        // 409 = duplicate phone/email — show a friendly conflict message
        if (res.status === 409) {
          onToast({ type: 'error', message: '⚠️  An agent with this phone or email already exists.' });
        } else {
          onToast({ type: 'error', message: data.error ?? 'Something went wrong. Please try again.' });
        }
        return;
      }

      // Optimistically append the new agent (with 0 referrals, no reward yet)
      onCreated({
        id:                   data.id,
        name:                 data.name,
        referral_code:        data.referral_code,
        successful_referrals: 0,
        current_reward:       null,
      });

      onToast({ type: 'success', message: `✅ Agent "${data.name}" registered! Code: ${data.referral_code}` });
      setForm({ name: '', phone: '', email: '' });
      nameRef.current?.focus();

    } catch {
      onToast({ type: 'error', message: '🔴 Could not reach the server. Is the API running?' });
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
          <input
            id="agent-name"
            name="name"
            type="text"
            placeholder="e.g. Abebe Kebede"
            value={form.name}
            onChange={handleChange}
            required
            ref={nameRef}
            autoComplete="off"
          />
        </div>

        <div className="form__field">
          <label htmlFor="agent-phone">Phone Number</label>
          <input
            id="agent-phone"
            name="phone"
            type="tel"
            placeholder="e.g. 0911234567"
            value={form.phone}
            onChange={handleChange}
            required
            autoComplete="off"
          />
        </div>

        <div className="form__field form__field--wide">
          <label htmlFor="agent-email">Email Address</label>
          <input
            id="agent-email"
            name="email"
            type="email"
            placeholder="e.g. abebe@nib.com"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="off"
          />
        </div>
      </div>

      <button
        id="submit-agent-btn"
        type="submit"
        className="btn btn--primary"
        disabled={submitting}
      >
        {submitting ? <span className="spinner spinner--sm" aria-hidden="true" /> : null}
        {submitting ? 'Registering…' : 'Register Agent'}
      </button>
    </form>
  );
}

// ─── App (root) ───────────────────────────────────────────────────────────────
export default function App() {
  const [agents,  setAgents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);
  const toastTimer = useRef(null);

  // Fetch all agents on mount
  useEffect(() => {
    async function loadAgents() {
      try {
        const res  = await fetch(`${API}/agents`);
        const data = await res.json();
        setAgents(Array.isArray(data) ? data : []);
      } catch {
        showToast({ type: 'error', message: '🔴 Failed to load agents. Is the API running?' });
      } finally {
        setLoading(false);
      }
    }
    loadAgents();
  }, []);

  function showToast(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    // Auto-dismiss after 4 s
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function handleAgentCreated(newAgent) {
    // Prepend so newest appears first (matching the API's ORDER BY created_at DESC)
    setAgents(prev => [newAgent, ...prev]);
  }

  return (
    <div className="app">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand">
            <span className="app-header__logo" aria-hidden="true">🏦</span>
            <div>
              <h1 className="app-header__title">Nib Bank</h1>
              <p className="app-header__subtitle">Internal Referral Dashboard</p>
            </div>
          </div>
          <span className="app-header__tag">MVP · v1.0</span>
        </div>
      </header>

      <main className="app-main">
        {/* ── Agent Registration ───────────────────────────────── */}
        <section className="card" aria-labelledby="register-section">
          <AgentForm onCreated={handleAgentCreated} onToast={showToast} />
        </section>

        {/* ── Agent Dashboard Table ────────────────────────────── */}
        <section className="card" aria-labelledby="dashboard-section">
          <div className="section-header">
            <h2 id="dashboard-section" className="section-header__title">Agent Dashboard</h2>
            <span className="section-header__count">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
          </div>
          <AgentTable agents={agents} loading={loading} />
        </section>
      </main>

      {/* ── Toast Notification ───────────────────────────────────── */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
