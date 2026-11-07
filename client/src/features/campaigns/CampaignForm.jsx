/**
 * features/campaigns/CampaignForm.jsx
 * ─────────────────────────────────────
 * Admin-only form to create a new campaign with an inline Rules Builder.
 * Pure Tailwind — no App.css dependency.
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
  name: '', campaign_code: '', start_date: '', end_date: '',
  reward_type: 'CASH', reward_value: '',
  description: '', reward_threshold: '',
};
const EMPTY_RULE = {
  rule_type: 'MIN_DEPOSIT',
  operator: 'GREATER_THAN_OR_EQUAL',
  rule_value_raw: '',
};

// Shared input / select class
const INPUT_CLS =
  'w-full px-4 py-2.5 bg-bg border border-border rounded-md text-sm text-text-1 ' +
  'placeholder-text-3 outline-none transition-all duration-150 ' +
  'focus:border-gold focus:ring-1 focus:ring-gold focus:bg-surface';

const LABEL_CLS = 'block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5';

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
        campaign_code:    form.campaign_code || undefined,
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
      className="p-6"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Create a new campaign"
    >
      <h2 className="text-text-1 font-bold text-base mb-5 pb-4 border-b border-border">
        Create New Campaign
      </h2>

      {/* ── Core campaign fields ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Campaign Name */}
        <div>
          <label htmlFor="camp-name" className={LABEL_CLS}>Campaign Name</label>
          <input
            id="camp-name" name="name" type="text"
            placeholder="e.g. Q4 Savings Drive"
            value={form.name} onChange={handleCampaignChange}
            required ref={nameRef} autoComplete="off"
            className={INPUT_CLS}
          />
        </div>
        {/* Campaign Code — the Temenos attribution key */}
        <div>
          <label htmlFor="camp-code" className={LABEL_CLS}>
            Campaign Code{' '}
            <span className="normal-case font-normal text-text-3">(Temenos ID)</span>
          </label>
          <input
            id="camp-code" name="campaign_code" type="text"
            placeholder="e.g. SAV-2026-OCT"
            value={form.campaign_code} onChange={handleCampaignChange}
            autoComplete="off"
            className={`${INPUT_CLS} font-mono tracking-wider`}
          />
          <p className="mt-1 text-[10px] text-text-3 leading-relaxed">
            Temenos must send this exact code in the webhook <code className="font-mono">campaign_code</code> field.
          </p>
        </div>
        {/* Start Date */}
        <div>
          <label htmlFor="camp-start" className={LABEL_CLS}>Start Date</label>
          <input
            id="camp-start" name="start_date" type="date"
            value={form.start_date} onChange={handleCampaignChange}
            required className={INPUT_CLS}
          />
        </div>
        {/* End Date */}
        <div>
          <label htmlFor="camp-end" className={LABEL_CLS}>End Date</label>
          <input
            id="camp-end" name="end_date" type="date"
            value={form.end_date} onChange={handleCampaignChange}
            required className={INPUT_CLS}
          />
        </div>
        {/* Reward Type */}
        <div>
          <label htmlFor="camp-reward-type" className={LABEL_CLS}>Reward Type</label>
          <select
            id="camp-reward-type" name="reward_type"
            value={form.reward_type} onChange={handleCampaignChange}
            required className={INPUT_CLS}
          >
            <option value="CASH">CASH</option>
            <option value="BADGE">BADGE</option>
          </select>
        </div>
        {/* Reward Value */}
        <div>
          <label htmlFor="camp-reward-value" className={LABEL_CLS}>Reward Value</label>
          <input
            id="camp-reward-value" name="reward_value" type="text"
            placeholder="e.g. 500 ETB"
            value={form.reward_value} onChange={handleCampaignChange}
            required autoComplete="off" className={INPUT_CLS}
          />
        </div>
        {/* Reward Threshold */}
        <div>
          <label htmlFor="camp-threshold" className={LABEL_CLS}>
            Reward Threshold{' '}
            <span className="normal-case font-normal text-text-3">(optional)</span>
          </label>
          <input
            id="camp-threshold" name="reward_threshold" type="number"
            placeholder="e.g. 5 referrals"
            value={form.reward_threshold} onChange={handleCampaignChange}
            min="0" autoComplete="off" className={INPUT_CLS}
          />
        </div>
        {/* Description — full width */}
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="camp-desc" className={LABEL_CLS}>
            Description{' '}
            <span className="normal-case font-normal text-text-3">(optional)</span>
          </label>
          <input
            id="camp-desc" name="description" type="text"
            placeholder="e.g. Year-end savings promotion for SAVINGS accounts"
            value={form.description} onChange={handleCampaignChange}
            autoComplete="off" className={INPUT_CLS}
          />
        </div>
      </div>

      {/* ── Rules Builder ─────────────────────────────────────────────────── */}
      <div className="mb-6 bg-panel border border-border rounded-lg p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-text-1 font-semibold text-sm">Qualification Rules</span>
          <span className="text-text-3 text-xs">All rules must pass (logical AND)</span>
        </div>

        {/* Rule input row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label htmlFor="rule-type" className={LABEL_CLS}>Rule Type</label>
            <select
              id="rule-type" name="rule_type"
              value={currentRule.rule_type}
              onChange={handleRuleChange}
              className={INPUT_CLS}
            >
              {RULE_TYPES.map(rt => (
                <option key={rt} value={rt}>{rt.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rule-operator" className={LABEL_CLS}>Operator</label>
            <select
              id="rule-operator" name="operator"
              value={currentRule.operator}
              onChange={handleRuleChange}
              className={INPUT_CLS}
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rule-value" className={LABEL_CLS}>Value</label>
            <input
              id="rule-value" name="rule_value_raw" type="text"
              placeholder={rulePlaceholder}
              value={currentRule.rule_value_raw}
              onChange={handleRuleChange}
              autoComplete="off" className={INPUT_CLS}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddRule}
          aria-label="Add this rule to the campaign"
          className="inline-flex items-center gap-1.5 border border-brand text-brand text-xs font-semibold px-4 py-2 rounded hover:bg-brand hover:text-white transition-colors"
        >
          + Add Rule
        </button>

        {/* Queued rules preview */}
        {pendingRules.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-2">
              Rules to be applied ({pendingRules.length}):
            </p>
            <ul className="flex flex-col gap-2">
              {pendingRules.map((rule, i) => (
                <li key={i} className="flex items-center justify-between gap-3 bg-surface border border-border rounded px-3 py-2">
                  <span className="font-mono text-xs text-brand font-semibold">{ruleLabel(rule)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(i)}
                    aria-label={`Remove rule: ${ruleLabel(rule)}`}
                    className="text-text-3 hover:text-reject-txt text-xs font-bold flex-shrink-0 transition-colors"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pendingRules.length === 0 && (
          <p className="mt-3 text-text-3 text-xs italic">
            No rules added yet — this campaign will accept all customers.
          </p>
        )}
      </div>

      <button
        id="submit-campaign-btn"
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors shadow-sm disabled:opacity-55 disabled:cursor-not-allowed"
      >
        {submitting && <Spinner small />}
        {submitting ? 'Creating…' : 'Create Campaign'}
      </button>
    </form>
  );
}
