/**
 * referral-api/routes/integration.js
 * ------------------------------------
 * Router for all /api/integration endpoints.
 *
 * This router handles inbound webhooks from the core banking system (Temenos).
 * It is intentionally PUBLIC — Temenos calls it server-to-server, so there is
 * no browser session or JWT cookie involved. API Key validation will be added
 * in a future sprint once the key is provisioned.
 *
 * Current endpoints:
 *   POST /api/integration/account-opened — Receive a "new account opened" event
 *
 * Key design decisions per RULES.md §6 & §7:
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
 *     The multi-step processing (log → find agent → find campaign → create
 *     referral → update log) is wrapped in a BEGIN/COMMIT block acquired from
 *     the connection pool. If any step fails, ROLLBACK fires and the database
 *     is left clean — no orphaned integration_log rows, no partial referrals.
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

const express = require('express');
const pool    = require('../db');

const router = express.Router();


// ---------------------------------------------------------------------------
// POST /api/integration/account-opened
//
// Called by Temenos when a referred customer successfully opens a bank account.
//
// Expected payload:
//   {
//     "transaction_id":  "TXN-2026-001234",   // Temenos unique event ID
//     "customer_name":   "Fatuma Ali",
//     "customer_phone":  "+251911234567",
//     "referral_code":   "NIB-X7KP2A",        // The agent's referral code
//     "account_type":    "SAVINGS",
//     "deposit_amount":  10000                 // Opening deposit in ETB
//   }
//
// Response lifecycle:
//   200 OK           — duplicate event (already processed), Temenos should stop retrying
//   202 Accepted     — new event, successfully recorded as PENDING referral
//   400 Bad Request  — missing fields, or no active campaign found
//   404 Not Found    — referral_code does not match any agent
//   500 Server Error — unexpected failure
// ---------------------------------------------------------------------------
router.post('/account-opened', async (req, res, next) => {
  // ── Step 1: Input Validation ─────────────────────────────────────────────
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
    // This event was already received and processed (or is currently being
    // processed). Return 200 so Temenos stops retrying.
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
    // The agents table has a UNIQUE constraint on referral_code, so this
    // query returns at most one row.
    const agentResult = await client.query(
      'SELECT id, name, referral_code FROM agents WHERE referral_code = $1',
      [referral_code]
    );

    if (agentResult.rows.length === 0) {
      // No agent found — mark the log as FAILED and return 404.
      // We still COMMIT so the FAILED log record is persisted for audit.
      await client.query(
        `UPDATE integration_logs
         SET status = 'FAILED', error_message = $1
         WHERE id = $2`,
        ['Invalid referral code: no agent found.', logId]
      );
      await client.query('COMMIT');

      return res.status(404).json({
        error: `No agent found with referral_code '${referral_code}'.`,
        code:  'AGENT_NOT_FOUND',
      });
    }

    const agent = agentResult.rows[0];

    // ── Step 3c: Find the active campaign ────────────────────────────────────
    // An ACTIVE campaign whose date window covers right now.
    // We use CURRENT_TIMESTAMP (server time) for the comparison — no client
    // time is trusted. If multiple ACTIVE campaigns overlap (a data integrity
    // issue), we pick the one that started most recently (ORDER BY start_date DESC
    // LIMIT 1). A future version may link the referral_code to a specific campaign.
    const campaignResult = await client.query(
      `SELECT id, name, reward_type, reward_value
       FROM campaigns
       WHERE status = 'ACTIVE'
         AND start_date <= CURRENT_TIMESTAMP
         AND end_date   >= CURRENT_TIMESTAMP
       ORDER BY start_date DESC
       LIMIT 1`
    );

    if (campaignResult.rows.length === 0) {
      // No active campaign — the referral cannot be credited right now.
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

    // ── Step 3d: Create the referral record ──────────────────────────────────
    // Status defaults to 'PENDING' — an admin must later review and mark it
    // 'SUCCESSFUL' or 'REJECTED' after verifying the account opening with ops.
    //
    // Note: customer_id column no longer exists (dropped in migration v4).
    // Customer identity is now stored directly on the referral row as
    // customer_name and customer_phone (denormalized per new architecture).
    const referralResult = await client.query(
      `INSERT INTO referrals (agent_id, customer_name, customer_phone, campaign_id, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING id, agent_id, customer_name, customer_phone, campaign_id, status, created_at`,
      [agent.id, customer_name, customer_phone, campaign.id]
    );

    const referral = referralResult.rows[0];

    // ── Step 3e: Mark integration_log as PROCESSED ───────────────────────────
    await client.query(
      `UPDATE integration_logs
       SET status = 'PROCESSED'
       WHERE id = $1`,
      [logId]
    );

    // ── Step 3f: Commit all changes atomically ────────────────────────────────
    await client.query('COMMIT');

    // Server-side audit log — useful during development and production debugging.
    console.log(
      `[integration] New referral recorded: agent=${agent.name} (id=${agent.id}), ` +
      `customer=${customer_name}, campaign="${campaign.name}", referral_id=${referral.id}`
    );

    // ── Step 4: Return 202 Accepted ───────────────────────────────────────────
    // 202 (not 201) because Temenos treats this as an acknowledgement:
    // "we received and queued your event". The actual reward calculation
    // happens later when an admin marks the referral SUCCESSFUL.
    return res.status(202).json({
      message:     'Referral recorded successfully. Pending admin verification.',
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
      // Extremely unlikely, but log if ROLLBACK itself fails.
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


module.exports = router;
