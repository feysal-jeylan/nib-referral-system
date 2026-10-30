/**
 * referral-api/services/ruleEngine.js
 * -------------------------------------
 * Pure rule-evaluation service for campaign qualification.
 *
 * This module is intentionally framework-agnostic — it receives a DB client
 * and customer data, fetches the campaign's rules, evaluates them, and returns
 * a plain result object. It has no Express dependencies (no req/res).
 *
 * Exported function:
 *   evaluateRules(campaign_id, customer_data, client)
 *     → Promise<{ passed: boolean, failedRule: string | null }>
 *
 * How the rule engine works
 * ─────────────────────────
 * A campaign has 0..N rules stored in `campaign_rules`:
 *   { rule_type, operator, rule_value (JSONB) }
 *
 * Example rows:
 *   { rule_type: 'MIN_DEPOSIT',  operator: 'GREATER_THAN_OR_EQUAL', rule_value: { amount: 5000 } }
 *   { rule_type: 'ACCOUNT_TYPE', operator: 'EQUALS',                rule_value: { type: 'SAVINGS' } }
 *
 * ALL rules must pass (logical AND). If any rule fails, passed = false and
 * failedRule is a human-readable description of which rule was violated.
 *
 * Supported rule_types:
 *   MIN_DEPOSIT   — compares customer deposit_amount to rule_value.amount (numeric)
 *   ACCOUNT_TYPE  — compares customer account_type to rule_value.type (string)
 *
 * Supported operators (per schema_v6_rule_engine.sql CHECK constraint):
 *   GREATER_THAN            >
 *   LESS_THAN               <
 *   EQUALS                  ===
 *   GREATER_THAN_OR_EQUAL   >=
 *   LESS_THAN_OR_EQUAL      <=
 *   NOT_EQUALS              !==
 *
 * Per RULES.md:
 *   - Never string-concatenate SQL. All DB access uses parameterized queries.
 *   - Never throw unhandled exceptions — always return { passed, failedRule }.
 *   - The client parameter is the pg PoolClient from the caller's transaction,
 *     so rule evaluation participates in the same atomic transaction as the
 *     referral insert. No rules can change between evaluation and insert.
 */

'use strict';

// ---------------------------------------------------------------------------
// applyOperator(actual, operator, expected)
//
// Performs a type-safe comparison between two values.
//
// Parameters:
//   actual   — the value extracted from customer_data (number or string)
//   operator — one of the 6 supported operators (see above)
//   expected — the value extracted from the rule's rule_value JSONB
//
// Returns: boolean — true if the comparison holds.
//
// Note: String comparisons (GREATER_THAN, LESS_THAN, etc.) use lexicographic
// ordering, which is correct for operators like EQUALS and NOT_EQUALS but may
// be unintuitive for ordering. The only numeric rule type (MIN_DEPOSIT) always
// receives numbers, so this is safe in practice.
// ---------------------------------------------------------------------------
function applyOperator(actual, operator, expected) {
  switch (operator) {
    case 'GREATER_THAN':           return actual >  expected;
    case 'LESS_THAN':              return actual <  expected;
    case 'EQUALS':                 return actual === expected;
    case 'GREATER_THAN_OR_EQUAL':  return actual >= expected;
    case 'LESS_THAN_OR_EQUAL':     return actual <= expected;
    case 'NOT_EQUALS':             return actual !== expected;
    default:
      // Unknown operator — fail safe: treat as a failing rule so bad DB data
      // does not silently let through every customer.
      console.warn(`[ruleEngine] Unknown operator "${operator}" — rule will FAIL by default.`);
      return false;
  }
}

// ---------------------------------------------------------------------------
// evaluateRules(campaign_id, customer_data, client)
//
// Fetches all rules for `campaign_id` using the provided DB client, then
// evaluates each rule against `customer_data` in sequence (ALL must pass).
//
// Parameters:
//   campaign_id   — integer PK of the campaign
//   customer_data — object from the Temenos webhook payload:
//                   { account_type, deposit_amount, customer_name, customer_phone }
//   client        — a pg PoolClient (already inside a BEGIN transaction)
//
// Returns:
//   { passed: true,  failedRule: null }         — all rules passed
//   { passed: false, failedRule: "reason..." }  — at least one rule failed
//
// Design note: if a campaign has NO rules, every customer passes by default.
// This is intentional — a campaign with no qualification rules is universally
// open. An admin must explicitly add rules to restrict eligibility.
// ---------------------------------------------------------------------------
async function evaluateRules(campaign_id, customer_data, client) {
  // ── Fetch all rules for this campaign ──────────────────────────────────────
  //
  // We query inside the caller's transaction (using the provided `client`)
  // so that rule reads are consistent with the referral write that follows.
  // Ordered by id for deterministic evaluation order.
  const rulesResult = await client.query(
    `SELECT id, rule_type, operator, rule_value
     FROM   campaign_rules
     WHERE  campaign_id = $1
     ORDER  BY id ASC`,
    [campaign_id]
  );

  const rules = rulesResult.rows;

  // ── No rules → universal pass ──────────────────────────────────────────────
  if (rules.length === 0) {
    return { passed: true, failedRule: null };
  }

  // ── Evaluate each rule in sequence ────────────────────────────────────────
  for (const rule of rules) {
    const { rule_type, operator, rule_value } = rule;

    let actual;
    let expected;
    let ruleDescription;

    switch (rule_type) {

      // ── MIN_DEPOSIT rule ───────────────────────────────────────────────────
      // Compares the numeric deposit_amount from the webhook against
      // the threshold stored in rule_value.amount.
      //
      // Example rule_value: { "amount": 5000, "currency": "ETB" }
      //
      // We coerce both sides to Number to avoid type-mismatch surprises from
      // JSONB (which returns numbers as JS numbers, but being explicit is safe).
      case 'MIN_DEPOSIT': {
        actual   = Number(customer_data.deposit_amount);
        expected = Number(rule_value.amount ?? rule_value.value ?? 0);
        ruleDescription =
          `MIN_DEPOSIT: deposit_amount (${actual}) must be ${operator} ${expected}`;

        if (!applyOperator(actual, operator, expected)) {
          return {
            passed:     false,
            failedRule: ruleDescription,
          };
        }
        break;
      }

      // ── ACCOUNT_TYPE rule ──────────────────────────────────────────────────
      // Compares the account_type string from the webhook against the
      // expected type stored in rule_value.type.
      //
      // Example rule_value: { "type": "SAVINGS" }
      //
      // Both sides are uppercased for case-insensitive comparison.
      case 'ACCOUNT_TYPE': {
        actual   = String(customer_data.account_type ?? '').toUpperCase();
        expected = String(rule_value.type ?? rule_value.value ?? '').toUpperCase();
        ruleDescription =
          `ACCOUNT_TYPE: account_type (${actual}) must be ${operator} ${expected}`;

        if (!applyOperator(actual, operator, expected)) {
          return {
            passed:     false,
            failedRule: ruleDescription,
          };
        }
        break;
      }

      // ── Unknown rule_type ──────────────────────────────────────────────────
      // Fail safe: an unrecognised rule type causes a fail rather than a silent
      // pass. This prevents a misconfigured DB row from crediting ineligible
      // customers.
      default: {
        const unknownDesc = `Unknown rule_type "${rule_type}" — fails by default.`;
        console.warn(`[ruleEngine] ${unknownDesc} (campaign_id=${campaign_id}, rule_id=${rule.id})`);
        return {
          passed:     false,
          failedRule: unknownDesc,
        };
      }
    }
  }

  // ── All rules passed ───────────────────────────────────────────────────────
  return { passed: true, failedRule: null };
}

module.exports = { evaluateRules };

