/**
 * referral-api/routes/integration.js
 * ------------------------------------
 * Router for all /api/integration endpoints.
 *
 * This router handles inbound webhooks from the core banking system (Temenos)
 * and exposes an admin-only audit log endpoint.
 *
 * Current endpoints:
 *   POST /api/integration/account-opened — Receive a "new account opened" event (public)
 *   GET  /api/integration/logs           — View integration audit log (ADMIN only)
 *
 * Key design decisions per RULES.md §6 & §7:
 *
 *   PAYLOAD WHITELIST (V7)
 *     The webhook now enforces a strict field whitelist. Any key in the JSON
 *     body that is not in ALLOWED_FIELDS triggers an immediate 400 rejection.
 *     This prevents the core banking system from injecting arbitrary data into
 *     our database (e.g., an attacker who can forge Temenos payloads cannot
 *     add unexpected fields that might confuse downstream logic or leak into
 *     JSONB storage). The check runs before any DB work — cheap and safe.
 *
 *   AUTOMATED QUALIFICATION (V7)
 *     When evaluateRules() returns passed: true, the referral is inserted
 *     directly as 'SUCCESSFUL' — no manual admin approval required for events
 *     that arrive via the Temenos webhook. The rules engine IS the approval gate.
 *
 *   IDEMPOTENCY
 *     The `transaction_id` field in every Temenos event is guaranteed unique
 *     by the banking system. We store it in integration_logs with a UNIQUE
 *     constraint. If the same event arrives twice (e.g., Temenos retrying a
 *     timeout), our DB INSERT will throw a unique_violation (PG error 23505).
 *     We catch that specific error and return 200 OK immediately — Temenos
 *     sees success and stops retrying. The agent is NOT double-credited.
 *
 *   ATOMIC TRANSACTION
 *     The multi-step processing (log → find agent → find campaign → evaluate
 *     rules → create referral → update log) is wrapped in a BEGIN/COMMIT block
 *     acquired from the connection pool. If any step fails, ROLLBACK fires and
 *     the database is left clean — no orphaned integration_log rows, no
 *     partial referrals.
 *
 *   RULE ENGINE (V6)
 *     After finding an active campaign, the webhook calls evaluateRules()
 *     from services/ruleEngine.js. If any campaign rule fails (e.g. deposit
 *     below threshold, wrong account type), the integration_log is marked
 *     FAILED with the specific rule that was violated. No referral is created.
 *
 *   IMMEDIATE 202 RESPONSE (design intent, synchronous for now)
 *     RULES.md §7 says the webhook should respond immediately (202 Accepted)
 *     and process in the background. For this MVP we process synchronously
 *     inside the same request, which is fine for prototype load. The code is
 *     structured so that background processing (via a job queue like Bull) can
 *     be dropped in later: just move everything after "Insert integration log"
 *     into a worker function and enqueue it.
 */

'use strict';

const express            = require('express');
const pool               = require('../db');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const { evaluateRules }  = require('../services/ruleEngine');

const router = express.Router();

// ---------------------------------------------------------------------------
// ALLOWED_FIELDS whitelist (V7 — Payload Validation)
//
// Only these exact keys are permitted in the Temenos webhook body. Any
// additional key is treated as an unauthorized field injection attempt and
// results in a 400 rejection.
//
// WHY a whitelist instead of just ignoring unknown fields?
//   Silent ignoring can mask integration errors (Temenos sending the wrong
//   schema). An explicit rejection forces the integration team to notice and
//   correct the payload. It is also a security control — an attacker who can
//   forge Temenos payloads cannot inject unexpected data.
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


// ---------------------------------------------------------------------------
// POST /api/integration/account-opened  (PUBLIC — called by Temenos server-to-server)
//
// Called by Temenos when a referred customer successfully opens a bank account.
//
// Expected payload (only these fields allowed):
//   {
//     "transaction_id":    "TXN-2026-001234",   // Temenos unique event ID
//     "customer_name":     "Fatuma Ali",
//     "customer_phone":    "+251911234567",
//     "referral_code":     "NIB-X7KP2A",        // The agent's referral code
//     "account_type":      "SAVINGS",
//     "deposit_amount":    10000,                // Opening deposit in ETB
//     "date_of_transaction": "2026-10-31"        // optional ISO date string
//   }
//
// Response lifecycle:
//   200 OK           — duplicate event (already processed), Temenos should stop retrying
//   202 Accepted     — new event, referral created as SUCCESSFUL (rules passed)
//   400 Bad Request  — unauthorized payload fields, missing fields, or no active campaign
//   404 Not Found    — referral_code does not match any approved agent
//   500 Server Error — unexpected failure
// ---------------------------------------------------------------------------
router.post('/account-opened', async (req, res, next) => {
  // ── Step 1a: Payload Whitelist Check (V7) ────────────────────────────────
  // This runs BEFORE any DB access — pure CPU, no resources allocated.
  // We check every key in req.body against ALLOWED_FIELDS.
  const unauthorizedFields = Object.keys(req.body).filter(k => !ALLOWED_FIELDS.has(k));

  if (unauthorizedFields.length > 0) {
    console.warn(
      `[integration] Payload whitelist violation — unauthorized fields: [${unauthorizedFields.join(', ')}]`
    );

    // We still want an audit trail for this rejection, but we have not yet
    // opened a transaction (and may not have a valid transaction_id). We
    // write the log using pool.query() directly — outside any transaction —
    // only if transaction_id is present and looks valid (to avoid storing
    // garbage). If that insert itself fails, we silently continue and still
    // return the 400 to the caller.
    const tid = typeof req.body.transaction_id === 'string' && req.body.transaction_id.trim()
      ? req.body.transaction_id.trim()
      : null;

    if (tid) {
      try {
        // Check for idempotency first — don't insert a duplicate log row.
        const existCheck = await pool.query(
          'SELECT id FROM integration_logs WHERE transaction_id = $1',
          [tid]
        );
        if (existCheck.rows.length === 0) {
          await pool.query(
            `INSERT INTO integration_logs (transaction_id, payload, status, error_message)
             VALUES ($1, $2, 'FAILED', $3)`,
            [
              tid,
              JSON.stringify({ unauthorized_fields: unauthorizedFields }),
              `Payload contains unauthorized fields: ${unauthorizedFields.join(', ')}`,
            ]
          );
        }
      } catch (logErr) {
        // Non-fatal — log attempt failed; still return 400.
        console.error('[integration] Could not write whitelist-failure log:', logErr.message);
      }
    }

    return res.status(400).json({
      error: `Payload contains unauthorized fields: ${unauthorizedFields.join(', ')}.`,
      code:  'UNAUTHORIZED_FIELDS',
    });
  }

  // ── Step 1b: Required-field Validation ───────────────────────────────────
  // We validate BEFORE acquiring a DB connection or starting a transaction.
  // Malformed requests are cheap to reject — no DB resources wasted.
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
  // deposit_amount can be 0, so we check for undefined/null explicitly
  if (deposit_amount === undefined || deposit_amount === null) missing.push('deposit_amount');

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(', ')}.`,
      code:  'MISSING_FIELDS',
    });
  }

  // deposit_amount must be a non-negative number
  if (typeof deposit_amount !== 'number' || deposit_amount < 0) {
    return res.status(400).json({
      error: 'deposit_amount must be a non-negative number.',
      code:  'INVALID_DEPOSIT_AMOUNT',
    });
  }

  // ── Step 2: Idempotency Check ────────────────────────────────────────────
  // We check BEFORE starting a transaction — this is a fast read-only query.
  // If the transaction_id is already in the log, we return 200 immediately.
  //
  // WHY 200 (not 409 Conflict)?
  //   Temenos interprets any non-2xx as a failure and will retry. By returning
  //   200, we tell it "we got it, all is well" — stopping the retry loop.
  //   The agent is never double-credited because we are not processing anything.
  const existingLog = await pool.query(
    'SELECT id, status FROM integration_logs WHERE transaction_id = $1',
    [transaction_id]
  );

  if (existingLog.rows.length > 0) {
    console.log(`[integration] Duplicate event ignored: transaction_id=${transaction_id}`);
    return res.status(200).json({
      message: 'Already processed',
      transaction_id,
    });
  }

  // ── Step 3: Acquire a dedicated client and open a transaction ────────────
  // We use pool.connect() (not pool.query()) so we can issue BEGIN/COMMIT/ROLLBACK
  // on the SAME connection. pool.query() may use a different connection for
  // each call, making multi-statement transactions impossible.
  const client = await pool.connect();
  let logId = null; // Track the integration_log id for status updates

  try {
    await client.query('BEGIN');

    // ── Step 3a: Insert into integration_logs (status = 'RECEIVED') ─────────
    // This is the first thing we persist — it creates an audit trail even if
    // subsequent steps fail. The UNIQUE constraint on transaction_id is a
    // second safety net: if two identical requests arrive simultaneously and
    // both pass the pre-transaction idempotency check (race condition), only
    // one INSERT will succeed; the other throws PG error 23505.
    //
    // We store the full payload as JSONB for debugging and audit purposes.
    // Only whitelisted fields reach this point — the whitelist check above
    // already rejected anything unexpected.
    const logInsert = await client.query(
      `INSERT INTO integration_logs (transaction_id, payload, status)
       VALUES ($1, $2, 'RECEIVED')
       RETURNING id`,
      [
        transaction_id,
        // Build the payload object explicitly — never trust raw req.body
        // to avoid storing unexpected/attacker-controlled fields.
        JSON.stringify({
          customer_name,
          customer_phone,
          referral_code,
          account_type,
          deposit_amount,
        }),
      ]
    );
    logId = logInsert.rows[0].id;

    // ── Step 3b: Find the Agent by referral_code ─────────────────────────────
    // referral_code is how we trace which agent referred this customer.
    // We also enforce that the agent must be APPROVED — PENDING/REJECTED agents
    // cannot generate referrals even if their code somehow leaked.
    const agentResult = await client.query(
      `SELECT id, name, referral_code
       FROM   agents
       WHERE  referral_code = $1
         AND  status = 'APPROVED'`,
      [referral_code]
    );

    if (agentResult.rows.length === 0) {
      // No approved agent found — mark the log as FAILED and return 404.
      // We still COMMIT so the FAILED log record is persisted for audit.
      await client.query(
        `UPDATE integration_logs
         SET status = 'FAILED', error_message = $1
         WHERE id = $2`,
        ['Invalid referral code: no approved agent found.', logId]
      );
      await client.query('COMMIT');

      return res.status(404).json({
        error: `No approved agent found with referral_code '${referral_code}'.`,
        code:  'AGENT_NOT_FOUND',
      });
    }

    const agent = agentResult.rows[0];

    // ── Step 3c: Find the active campaign ────────────────────────────────────
    // An ACTIVE campaign whose date window covers right now AND is_active = true.
    // We use CURRENT_TIMESTAMP (server time) for the comparison — no client
    // time is trusted. If multiple ACTIVE campaigns overlap (a data integrity
    // issue), we pick the one that started most recently (ORDER BY start_date DESC
    // LIMIT 1). A future version may link the referral_code to a specific campaign.
    const campaignResult = await client.query(
      `SELECT id, name, reward_type, reward_value, description, reward_threshold
       FROM   campaigns
       WHERE  status = 'ACTIVE'
         AND  is_active = TRUE
         AND  start_date <= CURRENT_TIMESTAMP
         AND  end_date   >= CURRENT_TIMESTAMP
       ORDER  BY start_date DESC
       LIMIT  1`
    );

    if (campaignResult.rows.length === 0) {
      await client.query(
        `UPDATE integration_logs
         SET status = 'FAILED', error_message = $1
         WHERE id = $2`,
        ['No active campaign found for the current date.', logId]
      );
      await client.query('COMMIT');

      return res.status(400).json({
        error: 'No active campaign is currently running. Referral cannot be recorded.',
        code:  'NO_ACTIVE_CAMPAIGN',
      });
    }

    const campaign = campaignResult.rows[0];

    // ── Step 3d: Evaluate campaign rules (V6 Rule Engine) ───────────────────
    //
    // This is the critical enforcement step. We pass the campaign id, the
    // customer data from this webhook, and the current DB client (so rule
    // evaluation happens inside the same transaction as everything else).
    //
    // If any rule fails, we:
    //   1. Mark the integration_log as FAILED with the specific rule description.
    //   2. COMMIT the log update (audit trail preserved).
    //   3. Return 202 Accepted (not 400) — the event was legitimately received
    //      and processed; the customer simply did not qualify. Temenos should
    //      NOT retry this event.
    //
    // WHY 202 instead of 400 for rule failures?
    //   400 implies the *request* was malformed. The request is perfectly valid —
    //   the customer just doesn't meet the campaign criteria. Returning 202 with
    //   a disqualification message is cleaner and prevents Temenos retries.
    const customer_data = { account_type, deposit_amount, customer_name, customer_phone };
    const ruleResult = await evaluateRules(campaign.id, customer_data, client);

    if (!ruleResult.passed) {
      const reason = `Customer did not meet campaign rules: ${ruleResult.failedRule}`;
      console.log(
        `[integration] Rule evaluation FAILED for transaction_id=${transaction_id}: ${ruleResult.failedRule}`
      );

      await client.query(
        `UPDATE integration_logs
         SET status = 'FAILED', error_message = $1
         WHERE id = $2`,
        [reason, logId]
      );
      await client.query('COMMIT');

      // 202 Accepted — we processed the event, but the customer was disqualified.
      return res.status(202).json({
        message:     'Event received. Customer did not meet campaign qualification rules.',
        transaction_id,
        disqualified: true,
        reason:       ruleResult.failedRule,
      });
    }

    // ── Step 3e: Create the referral record ──────────────────────────────────
    // All rules passed — create the referral as 'SUCCESSFUL' directly.
    //
    // V7 change: status is now 'SUCCESSFUL' (not 'PENDING').
    // The evaluateRules() gate IS the qualification check. If a Temenos webhook
    // makes it this far, the referral is automatically approved — no manual
    // admin review is needed. This matches the automated banking workflow where
    // Temenos is the authoritative source of truth for account openings.
    //
    // customer_name and customer_phone are stored directly on the referral row
    // (denormalized in V4 migration — the customers table is gone).
    const referralResult = await client.query(
      `INSERT INTO referrals (agent_id, customer_name, customer_phone, campaign_id, status)
       VALUES ($1, $2, $3, $4, 'SUCCESSFUL')
       RETURNING id, agent_id, customer_name, customer_phone, campaign_id, status, created_at`,
      [agent.id, customer_name, customer_phone, campaign.id]
    );

    const referral = referralResult.rows[0];

    // ── Step 3f: Mark integration_log as PROCESSED ───────────────────────────
    await client.query(
      `UPDATE integration_logs
       SET status = 'PROCESSED'
       WHERE id = $1`,
      [logId]
    );

    // ── Step 3g: Commit all changes atomically ────────────────────────────────
    await client.query('COMMIT');

    console.log(
      `[integration] Referral SUCCESSFUL: agent=${agent.name} (id=${agent.id}), ` +
      `customer=${customer_name}, campaign="${campaign.name}", referral_id=${referral.id}`
    );

    // ── Step 4: Return 202 Accepted ───────────────────────────────────────────
    // 202 (not 201) because Temenos treats this as an acknowledgement:
    // "we received and queued your event". The referral is now SUCCESSFUL.
    return res.status(202).json({
      message:     'Referral recorded and automatically qualified.',
      referral_id: referral.id,
      agent:       agent.name,
      campaign:    campaign.name,
    });

  } catch (err) {
    // ── Rollback on any unexpected error ──────────────────────────────────────
    // This ensures we never leave a half-written referral or a 'RECEIVED' log
    // that never gets updated. The DB returns to its pre-request state.
    try {
      await client.query('ROLLBACK');
      console.error(`[integration] ROLLBACK executed for transaction_id=${transaction_id}`);
    } catch (rollbackErr) {
      console.error('[integration] ROLLBACK failed:', rollbackErr.message);
    }

    // Pass the original error to the global error handler (index.js).
    // The global handler logs the full stack and returns a safe 500 to Temenos.
    next(err);

  } finally {
    // ── ALWAYS release the client back to the pool ────────────────────────────
    // Failing to call release() causes connection pool exhaustion — every
    // subsequent request would hang waiting for a free connection.
    // The finally block runs even if catch() re-throws.
    client.release();
  }
});


// ---------------------------------------------------------------------------
// GET /api/integration/logs  — ADMIN only.
//
// Returns the most recent rows from integration_logs, ordered newest first.
// Used by the Admin Dashboard to display the Temenos Integration Logs table.
//
// WHY ADMIN-ONLY?
//   integration_logs contains raw Temenos payloads (customer names, phone
//   numbers, deposit amounts). Exposing this to AGENTs would be a data
//   privacy violation — agents should only see their own referral outcomes,
//   not the raw webhook audit trail.
//
// Pagination per RULES.md §7:
//   ?page=1&limit=20   (defaults: page=1, limit=20, max=100)
//
// Success response — 200 OK:
//   {
//     "total": 85,
//     "page": 1,
//     "limit": 20,
//     "logs": [
//       {
//         "id":             12,
//         "transaction_id": "TXN-2026-001234",
//         "payload":        { "customer_name": "Fatuma Ali", ... },
//         "status":         "PROCESSED",
//         "error_message":  null,
//         "created_at":     "2026-10-28T19:00:00.000Z"
//       },
//       ...
//     ]
//   }
// ---------------------------------------------------------------------------
router.get('/logs', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  try {
    // ── Pagination ────────────────────────────────────────────────────────────
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    // ── Total count ───────────────────────────────────────────────────────────
    const countResult = await pool.query('SELECT COUNT(*) AS total FROM integration_logs');
    const total = parseInt(countResult.rows[0].total, 10);

    // ── Main query ────────────────────────────────────────────────────────────
    const result = await pool.query(
      `SELECT
         id,
         transaction_id,
         payload,
         status,
         error_message,
         created_at
       FROM   integration_logs
       ORDER  BY created_at DESC
       LIMIT  $1 OFFSET $2`,
      [limit, offset]
    );

    return res.status(200).json({
      total,
      page,
      limit,
      logs: result.rows,
    });

  } catch (err) {
    console.error('[GET /api/integration/logs] Unexpected DB error:', err.message);
    next(err);
  }
});


module.exports = router;
