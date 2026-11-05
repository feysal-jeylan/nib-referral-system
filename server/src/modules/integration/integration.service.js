/**
 * src/modules/integration/integration.service.js
 * ─────────────────────────────────────────────────
 * Data-access layer for the Temenos webhook handler and audit log.
 * Contains the full ACID transaction, idempotency guard, duplicate-customer
 * check, and rule-engine invocation.  No HTTP req/res logic here.
 */

'use strict';

const prisma            = require('@/config/db');
const { evaluateRules } = require('@/services/ruleEngine');

const ALLOWED_FIELDS = new Set([
  'transaction_id', 'referral_code', 'customer_name',
  'customer_phone', 'account_type', 'deposit_amount', 'date_of_transaction',
]);

// ── Idempotency pre-check (fast read, outside transaction) ───────────────────
async function findExistingLog(transaction_id) {
  return prisma.integrationLog.findUnique({ where: { transaction_id } });
}

// ── Best-effort audit log for API-key failures ───────────────────────────────
async function logApiKeyFailure(transaction_id, ip) {
  if (!transaction_id) return;
  try {
    await prisma.integrationLog.upsert({
      where:  { transaction_id },
      update: {},
      create: {
        transaction_id,
        payload:       { attempted_by: ip },
        status:        'FAILED',
        error_message: 'Invalid API Key',
      },
    });
  } catch (err) {
    console.error('[integration] Could not write API-key failure log:', err.message);
  }
}

// ── Best-effort audit log for whitelist failures ─────────────────────────────
async function logWhitelistFailure(transaction_id, unauthorizedFields) {
  if (!transaction_id) return;
  try {
    await prisma.integrationLog.upsert({
      where:  { transaction_id },
      update: {},
      create: {
        transaction_id,
        payload:       { unauthorized_fields: unauthorizedFields },
        status:        'FAILED',
        error_message: `Payload contains unauthorized fields: ${unauthorizedFields.join(', ')}`,
      },
    });
  } catch (err) {
    console.error('[integration] Could not write whitelist-failure log:', err.message);
  }
}

/**
 * processWebhook — executes the full ACID transaction.
 *
 * Returns a structured result object — NEVER throws for "clean" business
 * failures (agent not found, no campaign, rule fail, duplicate customer).
 * Only propagates genuine unexpected errors so the controller can call next(err).
 *
 * Possible outcomes:
 *   { outcome: 'SUCCESS',           referral, agent, campaign }
 *   { outcome: 'AGENT_404' }
 *   { outcome: 'NO_CAMPAIGN' }
 *   { outcome: 'RULE_FAILED',       failedRule }
 *   { outcome: 'DUPLICATE_CUSTOMER' }
 *   { outcome: 'DUPLICATE_TID' }   ← race condition
 */
async function processWebhook({
  transaction_id, customer_name, customer_phone,
  referral_code, account_type, deposit_amount,
}) {
  try {
    return await prisma.$transaction(async (tx) => {

      // 3a: Create audit log entry (status = RECEIVED)
      const log = await tx.integrationLog.create({
        data: {
          transaction_id,
          payload: { customer_name, customer_phone, referral_code, account_type, deposit_amount },
          status: 'RECEIVED',
        },
      });

      // 3b: Look up the agent by referral_code
      const agent = await tx.agent.findFirst({
        where:  { referral_code, status: 'APPROVED' },
        select: { id: true, name: true, referral_code: true },
      });

      if (!agent) {
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: 'Invalid referral code: no approved agent found.' },
        });
        return { outcome: 'AGENT_404' };
      }

      // 3c: Find the currently active campaign
      const now = new Date();
      const campaign = await tx.campaign.findFirst({
        where: {
          status: 'ACTIVE', is_active: true,
          start_date: { lte: now }, end_date: { gte: now },
        },
        orderBy: { start_date: 'desc' },
        select:  { id: true, name: true, reward_type: true, reward_value: true },
      });

      if (!campaign) {
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: 'No active campaign found for the current date.' },
        });
        return { outcome: 'NO_CAMPAIGN' };
      }

      // 3d: Evaluate campaign qualification rules
      const customer_data = { account_type, deposit_amount, customer_name, customer_phone };
      const ruleResult = await evaluateRules(campaign.id, customer_data, tx);

      if (!ruleResult.passed) {
        const reason = `Customer did not meet campaign rules: ${ruleResult.failedRule}`;
        console.log(`[integration] Rule FAILED for txn=${transaction_id}: ${ruleResult.failedRule}`);
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: reason },
        });
        return { outcome: 'RULE_FAILED', failedRule: ruleResult.failedRule };
      }

      // 3e: Duplicate customer check (application-level, no UNIQUE constraint)
      const duplicateReferral = await tx.referral.findFirst({
        where: {
          customer_phone,
          campaign_id: campaign.id,
          status: { in: ['PENDING', 'SUCCESSFUL'] },
        },
        select: { id: true },
      });

      if (duplicateReferral) {
        const dupMsg = 'This customer has already been referred for this campaign.';
        console.log(
          `[integration] Duplicate customer blocked: phone=${customer_phone}, ` +
          `campaign_id=${campaign.id}, txn=${transaction_id}`
        );
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: dupMsg },
        });
        return { outcome: 'DUPLICATE_CUSTOMER' };
      }

      // 3f: Create the referral (V7: auto-SUCCESSFUL, rule engine IS the gate)
      const referral = await tx.referral.create({
        data: {
          agent_id: agent.id, customer_name, customer_phone,
          campaign_id: campaign.id, status: 'SUCCESSFUL',
        },
        select: {
          id: true, agent_id: true, customer_name: true,
          customer_phone: true, campaign_id: true, status: true, created_at: true,
        },
      });

      // 3g: Mark log as PROCESSED
      await tx.integrationLog.update({
        where: { id: log.id },
        data:  { status: 'PROCESSED' },
      });

      console.log(
        `[integration] Referral SUCCESSFUL: agent=${agent.name} (id=${agent.id}), ` +
        `customer=${customer_name}, campaign="${campaign.name}", referral_id=${referral.id}`
      );

      return { outcome: 'SUCCESS', referral, agent, campaign };
    });

  } catch (err) {
    // Race condition: idempotency check passed but concurrent request inserted same txn_id
    if (err.code === 'P2002' && err.meta?.target?.includes?.('transaction_id')) {
      return { outcome: 'DUPLICATE_TID' };
    }
    throw err; // propagate genuine unexpected errors to the controller
  }
}

// ── Admin audit log ────────────────────────────────────────────────────────────
async function listIntegrationLogs(page, limit) {
  const skip = (page - 1) * limit;
  const [total, rows] = await prisma.$transaction([
    prisma.integrationLog.count(),
    prisma.integrationLog.findMany({
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      select: {
        id: true, transaction_id: true, payload: true,
        status: true, error_message: true, created_at: true,
      },
    }),
  ]);
  return { total: Number(total), page, limit, logs: rows };
}

module.exports = {
  ALLOWED_FIELDS,
  findExistingLog,
  logApiKeyFailure,
  logWhitelistFailure,
  processWebhook,
  listIntegrationLogs,
};
