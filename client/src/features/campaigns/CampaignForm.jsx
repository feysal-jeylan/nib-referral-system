/**
 * features/campaigns/CampaignForm.jsx
 * ─────────────────────────────────────
 * Admin-only form to create a new campaign with an inline Rules Builder.
 * Pure Tailwind — matches Nib Bank design tokens.
 *
 * Submit flow:
 *   1. POST /api/campaigns            → get campaign id
 *   2. POST /api/campaigns/:id/rules  for each queued rule (sequential)
 *   3. Call onCreated() to refresh list & onSuccess() to close modal
 *
 * Props:
 *   onCreated {() => void}
 *   onSuccess {() => void}
 *   onToast   {(toast: { type, message }) => void}
 */

import { useEffect, useRef, useState } from 'react';
import api from '@/services/api';
import Spinner from '@/components/ui/Spinner';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  RULE_TYPES,
  OPERATORS,
  OPERATOR_SYMBOL,
  COMPOSITE_FIELDS,
  NUMERIC_CONDITION_FIELDS,
} from './constants';

const EMPTY_CAMPAIGN = {
  name: '',
  campaign_code: '',
  start_date: '',
  end_date: '',
  reward_type: 'CASH',
  reward_value: '',
  description: '',
  reward_threshold: '',
  parent_id: '',
};

const EMPTY_RULE = {
  rule_type: 'MIN_DEPOSIT',
  operator: 'GREATER_THAN_OR_EQUAL',
  rule_value_raw: '',
};

const EMPTY_CONDITION = {
  field: 'deposit_amount',
  operator: 'GREATER_THAN',
  value_raw: '',
};

// Shared input / select class (shadcn Input override)
const INPUT_CLS =
  'h-auto w-full px-4 py-2.5 bg-bg border-border rounded-md text-sm text-text-1 ' +
  'placeholder:text-text-3 shadow-none transition-all duration-150 ' +
  'focus-visible:border-gold focus-visible:ring-1 focus-visible:ring-gold focus-visible:bg-surface';

const LABEL_CLS = 'block text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5';

export default function CampaignForm({ onCreated, onSuccess, onToast }) {
  const [form, setForm]                 = useState(EMPTY_CAMPAIGN);
  const [pendingRules, setPendingRules] = useState([]);
  const [currentRule, setCurrentRule]   = useState(EMPTY_RULE);
  const [submitting, setSubmitting]     = useState(false);

  // ── Parent campaigns for picker ──────────────────────────────────────────
  const [rootCampaigns, setRootCampaigns] = useState([]);
  useEffect(() => {
    api.get('/campaigns/roots')
      .then(r => setRootCampaigns(r.data?.data ?? []))
      .catch(() => {}); // silent — picker just shows empty
  }, []);

  // ── COMPOSITE rule state ─────────────────────────────────────────────────
  const [compositeLogicalOp,  setCompositeLogicalOp]  = useState('AND');
  const [compositeConditions, setCompositeConditions] = useState([{ ...EMPTY_CONDITION }]);

  const nameRef = useRef(null);

  // ── Reset entire form state ──────────────────────────────────────────────
  function resetForm() {
    setForm(EMPTY_CAMPAIGN);
    setPendingRules([]);
    setCurrentRule(EMPTY_RULE);
    resetCompositeState();
  }

  function handleCampaignChange(e) {
    const { name, value } = e.target;
    // campaign_code is always stored and displayed as uppercase
    setForm(prev => ({ ...prev, [name]: name === 'campaign_code' ? value.toUpperCase() : value }));
  }

  function handleRuleChange(e) {
    setCurrentRule(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // ── COMPOSITE condition helpers ──────────────────────────────────────────
  function handleConditionChange(index, field, value) {
    setCompositeConditions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function handleAddCondition() {
    setCompositeConditions(prev => [...prev, { ...EMPTY_CONDITION }]);
  }

  function handleRemoveCondition(index) {
    setCompositeConditions(prev => prev.filter((_, i) => i !== index));
  }

  function resetCompositeState() {
    setCompositeLogicalOp('AND');
    setCompositeConditions([{ ...EMPTY_CONDITION }]);
  }

  /** Convert raw text input into the rule_value JSON shape the engine expects. */
  function buildRuleValue(rule) {
    if (rule.rule_type === 'MIN_DEPOSIT')  return { amount: parseFloat(rule.rule_value_raw) || 0 };
    if (rule.rule_type === 'ACCOUNT_TYPE') return { type: rule.rule_value_raw.trim().toUpperCase() };
    if (rule.rule_type === 'COMPOSITE') {
      return {
        logical_operator: rule._compositeLogicalOp,
        conditions: rule._compositeConditions.map(c => ({
          field:    c.field,
          operator: c.operator,
          value:    NUMERIC_CONDITION_FIELDS.has(c.field)
            ? parseFloat(c.value_raw) || 0
            : c.value_raw.trim().toUpperCase(),
        })),
      };
    }
    return { value: rule.rule_value_raw.trim() };
  }

  function handleAddRule() {
    if (currentRule.rule_type === 'COMPOSITE') {
      // Validate: at least one condition and all values filled
      if (compositeConditions.length === 0) {
        onToast({ type: 'error', message: 'Add at least one condition for the COMPOSITE rule.' });
        return;
      }
      const incomplete = compositeConditions.some(c => !c.value_raw.trim());
      if (incomplete) {
        onToast({ type: 'error', message: 'All condition values must be filled before adding a COMPOSITE rule.' });
        return;
      }
      setPendingRules(prev => [
        ...prev,
        {
          ...currentRule,
          _compositeLogicalOp:  compositeLogicalOp,
          _compositeConditions: compositeConditions.map(c => ({ ...c })),
        },
      ]);
      setCurrentRule(EMPTY_RULE);
      resetCompositeState();
      return;
    }

    if (!currentRule.rule_value_raw.trim()) {
      onToast({ type: 'error', message: 'Please enter a rule value before adding.' });
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
    if (rule.rule_type === 'COMPOSITE') {
      const op  = rule._compositeLogicalOp ?? 'AND';
      const conds = (rule._compositeConditions ?? [])
        .map(c => `${c.field} ${c.operator} ${c.value_raw}`)
        .join(` ${op} `);
      return `COMPOSITE [${op}]: ${conds}`;
    }
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
        parent_id:        form.parent_id ? parseInt(form.parent_id, 10) : undefined,
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
          onCreated?.();
          resetForm();
          onSuccess?.();
          return;
        }
      }

      // ── Step 3: Success ───────────────────────────────────────────────────
      const ruleCount = pendingRules.length;
      onCreated?.();
      onToast({
        type: 'success',
        message: `Campaign "${data.campaign.name}" created as DRAFT` +
          (ruleCount > 0 ? ` with ${ruleCount} rule${ruleCount !== 1 ? 's' : ''}.` : '.'),
      });

      resetForm();
      onSuccess?.();

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

  function handleCancel() {
    resetForm();
    onSuccess?.();
  }

  // COMPOSITE uses its own condition inputs; placeholder only used for simple types.
  const rulePlaceholder = currentRule.rule_type === 'MIN_DEPOSIT'
    ? 'e.g. 5000'
    : currentRule.rule_type === 'ACCOUNT_TYPE'
      ? 'e.g. SAVINGS'
      : '';

  return (
    <form
      id="campaign-form"
      className="space-y-6"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Create a new campaign"
    >
      {/* ── Core campaign fields ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Campaign Name */}
        <div>
          <label htmlFor="camp-name" className={LABEL_CLS}>Campaign Name</label>
          <Input
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
          <Input
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
          <Input
            id="camp-start" name="start_date" type="date"
            value={form.start_date} onChange={handleCampaignChange}
            required className={INPUT_CLS}
          />
        </div>

        {/* End Date */}
        <div>
          <label htmlFor="camp-end" className={LABEL_CLS}>End Date</label>
          <Input
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
          <Input
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
          <Input
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
          <Input
            id="camp-desc" name="description" type="text"
            placeholder="e.g. Year-end savings promotion for SAVINGS accounts"
            value={form.description} onChange={handleCampaignChange}
            autoComplete="off" className={INPUT_CLS}
          />
        </div>

        {/* Parent Campaign — full width */}
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="camp-parent" className={LABEL_CLS}>
            Parent Campaign{' '}
            <span className="normal-case font-normal text-text-3">(optional — make this a sub-campaign)</span>
          </label>
          <select
            id="camp-parent"
            name="parent_id"
            value={form.parent_id}
            onChange={handleCampaignChange}
            className={INPUT_CLS}
            aria-label="Parent campaign picker"
          >
            <option value="">None (Root Campaign)</option>
            {rootCampaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {c.campaign_code ? `(${c.campaign_code})` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-text-3 leading-relaxed">
            Linking to a parent creates a sub-campaign. Sub-campaigns cannot themselves have children.
          </p>
        </div>
      </div>

      {/* ── Rules Builder ─────────────────────────────────────────────────── */}
      <div className="p-4 bg-bg border border-border rounded-lg">
        <h3 className="text-text-1 font-bold text-sm mb-1">
          Qualification Rules{' '}
          <span className="font-normal text-text-3 text-xs">(optional)</span>
        </h3>
        <p className="text-text-3 text-xs mb-4">
          Add rules that a customer referral must satisfy to qualify for this campaign's reward.
        </p>

        {/* Rule input row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label htmlFor="rule-type" className={LABEL_CLS}>Rule Type</label>
            <select
              id="rule-type"
              name="rule_type"
              value={currentRule.rule_type}
              onChange={handleRuleChange}
              className={INPUT_CLS}
            >
              {RULE_TYPES.map(rt => (
                <option key={rt.value} value={rt.value}>{rt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rule-operator" className={LABEL_CLS}>Operator</label>
            <select
              id="rule-operator"
              name="operator"
              value={currentRule.operator}
              onChange={handleRuleChange}
              disabled={currentRule.rule_type === 'COMPOSITE'}
              className={`${INPUT_CLS} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rule-value" className={LABEL_CLS}>
              Rule Value {currentRule.rule_type === 'COMPOSITE' && <span className="font-normal text-text-3">(configured below)</span>}
            </label>
            <Input
              id="rule-value"
              name="rule_value_raw"
              type="text"
              placeholder={rulePlaceholder}
              value={currentRule.rule_value_raw}
              onChange={handleRuleChange}
              disabled={currentRule.rule_type === 'COMPOSITE'}
              autoComplete="off"
              className={`${INPUT_CLS} disabled:opacity-40 disabled:cursor-not-allowed`}
            />
          </div>
        </div>

        {/* ── COMPOSITE builder panel ──────────────────────────────────────── */}
        {currentRule.rule_type === 'COMPOSITE' && (
          <div className="mb-4 p-3 bg-surface border border-gold/40 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold text-text-1">Combine conditions using:</span>
              <div className="inline-flex rounded border border-border overflow-hidden">
                {['AND', 'OR'].map(op => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => setCompositeLogicalOp(op)}
                    className={`px-3 py-1 text-xs font-bold transition-colors ${
                      compositeLogicalOp === op
                        ? 'bg-brand text-white'
                        : 'bg-surface text-text-2 hover:bg-bg'
                    }`}
                  >
                    {op}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-text-3">
                {compositeLogicalOp === 'AND'
                  ? 'All conditions must pass'
                  : 'At least one condition must pass'}
              </span>
            </div>

            {/* Condition rows */}
            <div className="flex flex-col gap-3">
              {compositeConditions.map((cond, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className={LABEL_CLS}>Field</label>
                    <select
                      value={cond.field}
                      onChange={e => handleConditionChange(idx, 'field', e.target.value)}
                      className={INPUT_CLS}
                      aria-label={`Condition ${idx + 1} field`}
                    >
                      {COMPOSITE_FIELDS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Operator</label>
                    <select
                      value={cond.operator}
                      onChange={e => handleConditionChange(idx, 'operator', e.target.value)}
                      className={INPUT_CLS}
                      aria-label={`Condition ${idx + 1} operator`}
                    >
                      {OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Value</label>
                    <Input
                      type="text"
                      value={cond.value_raw}
                      onChange={e => handleConditionChange(idx, 'value_raw', e.target.value)}
                      placeholder={NUMERIC_CONDITION_FIELDS.has(cond.field) ? 'e.g. 5000' : 'e.g. SAVINGS'}
                      autoComplete="off"
                      className={INPUT_CLS}
                      aria-label={`Condition ${idx + 1} value`}
                    />
                  </div>
                  <div className="pb-0.5">
                    <button
                      type="button"
                      onClick={() => handleRemoveCondition(idx)}
                      disabled={compositeConditions.length === 1}
                      aria-label={`Remove condition ${idx + 1}`}
                      className="text-text-3 hover:text-reject-txt text-sm font-bold px-2 py-2.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddCondition}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand border border-brand px-3 py-1.5 rounded hover:bg-brand hover:text-white transition-colors"
            >
              + Add Condition
            </button>
          </div>
        )}

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

      {/* ── Form Actions ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={handleCancel}
          className="border-border text-text-2 hover:bg-surface px-4 py-2 text-sm rounded-md transition-colors"
        >
          Cancel
        </Button>

        <Button
          id="submit-campaign-btn"
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold px-5 py-2.5 h-auto rounded-md transition-colors shadow-sm disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {submitting && <Spinner small />}
          {submitting ? 'Creating…' : 'Create Campaign'}
        </Button>
      </div>
    </form>
  );
}
