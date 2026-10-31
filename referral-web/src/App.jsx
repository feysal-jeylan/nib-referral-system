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
 * V2 Architecture (RULES.md §6): Manual ReferralForm removed. Referrals
 *   arrive exclusively via the Temenos webhook.
 *
 * V5 Architecture: Public agent self-registration flow. Admin approval UI.
 *   AgentStatusPill, Pending Agent Applications section.
 *
 * V6 Architecture — Rule Engine:
 *   CampaignForm now includes:
 *     - description (optional text)
 *     - reward_threshold (optional integer)
 *     - In-line Rules Builder: add/remove rules before creating the campaign.
 *       Each rule has rule_type (MIN_DEPOSIT | ACCOUNT_TYPE), operator
 *       (GREATER_THAN | LESS_THAN | EQUALS | …), and rule_value (text input).
 *       On submit the form first POSTs /api/campaigns, then POSTs each rule
 *       to /api/campaigns/:id/rules in sequence.
 *   CampaignTable now shows description, reward_threshold, and operator in
 *   the rule tags (e.g. "MIN_DEPOSIT ≥ 5000").
 *
 * V7 Architecture — Finalization:
 *   - Webhook payload whitelist enforced on backend (integration.js).
 *   - Webhook referrals now land as 'SUCCESSFUL' automatically (no manual approval).
 *   - CampaignTable: Edit and Delete buttons for each campaign row.
 *     Edit opens a compact inline form; Delete is guarded by a confirm dialog.
 *     Both call the new PUT /api/campaigns/:id and DELETE /api/campaigns/:id
 *     endpoints added in V7 campaigns.js.
 *
 * Sections:
 *   1.  Primitive UI components (Toast, StatusPill, RewardBadge, Spinner,
 *       EmptyState, InfoBox)
 *   2.  AgentStatusPill
 *   3.  AgentForm
 *   4.  AgentTable
 *   5.  ReferralTable
 *   6.  CampaignForm   (V6: description, reward_threshold, Rules Builder)
 *   7.  CampaignTable  (V7: Edit + Delete buttons; V6: operator in rules, description)
 *   8.  CampaignStatusPill
 *   9.  IntegrationLogsTable
 *  10.  IntegrationStatusPill
 *  11.  App (root)
 *  12.  Dashboard
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import './Login.css';
import { useAuth } from './AuthContext';
import Login from './Login';
import ChangePassword from './ChangePassword';

// ─── Config ───────────────────────────────────────────────────────────────────
const API = '/api';

// ─── Shared fetch options ────────────────────────────────────────────────────
const FETCH_OPTS = { credentials: 'include' };

// ─── Reward badge metadata ────────────────────────────────────────────────────
const REWARD_META = {
  Gold:   { cls: 'badge--gold',   label: '🥇 Gold'   },
  Silver: { cls: 'badge--silver', label: '🥈 Silver' },
  Bronze: { cls: 'badge--bronze', label: '🥉 Bronze' },
};

// ─── Rule Engine constants (must match VALID_OPERATORS in campaigns.js) ───────
const RULE_TYPES = ['MIN_DEPOSIT', 'ACCOUNT_TYPE'];
const OPERATORS  = [
  { value: 'GREATER_THAN',          label: '> Greater Than'           },
  { value: 'LESS_THAN',             label: '< Less Than'              },
  { value: 'EQUALS',                label: '= Equals'                 },
  { value: 'GREATER_THAN_OR_EQUAL', label: '≥ Greater Than or Equal'  },
  { value: 'LESS_THAN_OR_EQUAL',    label: '≤ Less Than or Equal'     },
  { value: 'NOT_EQUALS',            label: '≠ Not Equals'             },
];

// Human-readable operator symbols for display in rule tags
const OPERATOR_SYMBOL = {
  GREATER_THAN:          '>',
  LESS_THAN:             '<',
  EQUALS:                '=',
  GREATER_THAN_OR_EQUAL: '≥',
  LESS_THAN_OR_EQUAL:    '≤',
  NOT_EQUALS:            '≠',
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

function InfoBox({ message }) {
  return (
    <div className="info-box" role="note">
      <span className="info-box__icon" aria-hidden="true">ℹ</span>
      <p className="info-box__text">{message}</p>
    </div>
  );
}

// ─── 2. AgentStatusPill ───────────────────────────────────────────────────────
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
              {isAdmin && <td><AgentStatusPill status={a.status} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 5. ReferralTable ─────────────────────────────────────────────────────────
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
//
// V6 update: adds description, reward_threshold, and an in-line Rules Builder.
//
// The Rules Builder lets an Admin queue up rules BEFORE hitting "Create Campaign".
// On submit we:
//   1. POST /api/campaigns → get the new campaign id
//   2. POST /api/campaigns/:id/rules for each queued rule (sequential awaits)
//   3. Call onCreated() to trigger a list refresh
//
// This approach keeps the API atomic enough for an MVP while staying simple —
// no need for a draft-and-save flow.
function CampaignForm({ onCreated, onToast }) {
  const EMPTY_CAMPAIGN = {
    name: '', start_date: '', end_date: '',
    reward_type: 'CASH', reward_value: '',
    description: '', reward_threshold: '',
  };
  const EMPTY_RULE = { rule_type: 'MIN_DEPOSIT', operator: 'GREATER_THAN_OR_EQUAL', rule_value_raw: '' };

  const [form, setForm]               = useState(EMPTY_CAMPAIGN);
  const [pendingRules, setPendingRules] = useState([]);   // rules queued for POST after campaign creation
  const [currentRule, setCurrentRule] = useState(EMPTY_RULE); // rule currently being built in the builder
  const [submitting, setSubmitting]   = useState(false);
  const nameRef = useRef(null);

  function handleCampaignChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleRuleChange(e) {
    setCurrentRule(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Convert the raw text input into the correct rule_value JSON shape
  // expected by the rule engine (services/ruleEngine.js).
  function buildRuleValue(rule) {
    if (rule.rule_type === 'MIN_DEPOSIT') {
      // rule_value.amount must be numeric — the engine reads rule_value.amount
      return { amount: parseFloat(rule.rule_value_raw) || 0 };
    }
    if (rule.rule_type === 'ACCOUNT_TYPE') {
      // rule_value.type must be the account type string (uppercased)
      return { type: rule.rule_value_raw.trim().toUpperCase() };
    }
    return { value: rule.rule_value_raw.trim() };
  }

  function handleAddRule() {
    if (!currentRule.rule_value_raw.trim()) {
      onToast({ type: 'error', message: '⚠️ Please enter a rule value before adding.' });
      return;
    }
    setPendingRules(prev => [...prev, { ...currentRule }]);
    setCurrentRule(EMPTY_RULE);
  }

  function handleRemoveRule(index) {
    setPendingRules(prev => prev.filter((_, i) => i !== index));
  }

  // Returns the human-readable summary of a pending rule for the preview list.
  function ruleLabel(rule) {
    const sym = OPERATOR_SYMBOL[rule.operator] ?? rule.operator;
    if (rule.rule_type === 'MIN_DEPOSIT') {
      return `MIN_DEPOSIT ${sym} ${rule.rule_value_raw} ETB`;
    }
    if (rule.rule_type === 'ACCOUNT_TYPE') {
      return `ACCOUNT_TYPE ${sym} ${rule.rule_value_raw.toUpperCase()}`;
    }
    return `${rule.rule_type} ${sym} ${rule.rule_value_raw}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // ── Step 1: Create the campaign ─────────────────────────────────────────
      const res = await fetch(`${API}/campaigns`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             form.name,
          description:      form.description || undefined,
          start_date:       form.start_date ? new Date(form.start_date).toISOString() : '',
          end_date:         form.end_date   ? new Date(form.end_date).toISOString()   : '',
          reward_type:      form.reward_type,
          reward_value:     form.reward_value,
          reward_threshold: form.reward_threshold ? parseInt(form.reward_threshold, 10) : undefined,
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

      const campaignId = data.campaign.id;

      // ── Step 2: POST each queued rule ────────────────────────────────────────
      // Rules are posted sequentially. On any failure we stop and surface the
      // error, but we do NOT delete the campaign — the Admin can add rules
      // manually via the existing rules endpoint.
      for (const rule of pendingRules) {
        const ruleRes = await fetch(`${API}/campaigns/${campaignId}/rules`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule_type:  rule.rule_type,
            operator:   rule.operator,
            rule_value: buildRuleValue(rule),
          }),
          ...FETCH_OPTS,
        });

        if (!ruleRes.ok) {
          const ruleData = await ruleRes.json();
          onToast({
            type: 'error',
            message: `⚠️ Campaign created but rule "${rule.rule_type}" failed: ${ruleData.error ?? 'Unknown error'}`,
          });
          onCreated();
          setForm(EMPTY_CAMPAIGN);
          setPendingRules([]);
          return;
        }
      }

      // ── Step 3: Success ──────────────────────────────────────────────────────
      onCreated();
      const ruleCount = pendingRules.length;
      onToast({
        type: 'success',
        message: `✅ Campaign "${data.campaign.name}" created as DRAFT` +
          (ruleCount > 0 ? ` with ${ruleCount} rule${ruleCount !== 1 ? 's' : ''}.` : '.'),
      });
      setForm(EMPTY_CAMPAIGN);
      setPendingRules([]);
      nameRef.current?.focus();

    } catch {
      onToast({ type: 'error', message: '🔴 Cannot reach the server. Is the API running?' });
    } finally {
      setSubmitting(false);
    }
  }

  // Placeholder hint for the rule value input — changes based on rule_type
  const rulePlaceholder = currentRule.rule_type === 'MIN_DEPOSIT'
    ? 'e.g. 5000'
    : currentRule.rule_type === 'ACCOUNT_TYPE'
      ? 'e.g. SAVINGS'
      : 'Value…';

  return (
    <form
      id="campaign-form"
      className="agent-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Create a new campaign"
    >
      <h2 className="form__title">Create New Campaign</h2>

      {/* ── Core campaign fields ────────────────────────────────────────── */}
      <div className="form__grid form__grid--3col">
        <div className="form__field">
          <label htmlFor="camp-name">Campaign Name</label>
          <input
            id="camp-name" name="name" type="text"
            placeholder="e.g. Q4 Savings Drive"
            value={form.name} onChange={handleCampaignChange}
            required ref={nameRef} autoComplete="off"
          />
        </div>
        <div className="form__field">
          <label htmlFor="camp-start">Start Date</label>
          <input
            id="camp-start" name="start_date" type="date"
            value={form.start_date} onChange={handleCampaignChange}
            required
          />
        </div>
        <div className="form__field">
          <label htmlFor="camp-end">End Date</label>
          <input
            id="camp-end" name="end_date" type="date"
            value={form.end_date} onChange={handleCampaignChange}
            required
          />
        </div>
        <div className="form__field">
          <label htmlFor="camp-reward-type">Reward Type</label>
          <select
            id="camp-reward-type" name="reward_type"
            value={form.reward_type} onChange={handleCampaignChange}
            required
          >
            <option value="CASH">CASH</option>
            <option value="BADGE">BADGE</option>
          </select>
        </div>
        <div className="form__field">
          <label htmlFor="camp-reward-value">Reward Value</label>
          <input
            id="camp-reward-value" name="reward_value" type="text"
            placeholder="e.g. 500 ETB"
            value={form.reward_value} onChange={handleCampaignChange}
            required autoComplete="off"
          />
        </div>
        <div className="form__field">
          <label htmlFor="camp-threshold">Reward Threshold <span className="form__optional">(optional)</span></label>
          <input
            id="camp-threshold" name="reward_threshold" type="number"
            placeholder="e.g. 5 referrals"
            value={form.reward_threshold} onChange={handleCampaignChange}
            min="0" autoComplete="off"
          />
        </div>
        <div className="form__field form__field--wide">
          <label htmlFor="camp-desc">Description <span className="form__optional">(optional)</span></label>
          <input
            id="camp-desc" name="description" type="text"
            placeholder="e.g. Year-end savings promotion for SAVINGS accounts"
            value={form.description} onChange={handleCampaignChange}
            autoComplete="off"
          />
        </div>
      </div>

      {/* ── Rules Builder ───────────────────────────────────────────────── */}
      {/*
        The rule builder lets admins queue qualification rules before saving.
        Each rule will be POSTed to /api/campaigns/:id/rules after the campaign
        is created. Rules are evaluated by services/ruleEngine.js on every
        Temenos webhook — ALL rules must pass for a referral to be created.
      */}
      <div className="rules-builder">
        <div className="rules-builder__header">
          <span className="rules-builder__title">Qualification Rules</span>
          <span className="rules-builder__hint">
            All rules must pass for a referral to be accepted (logical AND).
          </span>
        </div>

        {/* ── Rule input row ─────────────────────────────────────────── */}
        <div className="rules-builder__inputs">
          <div className="form__field">
            <label htmlFor="rule-type">Rule Type</label>
            <select
              id="rule-type" name="rule_type"
              value={currentRule.rule_type}
              onChange={handleRuleChange}
            >
              {RULE_TYPES.map(rt => (
                <option key={rt} value={rt}>{rt.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div className="form__field">
            <label htmlFor="rule-operator">Operator</label>
            <select
              id="rule-operator" name="operator"
              value={currentRule.operator}
              onChange={handleRuleChange}
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

          <div className="form__field">
            <label htmlFor="rule-value">Value</label>
            <input
              id="rule-value" name="rule_value_raw" type="text"
              placeholder={rulePlaceholder}
              value={currentRule.rule_value_raw}
              onChange={handleRuleChange}
              autoComplete="off"
            />
          </div>

          <button
            type="button"
            className="btn btn--add-rule"
            onClick={handleAddRule}
            aria-label="Add this rule to the campaign"
          >
            + Add Rule
          </button>
        </div>

        {/* ── Queued rules preview ───────────────────────────────────── */}
        {pendingRules.length > 0 && (
          <div className="rules-builder__preview">
            <p className="rules-builder__preview-label">
              Rules to be applied ({pendingRules.length}):
            </p>
            <ul className="rules-builder__list">
              {pendingRules.map((rule, i) => (
                <li key={i} className="rules-builder__item">
                  <span className="rule-preview-chip">{ruleLabel(rule)}</span>
                  <button
                    type="button"
                    className="rule-preview-remove"
                    onClick={() => handleRemoveRule(i)}
                    aria-label={`Remove rule: ${ruleLabel(rule)}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pendingRules.length === 0 && (
          <p className="rules-builder__empty">
            No rules added yet — this campaign will accept all customers.
          </p>
        )}
      </div>

      <button id="submit-campaign-btn" type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting && <Spinner small />}
        {submitting ? 'Creating…' : 'Create Campaign'}
      </button>
    </form>
  );
}

// ─── 7. CampaignTable ─────────────────────────────────────────────────────────
//
// V6 update:
//   - Shows campaign description (if present) below the name.
//   - Shows reward_threshold badge (if present).
//   - Rule tags now include the operator symbol: "MIN_DEPOSIT ≥ 5000".
//
// V7 update:
//   - Edit button: opens an inline edit form for that row. Saves via
//     PUT /api/campaigns/:id. Only editable fields shown (name, dates,
//     reward_value, description, reward_threshold).
//   - Delete button: shows a confirm() dialog, then calls
//     DELETE /api/campaigns/:id. Blocked by the API if referrals exist.
function CampaignTable({ campaigns, loading, onActivated, onEdited, onDeleted, onToast }) {
  const [activating, setActivating] = useState(new Set());
  const [deleting,   setDeleting]   = useState(new Set());

  // editingId: which campaign row has its inline edit form open (null = none)
  const [editingId,  setEditingId]  = useState(null);
  // editForm: the current state of the inline edit form fields
  const [editForm,   setEditForm]   = useState({});
  const [saving,     setSaving]     = useState(false);

  // ── Open the inline edit form for a campaign row ────────────────────────
  function handleEditOpen(c) {
    // Pre-fill the form with the campaign's current values.
    // Dates: strip the time component so <input type="date"> works correctly.
    const toDateInput = iso => iso ? iso.slice(0, 10) : '';
    setEditForm({
      name:             c.name,
      start_date:       toDateInput(c.start_date),
      end_date:         toDateInput(c.end_date),
      reward_value:     c.reward_value,
      description:      c.description ?? '',
      reward_threshold: c.reward_threshold != null ? String(c.reward_threshold) : '',
    });
    setEditingId(c.id);
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditForm({});
  }

  function handleEditChange(e) {
    setEditForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // ── Submit the inline edit form ─────────────────────────────────────────
  async function handleEditSave(campaignId, campaignName) {
    setSaving(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             editForm.name,
          description:      editForm.description || null,
          start_date:       editForm.start_date
            ? new Date(editForm.start_date).toISOString() : '',
          end_date:         editForm.end_date
            ? new Date(editForm.end_date).toISOString() : '',
          reward_value:     editForm.reward_value,
          reward_threshold: editForm.reward_threshold !== ''
            ? parseInt(editForm.reward_threshold, 10) : null,
        }),
        ...FETCH_OPTS,
      });
      const data = await res.json();

      if (!res.ok) {
        onToast({ type: 'error', message: data.error ?? 'Failed to update campaign.' });
        return;
      }

      setEditingId(null);
      setEditForm({});
      onEdited(); // triggers refreshCampaigns in Dashboard
      onToast({ type: 'success', message: `✅ Campaign "${data.campaign.name}" updated.` });
    } catch {
      onToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete a campaign ───────────────────────────────────────────────────
  async function handleDelete(id, name) {
    // Guard with a native confirm dialog — simple, no extra component needed.
    const confirmed = window.confirm(
      `Delete campaign "${name}"?\n\nThis will permanently remove the campaign and all its rules.\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(prev => new Set(prev).add(id));
    try {
      const res  = await fetch(`${API}/campaigns/${id}`, {
        method: 'DELETE',
        ...FETCH_OPTS,
      });
      const data = await res.json();

      if (!res.ok) {
        // 409 = campaign has referrals — surface the backend's clear message.
        onToast({ type: 'error', message: data.error ?? 'Failed to delete campaign.' });
        return;
      }

      onDeleted(); // triggers refreshCampaigns in Dashboard
      onToast({ type: 'success', message: `🗑️ ${data.message}` });
    } catch {
      onToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

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
            <th scope="col">Dates</th>
            <th scope="col">Reward</th>
            <th scope="col">Threshold</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, i) => {
            const busy       = activating.has(c.id);
            const busyDelete = deleting.has(c.id);
            const isEditing  = editingId === c.id;
            const rules      = Array.isArray(c.rules) ? c.rules : [];

            return (
              <tr key={c.id} className="data-row">
                <td className="td--index">{i + 1}</td>

                {/* Name + optional description + rule tags */}
                <td className="td--name">
                  <span>{c.name}</span>
                  {c.description && (
                    <p className="campaign-description">{c.description}</p>
                  )}
                  {rules.length > 0 && (
                    <div className="rule-tags">
                      {rules.map(r => {
                        // Extract the display value from rule_value JSONB.
                        // For MIN_DEPOSIT: rule_value.amount; for ACCOUNT_TYPE: rule_value.type
                        const val = r.rule_value?.amount ?? r.rule_value?.type
                          ?? Object.values(r.rule_value ?? {})[0] ?? '';
                        const sym = OPERATOR_SYMBOL[r.operator] ?? r.operator ?? '=';
                        return (
                          <span key={r.id} className="rule-tag">
                            {r.rule_type} {sym} {String(val)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>

                {/* Date range */}
                <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                  <span>{new Date(c.start_date).toLocaleDateString()}</span>
                  <span style={{ color: 'var(--text-3)', margin: '0 4px' }}>→</span>
                  <span>{new Date(c.end_date).toLocaleDateString()}</span>
                </td>

                {/* Reward */}
                <td>
                  <span className="reward-chip reward-chip--type">{c.reward_type}</span>
                  {' '}
                  <span className="reward-chip reward-chip--value">{c.reward_value}</span>
                </td>

                {/* Threshold */}
                <td className="td--count">
                  {c.reward_threshold != null
                    ? <span className="count-pill" title="Min referrals for reward">{c.reward_threshold}</span>
                    : <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>—</span>
                  }
                </td>

                {/* Status pill */}
                <td><CampaignStatusPill status={c.status} /></td>

                {/* Actions */}
                <td>
                  <div className="action-group">
                    {/* Activate button — only for DRAFT campaigns */}
                    {c.status === 'DRAFT' && !isEditing && (
                      <button
                        id={`activate-btn-${c.id}`}
                        className="btn btn--activate"
                        disabled={busy || busyDelete}
                        onClick={() => handleActivate(c.id, c.name)}
                        aria-label={`Activate campaign ${c.name}`}
                      >
                        {busy ? <Spinner small /> : '▶ Activate'}
                      </button>
                    )}

                    {/* Edit button — toggles the inline edit form */}
                    {!isEditing ? (
                      <button
                        id={`edit-btn-${c.id}`}
                        className="btn btn--edit"
                        disabled={busy || busyDelete}
                        onClick={() => handleEditOpen(c)}
                        aria-label={`Edit campaign ${c.name}`}
                      >
                        ✏ Edit
                      </button>
                    ) : null}

                    {/* Delete button */}
                    {!isEditing && (
                      <button
                        id={`delete-btn-${c.id}`}
                        className="btn btn--delete"
                        disabled={busy || busyDelete}
                        onClick={() => handleDelete(c.id, c.name)}
                        aria-label={`Delete campaign ${c.name}`}
                      >
                        {busyDelete ? <Spinner small /> : '🗑 Delete'}
                      </button>
                    )}
                  </div>

                  {/* ── Inline Edit Form ──────────────────────────────── */}
                  {isEditing && (
                    <div className="campaign-edit-form">
                      <div className="campaign-edit-form__grid">
                        <div className="form__field">
                          <label htmlFor={`edit-name-${c.id}`}>Name</label>
                          <input
                            id={`edit-name-${c.id}`}
                            name="name" type="text"
                            value={editForm.name}
                            onChange={handleEditChange}
                            autoComplete="off"
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-start-${c.id}`}>Start Date</label>
                          <input
                            id={`edit-start-${c.id}`}
                            name="start_date" type="date"
                            value={editForm.start_date}
                            onChange={handleEditChange}
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-end-${c.id}`}>End Date</label>
                          <input
                            id={`edit-end-${c.id}`}
                            name="end_date" type="date"
                            value={editForm.end_date}
                            onChange={handleEditChange}
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-reward-${c.id}`}>Reward Value</label>
                          <input
                            id={`edit-reward-${c.id}`}
                            name="reward_value" type="text"
                            value={editForm.reward_value}
                            onChange={handleEditChange}
                            autoComplete="off"
                          />
                        </div>
                        <div className="form__field">
                          <label htmlFor={`edit-threshold-${c.id}`}>Threshold</label>
                          <input
                            id={`edit-threshold-${c.id}`}
                            name="reward_threshold" type="number"
                            min="0"
                            value={editForm.reward_threshold}
                            onChange={handleEditChange}
                          />
                        </div>
                        <div className="form__field form__field--wide">
                          <label htmlFor={`edit-desc-${c.id}`}>Description</label>
                          <input
                            id={`edit-desc-${c.id}`}
                            name="description" type="text"
                            value={editForm.description}
                            onChange={handleEditChange}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      <div className="campaign-edit-form__actions">
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={saving}
                          onClick={() => handleEditSave(c.id, c.name)}
                        >
                          {saving ? <Spinner small /> : null}
                          {saving ? 'Saving…' : '✓ Save Changes'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={saving}
                          onClick={handleEditCancel}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
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
            <th scope="col">Reason / Error</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <tr key={log.id} className="data-row">
              <td className="td--index">{i + 1}</td>
              <td><code className="code-chip">{log.transaction_id}</code></td>
              <td className="td--name">{log.payload?.customer_name ?? '—'}</td>
              <td><IntegrationStatusPill status={log.status} /></td>
              <td style={{ color: 'var(--text-3)', fontSize: '12px', maxWidth: '220px' }}>
                {/* Show error_message for FAILED events — helps admins debug rule failures */}
                {log.error_message
                  ? <span className="log-error-msg" title={log.error_message}>{log.error_message}</span>
                  : <span style={{ color: 'var(--text-3)' }}>—</span>
                }
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

  if (loading) {
    return (
      <div className="auth-loading" role="status" aria-label="Checking authentication…">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <p className="auth-loading__text">Verifying session…</p>
      </div>
    );
  }

  if (!user) return <Login />;
  if (user.must_change_password) return <ChangePassword />;

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
function Dashboard({
  user, logout,
  agents, setAgents,
  referrals, setReferrals,
  agentsLoading, setAgentsLoading,
  referralsLoading, setReferralsLoading,
  toast, setToast, toastTimer,
}) {
  const isAdmin = user.role === 'ADMIN';

  const [campaigns,        setCampaigns]        = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [integLogs,        setIntegLogs]        = useState([]);
  const [integLogsLoading, setIntegLogsLoading] = useState(true);
  const [actioning,        setActioning]        = useState(new Set());

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

  // ── Agent created (manually by admin) ────────────────────────────────────
  function handleAgentCreated(newAgent) {
    setAgents(prev => [newAgent, ...prev]);
  }

  // ── Agent approve / reject ───────────────────────────────────────────────
  async function handleApprove(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      const res  = await fetch(`${API}/agents/${id}/approve`, { method: 'PATCH', ...FETCH_OPTS });
      const data = await res.json();
      if (!res.ok) { showToast({ type: 'error', message: data.error ?? 'Approval failed.' }); return; }
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

  async function handleReject(id, name) {
    setActioning(prev => new Set(prev).add(id));
    try {
      const res  = await fetch(`${API}/agents/${id}/reject`, { method: 'PATCH', ...FETCH_OPTS });
      const data = await res.json();
      if (!res.ok) { showToast({ type: 'error', message: data.error ?? 'Rejection failed.' }); return; }
      await refreshAgents();
      showToast({ type: 'success', message: `Application from "${name}" has been rejected.` });
    } catch {
      showToast({ type: 'error', message: '🔴 Cannot reach the server.' });
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Referral status change ───────────────────────────────────────────────
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

  async function handleLogout() { await logout(); }

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
              <p className="header-user__role">{isAdmin ? '🛡️ Admin' : '👤 Agent'}</p>
            </div>
            <button id="logout-btn" className="btn--logout" onClick={handleLogout} aria-label="Sign out">
              ↩ Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── ADMIN: Register Agent form ──────────────────────────── */}
        {isAdmin && (
          <section className="card" aria-labelledby="agent-form-heading">
            <AgentForm onCreated={handleAgentCreated} onToast={showToast} />
          </section>
        )}

        {/* ── Agent Dashboard — ALL roles ─────────────────────────── */}
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

        {/* ── ADMIN: Pending Agent Applications ─────────────────────── */}
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
              <EmptyState icon="✅" title="No pending applications"
                sub="All agent applications have been reviewed. New applicants appear here automatically." />
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
                          <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{a.phone ?? '—'}</td>
                          <td style={{ color: 'var(--text-2)' }}>{a.email ?? '—'}</td>
                          <td>
                            <div className="action-group">
                              <button
                                id={`agent-approve-btn-${a.id}`}
                                className="btn btn--approve"
                                disabled={busy}
                                onClick={() => handleApprove(a.id, a.name)}
                              >
                                {busy ? <Spinner small /> : '✓ Approve'}
                              </button>
                              <button
                                id={`agent-reject-btn-${a.id}`}
                                className="btn btn--reject"
                                disabled={busy}
                                onClick={() => handleReject(a.id, a.name)}
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

        {/* ── Core Banking Integration notice ─────────────────────── */}
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

        {/* ── Recent Referrals — ALL roles ─────────────────────────── */}
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

        {/* ── ADMIN-ONLY sections ──────────────────────────────────── */}
        {isAdmin && (
          <>
            {/* Campaign creation form (with Rules Builder) */}
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
                onEdited={refreshCampaigns}
                onDeleted={refreshCampaigns}
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
