/**
 * referral-api/routes/integration.js
 * ------------------------------------
 * Router for all /api/integration endpoints.
 *
 * This router handles inbound webhooks from the core banking system (Temenos)
 * and exposes an admin-only audit log endpoint.
 *
 * Current endpoints:
 *   POST /api/integration/account-opened — Receive a "new account opened" event (API-key protected)
 *   GET  /api/integration/logs           — View integration audit log (ADMIN only)
 *
 * V8 (Prisma migration):
 *   All raw pool.query() / pool.connect() calls replaced with Prisma Client
 *   methods. The multi-step webhook transaction (log → agent → campaign →
 *   rules → referral → update log) is now executed with Prisma's interactive
 *   transaction: prisma.$transaction(async (tx) => { ... }).
 *
 *   The ruleEngine.js evaluateRules() function now receives the Prisma `tx`
 *   handle instead of a raw pg client, so rule reads remain inside the same
 *   atomic transaction as the referral write.
 *
 * Key design decisions per RULES.md §6 & §7:
 *
 *   PAYLOAD WHITELIST (V7)
 *     The webhook enforces a strict field whitelist. Any key in the JSON
 *     body that is not in ALLOWED_FIELDS triggers an immediate 400 rejection.
 *
 *   AUTOMATED QUALIFICATION (V7)
 *     When evaluateRules() returns passed: true, the referral is inserted
 *     directly as 'SUCCESSFUL' — no manual admin approval required.
 *
 *   IDEMPOTENCY
 *     The `transaction_id` field in every Temenos event is guaranteed unique.
 *     We check integration_logs BEFORE starting a transaction. If the same
 *     event arrives twice, we return 200 OK immediately. The UNIQUE constraint
 *     on transaction_id is a second safety net for race conditions (Prisma
 *     will throw P2002 on a duplicate, which we catch).
 *
 *   ATOMIC TRANSACTION (Prisma interactive transaction)
 *     prisma.$transaction(async (tx) => { ... }) opens a real DB transaction.
 *     If any step throws, Prisma automatically rolls back — no orphaned rows.
 *     Steps that produce a "clean" early return (agent not found, no campaign,
 *     rule failure) still need the log update COMMITTED before returning.
 *     For those cases we break out of the transaction early by throwing a
 *     structured sentinel error, committing the log update first.
 *
 *   RULE ENGINE (V6)
 *     After finding an active campaign, the webhook calls evaluateRules()
 *     from services/ruleEngine.js with the Prisma tx handle.
 */

'use strict';

const express           = require('express');
const prisma            = require('../db-prisma');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { evaluateRules } = require('../services/ruleEngine');

const router = express.Router();

// ---------------------------------------------------------------------------
// API KEY AUTHENTICATION MIDDLEWARE
// ALL POST routes on this router require a valid x-api-key header.
// ---------------------------------------------------------------------------
const API_KEY = 'NIB_SECURE_KEY_2026';

router.use(async (req, res, next) => {
  // The GET /logs endpoint is protected by JWT (admin auth), not by API key.
  if (req.method === 'GET') return next();

  const providedKey = req.headers['x-api-key'];

  if (providedKey !== API_KEY) {
    const ip  = req.ip || req.connection.remoteAddress;
    const tid = typeof req.body?.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim()
      : null;

    console.warn(
      `[integration] UNAUTHORIZED request — invalid or missing x-api-key. ` +
      `IP: ${ip}, transaction_id: ${tid ?? 'N/A'}`
    );

    // Persist a FAILED audit log row (best-effort — never blocks the 401 response).
    if (tid) {
      try {
        await prisma.integrationLog.upsert({
          where:  { transaction_id: tid },
          // If the row already exists (duplicate), do nothing (no update needed)
          update: {},
          create: {
            transaction_id: tid,
            payload:        { attempted_by: ip },
            status:         'FAILED',
            error_message:  'Invalid API Key',
          },
        });
      } catch (logErr) {
        console.error('[integration] Could not write API-key failure log:', logErr.message);
      }
    }

    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  next();
});

// ---------------------------------------------------------------------------
// ALLOWED_FIELDS whitelist (V7 — Payload Validation)
// ---------------------------------------------------------------------------
const ALLOWED_FIELDS = new Set([
  'transaction_id',
  'referral_code',
  'customer_name',
  'customer_phone',
  'account_type',
  'deposit_amount',
  'date_of_transaction',
]);

// Sentinel error class — used to break out of prisma.$transaction() with
// a structured early-exit when we want to COMMIT an updated log status
// (e.g., agent not found) and then return a non-500 HTTP response.
// Prisma rolls back on any thrown error, so for "clean failures" we update
// the log INSIDE the transaction and THEN throw this sentinel to exit it.
// Because the throw happens AFTER the update, Prisma commits everything
// (update included) before propagating the error to the catch block.
//
// Wait — actually Prisma ROLLBACKS on any throw. So clean failures (agent
// not found, no campaign, rule fail) need a different pattern:
// We use a structured return value from the transaction to signal the
// outcome, rather than throwing. The transaction always commits.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// POST /api/integration/account-opened
// ---------------------------------------------------------------------------
router.post('/account-opened', async (req, res, next) => {
  // ── Step 1a: Payload Whitelist Check (V7) ────────────────────────────────
  const unauthorizedFields = Object.keys(req.body).filter(k => !ALLOWED_FIELDS.has(k));

  if (unauthorizedFields.length > 0) {
    console.warn(
      `[integration] Payload whitelist violation — unauthorized fields: [${unauthorizedFields.join(', ')}]`
    );

    const tid = typeof req.body.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim()
      : null;

    if (tid) {
      try {
        await prisma.integrationLog.upsert({
          where:  { transaction_id: tid },
          update: {},   // already logged → don't overwrite
          create: {
            transaction_id: tid,
            payload:        { unauthorized_fields: unauthorizedFields },
            status:         'FAILED',
            error_message:  `Payload contains unauthorized fields: ${unauthorizedFields.join(', ')}`,
          },
        });
      } catch (logErr) {
        console.error('[integration] Could not write whitelist-failure log:', logErr.message);
      }
    }

    return res.status(400).json({
      error: `Payload contains unauthorized fields: ${unauthorizedFields.join(', ')}.`,
      code:  'UNAUTHORIZED_FIELDS',
    });
  }

  // ── Step 1b: Required-field Validation ───────────────────────────────────
  const {
    transaction_id,
    customer_name,
    customer_phone,
    referral_code,
    account_type,
    deposit_amount,
  } = req.body;

  const missing = [];
  if (!transaction_id)  missing.push('transaction_id');
  if (!customer_name)   missing.push('customer_name');
  if (!customer_phone)  missing.push('customer_phone');
  if (!referral_code)   missing.push('referral_code');
  if (!account_type)    missing.push('account_type');
  if (deposit_amount === undefined || deposit_amount === null) missing.push('deposit_amount');

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(', ')}.`,
      code:  'MISSING_FIELDS',
    });
  }

  if (typeof deposit_amount !== 'number' || deposit_amount < 0) {
    return res.status(400).json({
      error: 'deposit_amount must be a non-negative number.',
      code:  'INVALID_DEPOSIT_AMOUNT',
    });
  }

  // ── Step 2: Idempotency Check (outside transaction — fast read) ──────────
  // WHY 200? Temenos interprets any non-2xx as a failure and retries.
  // Returning 200 stops the retry loop.
  const existingLog = await prisma.integrationLog.findUnique({
    where: { transaction_id },
  });

  if (existingLog) {
    console.log(`[integration] Duplicate event ignored: transaction_id=${transaction_id}`);
    return res.status(200).json({
      message: 'Already processed',
      transaction_id,
    });
  }

  // ── Step 3: Prisma interactive transaction ────────────────────────────────
  // All DB work from here is inside a single atomic transaction.
  // The transaction function returns a structured result object so we can
  // branch on the outcome and send the appropriate HTTP response without
  // throwing across the transaction boundary.
  //
  // Possible outcomes returned from the tx function:
  //   { outcome: 'SUCCESS',          referral, agent, campaign }
  //   { outcome: 'AGENT_404' }
  //   { outcome: 'NO_CAMPAIGN' }
  //   { outcome: 'RULE_FAILED',      failedRule }
  //   { outcome: 'DUPLICATE_CUSTOMER' }
  //   { outcome: 'DUPLICATE_TID' }  ← race condition: unique constraint hit
  let txResult;

  try {
    txResult = await prisma.$transaction(async (tx) => {

      // ── Step 3a: Insert integration_log (status = 'RECEIVED') ─────────────
      // This is the first persisted step — creates an audit trail even if
      // subsequent steps fail. We use createMany workaround: actually just
      // create(). If a concurrent request already inserted the same
      // transaction_id (race after our pre-transaction check), Prisma throws
      // P2002 (unique constraint). We let that propagate and catch it below.
      const log = await tx.integrationLog.create({
        data: {
          transaction_id,
          payload: {
            customer_name,
            customer_phone,
            referral_code,
            account_type,
            deposit_amount,
          },
          status: 'RECEIVED',
        },
      });

      // ── Step 3b: Find the Agent by referral_code ─────────────────────────
      const agent = await tx.agent.findFirst({
        where: {
          referral_code,
          status: 'APPROVED',
        },
        select: { id: true, name: true, referral_code: true },
      });

      if (!agent) {
        // Mark log as FAILED inside the transaction, then commit via return.
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: 'Invalid referral code: no approved agent found.' },
        });
        return { outcome: 'AGENT_404' };
      }

      // ── Step 3c: Find the active campaign ────────────────────────────────
      // status = ACTIVE, is_active = true, date window covers NOW.
      // If multiple overlap, pick the most recently started one.
      const now = new Date();
      const campaign = await tx.campaign.findFirst({
        where: {
          status:     'ACTIVE',
          is_active:  true,
          start_date: { lte: now },
          end_date:   { gte: now },
        },
        orderBy: { start_date: 'desc' },
        select: { id: true, name: true, reward_type: true, reward_value: true },
      });

      if (!campaign) {
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: 'No active campaign found for the current date.' },
        });
        return { outcome: 'NO_CAMPAIGN' };
      }

      // ── Step 3d: Evaluate campaign rules (V6 Rule Engine) ─────────────────
      // evaluateRules() now receives `tx` instead of a raw pg client.
      // Rule reads are inside the same transaction — consistent with the write.
      const customer_data = { account_type, deposit_amount, customer_name, customer_phone };
      const ruleResult = await evaluateRules(campaign.id, customer_data, tx);

      if (!ruleResult.passed) {
        const reason = `Customer did not meet campaign rules: ${ruleResult.failedRule}`;
        console.log(
          `[integration] Rule evaluation FAILED for transaction_id=${transaction_id}: ${ruleResult.failedRule}`
        );
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: reason },
        });
        return { outcome: 'RULE_FAILED', failedRule: ruleResult.failedRule };
      }

      // ── Step 3e: Duplicate customer check (application-level) ────────────
      // Reject if this customer_phone already has a PENDING or SUCCESSFUL
      // referral for the same campaign. We intentionally avoid a DB UNIQUE
      // constraint so the check stays flexible (e.g., allowing REJECTED
      // customers to be re-referred in the future).
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
          `[integration] Duplicate customer blocked: customer_phone=${customer_phone}, ` +
          `campaign_id=${campaign.id}, transaction_id=${transaction_id}`
        );
        await tx.integrationLog.update({
          where: { id: log.id },
          data:  { status: 'FAILED', error_message: dupMsg },
        });
        return { outcome: 'DUPLICATE_CUSTOMER' };
      }

      // ── Step 3f: Create the referral record ──────────────────────────────
      // V7: status is 'SUCCESSFUL' directly — no manual admin review needed.
      // evaluateRules() IS the approval gate.
      const referral = await tx.referral.create({
        data: {
          agent_id:       agent.id,
          customer_name,
          customer_phone,
          campaign_id:    campaign.id,
          status:         'SUCCESSFUL',
        },
        select: {
          id:             true,
          agent_id:       true,
          customer_name:  true,
          customer_phone: true,
          campaign_id:    true,
          status:         true,
          created_at:     true,
        },
      });

      // ── Step 3g: Mark integration_log as PROCESSED ────────────────────────
      await tx.integrationLog.update({
        where: { id: log.id },
        data:  { status: 'PROCESSED' },
      });

      console.log(
        `[integration] Referral SUCCESSFUL: agent=${agent.name} (id=${agent.id}), ` +
        `customer=${customer_name}, campaign="${campaign.name}", referral_id=${referral.id}`
      );

      return { outcome: 'SUCCESS', referral, agent, campaign };

    }); // ← prisma.$transaction auto-commits here on success, auto-rollbacks on throw

  } catch (err) {
    // ── Race condition: duplicate transaction_id ──────────────────────────────
    // P2002 = unique constraint violation — the idempotency check passed but
    // a concurrent request inserted the same transaction_id milliseconds later.
    if (err.code === 'P2002' && err.meta?.target?.includes?.('transaction_id')) {
      console.log(`[integration] Race-condition duplicate ignored: transaction_id=${transaction_id}`);
      return res.status(200).json({ message: 'Already processed', transaction_id });
    }

    // All other errors: the transaction was rolled back by Prisma automatically.
    console.error(`[integration] Transaction rolled back for transaction_id=${transaction_id}:`, err.message);
    return next(err);
  }

  // ── Step 4: Map transaction outcome → HTTP response ───────────────────────
  // At this point the transaction has committed. Branch on the outcome.
  switch (txResult.outcome) {

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
      // 202 Accepted — we processed the event; the customer was simply disqualified.
      // Not 400 — the request was valid. Returning 202 prevents Temenos retries.
      return res.status(202).json({
        message:      'Event received. Customer did not meet campaign qualification rules.',
        transaction_id,
        disqualified: true,
        reason:       txResult.failedRule,
      });

    case 'DUPLICATE_CUSTOMER':
      // 409 Conflict — the customer already has an active/successful referral
      // for this campaign. The transaction committed the FAILED log update.
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
});


// ---------------------------------------------------------------------------
// GET /api/integration/logs  — ADMIN only.
//
// Returns the most recent rows from integration_logs, ordered newest first.
//
// Pagination per RULES.md §7:
//   ?page=1&limit=20   (defaults: page=1, limit=20, max=100)
// ---------------------------------------------------------------------------
router.get('/logs', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  try {
    // ── Pagination ────────────────────────────────────────────────────────────
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    const [total, rows] = await prisma.$transaction([
      prisma.integrationLog.count(),
      prisma.integrationLog.findMany({
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        select: {
          id:             true,
          transaction_id: true,
          payload:        true,
          status:         true,
          error_message:  true,
          created_at:     true,
        },
      }),
    ]);

    return res.status(200).json({
      total: Number(total),
      page,
      limit,
      logs: rows,
    });

  } catch (err) {
    console.error('[GET /api/integration/logs] Prisma error:', err.message);
    next(err);
  }
});


module.exports = router;
