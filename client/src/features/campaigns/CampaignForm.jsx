/**
 * features/campaigns/CampaignForm.jsx
 * ─────────────────────────────────────
 * Admin-only form to create a new campaign with an inline Rules Builder.
 *
 * Submit flow:
 *   1. POST /api/campaigns        → get campaign id
 *   2. POST /api/campaigns/:id/rules  for each queued rule (sequential)
 *   3. Call onCreated() to trigger a list refresh in Dashboard
 *
 * Props:
 *   onCreated {() => void}
 *   onToast   {(toast: { type, message }) => void}
 */
import { useRef, useState } from 'react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';
import { RULE_TYPES, OPERATORS, OPERATOR_SYMBOL } from './constants';

const EMPTY_CAMPAIGN = {
  name: '', start_date: '', end_date: '',
  reward_type: 'CASH', reward_value: '',
  description: '', reward_threshold: '',
};
const EMPTY_RULE = {
  rule_type: 'MIN_DEPOSIT',
  operator: 'GREATER_THAN_OR_EQUAL',
  rule_value_raw: '',
};

export default function CampaignForm({ onCreated, onToast }) {
  const [form, setForm]               = useState(EMPTY_CAMPAIGN);
  const [pendingRules, setPendingRules] = useState([]);
  const [currentRule, setCurrentRule] = useState(EMPTY_RULE);
  const [submitting, setSubmitting]   = useState(false);
  const nameRef = useRef(null);

  function handleCampaignChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleRuleChange(e) {
    setCurrentRule(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  /** Convert raw text input into the rule_value JSON shape the engine expects. */
  function buildRuleValue(rule) {
    if (rule.rule_type === 'MIN_DEPOSIT')  return { amount: parseFloat(rule.rule_value_raw) || 0 };
    if (rule.rule_type === 'ACCOUNT_TYPE') return { type: rule.rule_value_raw.trim().toUpperCase() };
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

  function ruleLabel(rule) {
    const sym = OPERATOR_SYMBOL[rule.operator] ?? rule.operator;
    if (rule.rule_type === 'MIN_DEPOSIT')  return `MIN_DEPOSIT ${sym} ${rule.rule_value_raw} ETB`;
    if (rule.rule_type === 'ACCOUNT_TYPE') return `ACCOUNT_TYPE ${sym} ${rule.rule_value_raw.toUpperCase()}`;
    return `${rule.rule_type} ${sym} ${rule.rule_value_raw}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // ── Step 1: Create campaign ───────────────────────────────────────────
      const { data } = await api.post('/campaigns', {
        name:             form.name,
        description:      form.description || undefined,
        start_date:       form.start_date ? new Date(form.start_date).toISOString() : '',
        end_date:         form.end_date   ? new Date(form.end_date).toISOString()   : '',
        reward_type:      form.reward_type,
        reward_value:     form.reward_value,
        reward_threshold: form.reward_threshold ? parseInt(form.reward_threshold, 10) : undefined,
      });

      const campaignId = data.campaign.id;

      // ── Step 2: POST each queued rule sequentially ────────────────────────
      for (const rule of pendingRules) {
        try {
          await api.post(`/campaigns/${campaignId}/rules`, {
            rule_type:  rule.rule_type,
            operator:   rule.operator,
            rule_value: buildRuleValue(rule),
          });
        } catch (ruleErr) {
          onToast({
            type: 'error',
            message: `⚠️ Campaign created but rule "${rule.rule_type}" failed: ${
              ruleErr.response?.data?.error ?? 'Unknown error'
            }`,
          });
          onCreated();
          setForm(EMPTY_CAMPAIGN);
          setPendingRules([]);
          return;
        }
      }

      // ── Step 3: Success ───────────────────────────────────────────────────
      const ruleCount = pendingRules.length;
      onCreated();
      onToast({
        type: 'success',
        message: `✅ Campaign "${data.campaign.name}" created as DRAFT` +
          (ruleCount > 0 ? ` with ${ruleCount} rule${ruleCount !== 1 ? 's' : ''}.` : '.'),
      });
      setForm(EMPTY_CAMPAIGN);
      setPendingRules([]);
      nameRef.current?.focus();

    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        onToast({ type: 'error', message: '🔒 Your session has expired. Please log in again.' });
        return;
      }
      onToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to create campaign.' });
    } finally {
      setSubmitting(false);
    }
  }

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

      {/* ── Core campaign fields ──────────────────────────────────────────── */}
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
          <label htmlFor="camp-threshold">
            Reward Threshold <span className="form__optional">(optional)</span>
          </label>
          <input
            id="camp-threshold" name="reward_threshold" type="number"
            placeholder="e.g. 5 referrals"
            value={form.reward_threshold} onChange={handleCampaignChange}
            min="0" autoComplete="off"
          />
        </div>
        <div className="form__field form__field--wide">
          <label htmlFor="camp-desc">
            Description <span className="form__optional">(optional)</span>
          </label>
          <input
            id="camp-desc" name="description" type="text"
            placeholder="e.g. Year-end savings promotion for SAVINGS accounts"
            value={form.description} onChange={handleCampaignChange}
            autoComplete="off"
          />
        </div>
      </div>

      {/* ── Rules Builder ─────────────────────────────────────────────────── */}
      <div className="rules-builder">
        <div className="rules-builder__header">
          <span className="rules-builder__title">Qualification Rules</span>
          <span className="rules-builder__hint">
            All rules must pass for a referral to be accepted (logical AND).
          </span>
        </div>

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

      <button
        id="submit-campaign-btn"
        type="submit"
        className="btn btn--primary"
        disabled={submitting}
      >
        {submitting && <Spinner small />}
        {submitting ? 'Creating…' : 'Create Campaign'}
      </button>
    </form>
  );
}
