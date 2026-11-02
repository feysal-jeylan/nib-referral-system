/**
 * referral-api/services/ruleEngine.js
 * -------------------------------------
 * Pure rule-evaluation service for campaign qualification.
 *
 * This module is intentionally framework-agnostic — it receives a Prisma
 * transaction context and customer data, fetches the campaign's rules,
 * evaluates them, and returns a plain result object. It has no Express
 * dependencies (no req/res).
 *
 * V8 (Prisma migration):
 *   The `client` parameter previously accepted a raw pg PoolClient and called
 *   client.query(). It now accepts a Prisma transaction object (the `tx`
 *   argument passed inside prisma.$transaction(async (tx) => { ... })).
 *   This keeps rule evaluation inside the same atomic transaction as the
 *   referral insert in integration.js.
 *
 * Exported function:
 *   evaluateRules(campaign_id, customer_data, tx)
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
 *   - Never string-concatenate SQL. Prisma handles parameterisation natively.
 *   - Never throw unhandled exceptions — always return { passed, failedRule }.
 *   - The tx parameter is a Prisma interactive-transaction handle, so rule
 *     evaluation participates in the same atomic transaction as the referral
 *     insert. No rules can change between evaluation and insert.
 */

'use strict';

// ---------------------------------------------------------------------------
// applyOperator(actual, operator, expected)
//
// Performs a type-safe comparison between two values.
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
// evaluateRules(campaign_id, customer_data, tx)
//
// Fetches all rules for `campaign_id` using the provided Prisma transaction
// handle, then evaluates each rule against `customer_data` in sequence.
// ALL rules must pass (logical AND).
//
// Parameters:
//   campaign_id   — integer PK of the campaign
//   customer_data — object from the Temenos webhook payload:
//                   { account_type, deposit_amount, customer_name, customer_phone }
//   tx            — a Prisma interactive-transaction handle
//                   (the `tx` arg inside prisma.$transaction(async (tx) => {}))
//
// Returns:
//   { passed: true,  failedRule: null }         — all rules passed
//   { passed: false, failedRule: "reason..." }  — at least one rule failed
//
// Design note: if a campaign has NO rules, every customer passes by default.
// ---------------------------------------------------------------------------
async function evaluateRules(campaign_id, customer_data, tx) {
  // ── Fetch all rules for this campaign inside the transaction ──────────────
  // Ordered by id for deterministic evaluation order.
  const rules = await tx.campaignRule.findMany({
    where:   { campaign_id },
    orderBy: { id: 'asc' },
  });

  // ── No rules → universal pass ─────────────────────────────────────────────
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
      case 'MIN_DEPOSIT': {
        actual   = Number(customer_data.deposit_amount);
        expected = Number(rule_value.amount ?? rule_value.value ?? 0);
        ruleDescription =
          `MIN_DEPOSIT: deposit_amount (${actual}) must be ${operator} ${expected}`;

        if (!applyOperator(actual, operator, expected)) {
          return { passed: false, failedRule: ruleDescription };
        }
        break;
      }

      // ── ACCOUNT_TYPE rule ──────────────────────────────────────────────────
      case 'ACCOUNT_TYPE': {
        actual   = String(customer_data.account_type ?? '').toUpperCase();
        expected = String(rule_value.type ?? rule_value.value ?? '').toUpperCase();
        ruleDescription =
          `ACCOUNT_TYPE: account_type (${actual}) must be ${operator} ${expected}`;

        if (!applyOperator(actual, operator, expected)) {
          return { passed: false, failedRule: ruleDescription };
        }
        break;
      }

      // ── Unknown rule_type ──────────────────────────────────────────────────
      default: {
        const unknownDesc = `Unknown rule_type "${rule_type}" — fails by default.`;
        console.warn(`[ruleEngine] ${unknownDesc} (campaign_id=${campaign_id}, rule_id=${rule.id})`);
        return { passed: false, failedRule: unknownDesc };
      }
    }
  }

  // ── All rules passed ───────────────────────────────────────────────────────
  return { passed: true, failedRule: null };
}

module.exports = { evaluateRules };
