/**
 * server/services/ruleEngine.js
 * ─────────────────────────────
 * Pure, synchronous rule-evaluation engine for campaign qualification.
 *
 * V9 (Enterprise Rule Engine):
 *   The function signature changed from:
 *     evaluateRules(campaign_id, customer_data, tx)   ← async, fetched rules itself
 *   to:
 *     evaluateRules(customerData, campaignRules)       ← sync, pure evaluator
 *
 *   The caller (integration.service.js) is now responsible for fetching the
 *   pre-scoped rules array for the campaign before calling this function.
 *   This makes the engine fully testable without a database and ensures rule
 *   evaluation is strictly scoped to the correct campaign_id at the call site.
 *
 * Exported function:
 *   evaluateRules(customerData, campaignRules)
 *     → { passed: boolean, failedRule: string | null }
 *
 * How the rule engine works
 * ─────────────────────────
 * A campaign has 0..N pre-fetched rules (CampaignRule rows):
 *   { id, rule_type, operator, rule_value (JSONB) }
 *
 * Supported rule_types:
 *   MIN_DEPOSIT   — compares customer deposit_amount to rule_value.amount (numeric)
 *   ACCOUNT_TYPE  — compares customer account_type to rule_value.type (string)
 *   COMPOSITE     — evaluates a JSONB-defined set of conditions with AND/OR logic
 *
 * COMPOSITE rule_value shape:
 *   {
 *     "logical_operator": "AND" | "OR",
 *     "conditions": [
 *       { "field": "deposit_amount", "operator": "GREATER_THAN", "value": 5000 },
 *       { "field": "account_type",   "operator": "EQUALS",       "value": "SAVINGS" }
 *     ]
 *   }
 *
 * Supported condition fields: deposit_amount, account_type, customer_name, customer_phone
 *
 * Supported operators:
 *   GREATER_THAN | LESS_THAN | EQUALS | GREATER_THAN_OR_EQUAL | LESS_THAN_OR_EQUAL | NOT_EQUALS
 *
 * Per RULES.md:
 *   - Never throw unhandled exceptions — always return { passed, failedRule }.
 *   - Fail safe on unknown rule_types, unknown operators, or malformed JSONB.
 *   - If a campaign has NO rules, every customer passes by default.
 */

'use strict';

// ---------------------------------------------------------------------------
// NUMERIC_FIELDS
// Fields whose values must be coerced to Number before comparison.
// ---------------------------------------------------------------------------
const NUMERIC_FIELDS = new Set(['deposit_amount']);

// ---------------------------------------------------------------------------
// applyOperator(actual, operator, expected)
//
// Type-safe comparison. Returns false for any unrecognised operator (fail safe).
// ---------------------------------------------------------------------------
function applyOperator(actual, operator, expected) {
  switch (operator) {
    case 'GREATER_THAN':           return actual >   expected;
    case 'LESS_THAN':              return actual <   expected;
    case 'EQUALS':                 return actual === expected;
    case 'GREATER_THAN_OR_EQUAL':  return actual >=  expected;
    case 'LESS_THAN_OR_EQUAL':     return actual <=  expected;
    case 'NOT_EQUALS':             return actual !== expected;
    default:
      console.warn(`[ruleEngine] Unknown operator "${operator}" — rule will FAIL by default.`);
      return false;
  }
}

// ---------------------------------------------------------------------------
// resolveField(customerData, field)
//
// Extracts and coerces the correct value from customerData for a given field.
// Numeric fields are cast to Number; all others are uppercased strings.
// ---------------------------------------------------------------------------
function resolveField(customerData, field) {
  const raw = customerData[field];
  if (NUMERIC_FIELDS.has(field)) {
    return Number(raw ?? 0);
  }
  return String(raw ?? '').toUpperCase();
}

// ---------------------------------------------------------------------------
// evaluateComposite(customerData, rule)
//
// Evaluates a COMPOSITE rule whose rule_value is:
//   { logical_operator: 'AND'|'OR', conditions: [{ field, operator, value }] }
//
// Returns { passed: boolean, failedRule: string | null }.
// Never throws — all errors are caught and returned as { passed: false }.
// ---------------------------------------------------------------------------
function evaluateComposite(customerData, rule) {
  try {
    const rv = rule.rule_value;

    // ── Structure validation ────────────────────────────────────────────────
    if (!rv || typeof rv !== 'object') {
      return { passed: false, failedRule: 'Malformed COMPOSITE rule: rule_value is not an object.' };
    }
    const logicalOp = rv.logical_operator;
    if (logicalOp !== 'AND' && logicalOp !== 'OR') {
      return {
        passed: false,
        failedRule: `Malformed COMPOSITE rule: logical_operator must be "AND" or "OR", got "${logicalOp}".`,
      };
    }
    if (!Array.isArray(rv.conditions) || rv.conditions.length === 0) {
      return { passed: false, failedRule: 'Malformed COMPOSITE rule: conditions must be a non-empty array.' };
    }

    // ── Evaluate each condition ─────────────────────────────────────────────
    for (const cond of rv.conditions) {
      if (!cond || typeof cond.field !== 'string' || typeof cond.operator !== 'string') {
        return { passed: false, failedRule: 'Malformed COMPOSITE rule: a condition is missing "field" or "operator".' };
      }

      const actual   = resolveField(customerData, cond.field);
      // For numeric fields, expected must also be a Number.
      const expected = NUMERIC_FIELDS.has(cond.field)
        ? Number(cond.value ?? 0)
        : String(cond.value ?? '').toUpperCase();

      const condPassed = applyOperator(actual, cond.operator, expected);
      const condDesc   = `${cond.field} must be ${cond.operator} ${cond.value}`;

      if (logicalOp === 'AND' && !condPassed) {
        return { passed: false, failedRule: `Failed: ${condDesc}` };
      }
      if (logicalOp === 'OR' && condPassed) {
        return { passed: true, failedRule: null };
      }
    }

    // After iterating all conditions:
    //   AND → all passed (we would have returned early on any failure)
    //   OR  → none passed (we would have returned early on any success)
    if (logicalOp === 'AND') return { passed: true,  failedRule: null };
    // OR — build a summary of all failing conditions
    const summary = rv.conditions
      .map(c => `${c.field} ${c.operator} ${c.value}`)
      .join(' OR ');
    return { passed: false, failedRule: `Failed: no OR condition passed — [${summary}]` };

  } catch (err) {
    console.error('[ruleEngine] COMPOSITE evaluation error:', err.message);
    return { passed: false, failedRule: `Rule evaluation error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// evaluateRules(customerData, campaignRules)
//
// Pure synchronous evaluator. Receives a pre-fetched array of CampaignRule
// rows scoped to a single campaign and evaluates them against customerData.
//
// Parameters:
//   customerData   — object from the Temenos webhook payload:
//                    { account_type, deposit_amount, customer_name, customer_phone }
//   campaignRules  — array of CampaignRule rows (already filtered by campaign_id,
//                    ordered by id asc) — fetched by the caller, NOT this function.
//
// Returns:
//   { passed: true,  failedRule: null }         — all rules passed
//   { passed: false, failedRule: "reason..." }  — at least one rule failed
//
// Design note: if a campaign has NO rules, every customer passes by default.
// ---------------------------------------------------------------------------
function evaluateRules(customerData, campaignRules) {
  // ── No rules → universal pass ─────────────────────────────────────────────
  if (!campaignRules || campaignRules.length === 0) {
    return { passed: true, failedRule: null };
  }

  // ── Evaluate each rule in sequence ────────────────────────────────────────
  for (const rule of campaignRules) {
    const { rule_type, operator, rule_value } = rule;

    switch (rule_type) {

      // ── MIN_DEPOSIT rule ─────────────────────────────────────────────────
      case 'MIN_DEPOSIT': {
        const actual   = Number(customerData.deposit_amount);
        const expected = Number(rule_value?.amount ?? rule_value?.value ?? 0);
        const desc     = `MIN_DEPOSIT: deposit_amount (${actual}) must be ${operator} ${expected}`;
        if (!applyOperator(actual, operator, expected)) {
          return { passed: false, failedRule: desc };
        }
        break;
      }

      // ── ACCOUNT_TYPE rule ────────────────────────────────────────────────
      case 'ACCOUNT_TYPE': {
        const actual   = String(customerData.account_type ?? '').toUpperCase();
        const expected = String(rule_value?.type ?? rule_value?.value ?? '').toUpperCase();
        const desc     = `ACCOUNT_TYPE: account_type (${actual}) must be ${operator} ${expected}`;
        if (!applyOperator(actual, operator, expected)) {
          return { passed: false, failedRule: desc };
        }
        break;
      }

      // ── COMPOSITE rule ───────────────────────────────────────────────────
      case 'COMPOSITE': {
        const result = evaluateComposite(customerData, rule);
        if (!result.passed) return result;
        break;
      }

      // ── Unknown rule_type ────────────────────────────────────────────────
      default: {
        const unknownDesc = `Unknown rule_type "${rule_type}" — fails by default.`;
        console.warn(`[ruleEngine] ${unknownDesc} (rule_id=${rule.id})`);
        return { passed: false, failedRule: unknownDesc };
      }
    }
  }

  // ── All rules passed ───────────────────────────────────────────────────────
  return { passed: true, failedRule: null };
}

module.exports = { evaluateRules };
