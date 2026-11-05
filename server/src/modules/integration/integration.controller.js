/**
 * src/modules/integration/integration.controller.js
 * ────────────────────────────────────────────────────
 * HTTP layer for the Temenos webhook and audit-log endpoints.
 * Enforces API-key auth (via router middleware), payload whitelist,
 * and maps service outcomes to HTTP responses.
 * All DB/transaction logic lives in integration.service.js.
 */

'use strict';

const svc = require('./integration.service');

// ── POST /api/integration/account-opened ─────────────────────────────────────
async function accountOpened(req, res, next) {
  // ── Payload whitelist check ───────────────────────────────────────────────
  const unauthorizedFields = Object.keys(req.body).filter(k => !svc.ALLOWED_FIELDS.has(k));
  if (unauthorizedFields.length > 0) {
    console.warn(`[integration] Whitelist violation — unauthorized fields: [${unauthorizedFields.join(', ')}]`);
    const tid = typeof req.body.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim() : null;
    await svc.logWhitelistFailure(tid, unauthorizedFields);
    return res.status(400).json({
      error: `Payload contains unauthorized fields: ${unauthorizedFields.join(', ')}.`,
      code:  'UNAUTHORIZED_FIELDS',
    });
  }

  // ── Required-field validation ─────────────────────────────────────────────
  const { transaction_id, customer_name, customer_phone, referral_code, account_type, deposit_amount } = req.body;

  const missing = [];
  if (!transaction_id)  missing.push('transaction_id');
  if (!customer_name)   missing.push('customer_name');
  if (!customer_phone)  missing.push('customer_phone');
  if (!referral_code)   missing.push('referral_code');
  if (!account_type)    missing.push('account_type');
  if (deposit_amount === undefined || deposit_amount === null) missing.push('deposit_amount');

  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.`, code: 'MISSING_FIELDS' });
  }
  if (typeof deposit_amount !== 'number' || deposit_amount < 0) {
    return res.status(400).json({ error: 'deposit_amount must be a non-negative number.', code: 'INVALID_DEPOSIT_AMOUNT' });
  }

  // ── Idempotency pre-check ─────────────────────────────────────────────────
  const existingLog = await svc.findExistingLog(transaction_id);
  if (existingLog) {
    console.log(`[integration] Duplicate event ignored: transaction_id=${transaction_id}`);
    return res.status(200).json({ message: 'Already processed', transaction_id });
  }

  // ── Execute ACID transaction ──────────────────────────────────────────────
  let txResult;
  try {
    txResult = await svc.processWebhook({
      transaction_id, customer_name, customer_phone, referral_code, account_type, deposit_amount,
    });
  } catch (err) {
    console.error(`[integration] Transaction rolled back for txn=${transaction_id}:`, err.message);
    return next(err);
  }

  // ── Map outcome → HTTP response ───────────────────────────────────────────
  switch (txResult.outcome) {
    case 'DUPLICATE_TID':
      return res.status(200).json({ message: 'Already processed', transaction_id });

    case 'AGENT_404':
      return res.status(404).json({
        error: `No approved agent found with referral_code '${referral_code}'.`,
        code:  'AGENT_NOT_FOUND',
      });

    case 'NO_CAMPAIGN':
      return res.status(400).json({
        error: 'No active campaign is currently running. Referral cannot be recorded.',
        code:  'NO_ACTIVE_CAMPAIGN',
      });

    case 'RULE_FAILED':
      // 202 — event was valid, customer just didn't qualify. Prevents Temenos retries.
      return res.status(202).json({
        message:      'Event received. Customer did not meet campaign qualification rules.',
        transaction_id,
        disqualified: true,
        reason:       txResult.failedRule,
      });

    case 'DUPLICATE_CUSTOMER':
      return res.status(409).json({
        error: 'This customer has already been referred for this campaign.',
        code:  'DUPLICATE_CUSTOMER',
      });

    case 'SUCCESS':
    default:
      return res.status(202).json({
        message:     'Referral recorded and automatically qualified.',
        referral_id: txResult.referral.id,
        agent:       txResult.agent.name,
        campaign:    txResult.campaign.name,
      });
  }
}

// ── GET /api/integration/logs  (ADMIN) ───────────────────────────────────────
async function getLogs(req, res, next) {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await svc.listIntegrationLogs(page, limit);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/integration/logs] Prisma error:', err.message);
    next(err);
  }
}

module.exports = { accountOpened, getLogs };
