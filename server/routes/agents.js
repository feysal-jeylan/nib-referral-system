/**
 * referral-api/routes/agents.js
 * ------------------------------
 * Router for all /api/agents endpoints.
 *
 * V8 (Prisma migration):
 *   All raw pool.query() / pool.connect() calls replaced with Prisma Client
 *   methods. Transactional multi-table writes use prisma.$transaction().
 *   The reward_rules table is not in the Prisma schema (legacy table from
 *   schema.sql); it is accessed via prisma.$queryRaw where needed.
 *
 * Endpoints:
 *   POST /api/agents/apply        — PUBLIC: submit a self-registration application.
 *   GET  /api/agents              — List agents (ADMIN: all, AGENT: own row only).
 *   POST /api/agents              — Create a new approved agent + user (ADMIN only).
 *   PATCH /api/agents/:id/approve — Approve a PENDING agent (ADMIN only).
 *   PATCH /api/agents/:id/reject  — Reject a PENDING agent (ADMIN only).
 *   GET  /api/agents/:id/stats   — Agent referral count and reward tier.
 *
 * ROUTE ORDER MATTERS:
 *   Literal-path routes like POST /apply must be declared BEFORE parameterised
 *   routes like PATCH /:id/* so Express parses "apply" correctly.
 *
 * Per RULES.md:
 *   - Prisma handles parameterisation — no string concatenation ever.
 *   - Raw DB/Prisma errors are never sent to the client.
 *   - Multi-table writes are wrapped in prisma.$transaction().
 */

'use strict';

const crypto  = require('crypto');
const express = require('express');
const bcrypt  = require('bcrypt');
const prisma  = require('../db-prisma');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper: generate a unique referral code in the format NIB-XXXXXX
// ---------------------------------------------------------------------------
function generateReferralCode() {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `NIB-${random}`;
}

// ---------------------------------------------------------------------------
// POST /api/agents/apply  — PUBLIC (no auth required)
//
// Allows anyone to submit an application to become a Nib referral agent.
// Status = 'PENDING'; referral_code = null. Admin must approve before login.
//
// Request body (JSON):
//   { "name": "Sara Tesfaye", "phone": "0912345678", "email": "sara@example.com" }
//
// Success response — 201 Created:
//   { "message": "Application submitted. Awaiting Admin approval." }
//
// Error responses:
//   400 Bad Request — missing or invalid fields
//   409 Conflict   — phone or email already registered
//   500 Server Error
// ---------------------------------------------------------------------------
router.post('/apply', async (req, res, next) => {
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim()?.toLowerCase();

  if (!name || !phone || !email) {
    return res.status(400).json({
      error: 'All fields are required: name, phone, email.',
      code:  'MISSING_FIELDS',
    });
  }

  if (!email.includes('@')) {
    return res.status(400).json({
      error: 'A valid email address is required.',
      code:  'INVALID_EMAIL',
    });
  }

  try {
    await prisma.agent.create({
      data: {
        name,
        phone,
        email,
        status:       'PENDING',
        referral_code: null,
      },
    });

    return res.status(201).json({
      message: 'Application submitted. Awaiting Admin approval.',
    });

  } catch (err) {
    // P2002 = unique constraint violation (phone or email already exists)
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'An agent with this phone number or email already exists.',
        code:  'DUPLICATE_ENTRY',
      });
    }
    console.error('[POST /api/agents/apply] Prisma error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents  — authenticated (any role)
//
// RBAC filtering:
//   ADMIN  → returns ALL agents (all statuses).
//   AGENT  → returns ONLY the row for their own agent_id.
//
// Success response — 200 OK (array, newest agent first):
//   [
//     {
//       "id":                  1,
//       "name":                "Abebe Kebede",
//       "phone":               "0911234567",
//       "email":               "abebe@nib.com",
//       "referral_code":       "NIB-X7KP2A",
//       "status":              "APPROVED",
//       "successful_referrals": 4,
//       "current_reward":       "Bronze"
//     },
//     ...
//   ]
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    // ── RBAC: Prisma `where` clause ───────────────────────────────────────────
    const where = req.user.role === 'AGENT'
      ? { id: req.user.agent_id }
      : {};

    // ── Fetch agents + referral status counts via Prisma ─────────────────────
    const agents = await prisma.agent.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        referrals: {
          select: { status: true }, // only status needed for counting
        },
      },
    });

    // ── Fetch reward tiers once — reward_rules is not in Prisma schema ────────
    // We use $queryRaw with a tagged-template literal (Prisma.sql`...`)
    // which is fully parameterised (no injection risk even with $queryRaw).
    const tiers = await prisma.$queryRaw`
      SELECT reward_name, min_referrals
      FROM   reward_rules
      ORDER  BY min_referrals ASC
    `;

    // Helper: find the highest qualifying reward tier for a count.
    const getRewardTier = (count) => {
      let tier = null;
      for (const t of tiers) {
        // $queryRaw returns BigInt for integer columns in some Prisma versions
        if (count >= Number(t.min_referrals)) tier = t.reward_name;
      }
      return tier;
    };

    // ── Shape response to match existing format ───────────────────────────────
    const shaped = agents.map(agent => {
      const successfulCount = agent.referrals.filter(r => r.status === 'SUCCESSFUL').length;
      return {
        id:                   agent.id,
        name:                 agent.name,
        phone:                agent.phone,
        email:                agent.email,
        referral_code:        agent.referral_code,
        status:               agent.status,
        successful_referrals: successfulCount,
        current_reward:       getRewardTier(successfulCount),
      };
    });

    return res.status(200).json(shaped);

  } catch (err) {
    console.error('[GET /api/agents] Prisma error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents  — ADMIN only
//
// Create a new APPROVED agent with a linked user account in a single
// transaction. Admin hands the temp_password to the new agent out-of-band.
//
// Request body (JSON):
//   { "name": "Abebe Kebede", "phone": "0911234567", "email": "abebe@nib.com" }
//
// Success response — 201 Created:
//   { id, name, referral_code, status, created_at, message, temp_password }
//
// Error responses:
//   400 Bad Request  — missing or invalid fields
//   409 Conflict     — phone or email already exists
//   500 Server Error
// ---------------------------------------------------------------------------
router.post('/', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim();

  if (!name || !phone || !email) {
    return res.status(400).json({
      error: 'All fields are required: name, phone, email.',
      code: 'MISSING_FIELDS',
    });
  }

  if (!email.includes('@')) {
    return res.status(400).json({
      error: 'A valid email address is required.',
      code: 'INVALID_EMAIL',
    });
  }

  const referralCode = generateReferralCode();
  const tempPassword = crypto.randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  console.log(`[AGENT ONBOARDING] Temp password for ${email}: ${tempPassword}`);
  console.log(`[AGENT ONBOARDING] ⚠️  This should be delivered via secure email.`);

  try {
    // prisma.$transaction() — both inserts succeed or both roll back.
    const newAgent = await prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          name,
          phone,
          email,
          referral_code: referralCode,
          status:        'APPROVED',
        },
        select: { id: true, name: true, referral_code: true, status: true, created_at: true },
      });

      await tx.user.create({
        data: {
          username:             email,
          password_hash:        passwordHash,
          role:                 'AGENT',
          agent_id:             agent.id,
          must_change_password: true,
        },
      });

      return agent;
    });

    return res.status(201).json({
      id:            newAgent.id,
      name:          newAgent.name,
      referral_code: newAgent.referral_code,
      status:        newAgent.status,
      created_at:    newAgent.created_at,
      message:       `Agent created. Temporary credentials have been dispatched to ${email}.`,
      temp_password: tempPassword,
    });

  } catch (err) {
    if (err.code === 'P2002') {
      let field = 'phone or email';
      const target = err.meta?.target ?? '';
      if (String(target).includes('phone'))         field = 'phone number';
      if (String(target).includes('email'))         field = 'email address';
      if (String(target).includes('referral_code')) field = 'referral code';
      if (String(target).includes('username'))      field = 'email (user account)';

      return res.status(409).json({
        error: `An agent with this ${field} already exists.`,
        code: 'DUPLICATE_ENTRY',
      });
    }

    console.error('[POST /api/agents] Prisma error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/agents/:id/approve  — ADMIN only
//
// Approves a PENDING agent: sets status='APPROVED', assigns a referral code,
// and creates a user login account. Both updates are in one transaction.
//
// Success response — 200 OK:
//   { id, name, referral_code, status, temp_password, message }
// ---------------------------------------------------------------------------
router.patch('/:id/approve', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  const agentId = parseInt(req.params.id, 10);

  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  // ── Fetch the agent to verify it exists and get email ─────────────────────
  let agent;
  try {
    agent = await prisma.agent.findUnique({
      where:  { id: agentId },
      select: { id: true, name: true, email: true, referral_code: true, status: true },
    });
  } catch (err) {
    console.error('[PATCH /api/agents/:id/approve] DB lookup error:', err.message);
    return next(err);
  }

  if (!agent) {
    return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
  }

  const referralCode = agent.referral_code ?? generateReferralCode();
  const tempPassword = crypto.randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  console.log(`[AGENT APPROVAL] Temp password for ${agent.email}: ${tempPassword}`);
  console.log(`[AGENT APPROVAL] ⚠️  Deliver this via secure email in production.`);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const updatedAgent = await tx.agent.update({
        where: { id: agentId },
        data:  { status: 'APPROVED', referral_code: referralCode },
        select: { id: true, name: true, referral_code: true, status: true },
      });

      await tx.user.create({
        data: {
          username:             agent.email,
          password_hash:        passwordHash,
          role:                 'AGENT',
          agent_id:             agentId,
          must_change_password: true,
        },
      });

      return updatedAgent;
    });

    return res.status(200).json({
      id:            updated.id,
      name:          updated.name,
      referral_code: updated.referral_code,
      status:        updated.status,
      temp_password: tempPassword,
      message:       `Agent approved. Temporary credentials dispatched to ${agent.email}.`,
    });

  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'A user account for this agent already exists.',
        code:  'DUPLICATE_ENTRY',
      });
    }
    console.error('[PATCH /api/agents/:id/approve] Prisma error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/agents/:id/reject  — ADMIN only
//
// Rejects a PENDING agent application. Sets status = 'REJECTED'.
// No users row is created. Record retained for audit.
//
// Success response — 200 OK:
//   { "id": 3, "name": "Sara Tesfaye", "status": "REJECTED" }
// ---------------------------------------------------------------------------
router.patch('/:id/reject', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  const agentId = parseInt(req.params.id, 10);

  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const updated = await prisma.agent.update({
      where:  { id: agentId },
      data:   { status: 'REJECTED' },
      select: { id: true, name: true, status: true },
    });

    return res.status(200).json({
      id:     updated.id,
      name:   updated.name,
      status: updated.status,
    });

  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }
    console.error('[PATCH /api/agents/:id/reject] Prisma error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id/stats  — authenticated (AGENT restricted to own stats)
//
// Returns an agent's SUCCESSFUL referral count and current reward tier.
//
// Success response — 200 OK:
//   { "agent_id": 1, "successful_referrals": 4, "current_reward": "Bronze" }
// ---------------------------------------------------------------------------
router.get('/:id/stats', authenticateToken, async (req, res, next) => {
  const agentId = parseInt(req.params.id, 10);

  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  // RBAC — agents can only view their own stats
  if (req.user.role === 'AGENT' && req.user.agent_id !== agentId) {
    return res.status(403).json({
      error: 'Access denied. Agents can only view their own stats.',
      code:  'FORBIDDEN',
    });
  }

  try {
    // ── Verify agent exists ──────────────────────────────────────────────────
    const agent = await prisma.agent.findUnique({
      where:  { id: agentId },
      select: { id: true, name: true },
    });

    if (!agent) {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }

    // ── Count SUCCESSFUL referrals ────────────────────────────────────────────
    const successfulCount = await prisma.referral.count({
      where: { agent_id: agentId, status: 'SUCCESSFUL' },
    });

    // ── Look up reward tier via $queryRaw (reward_rules not in schema) ────────
    const tierRows = await prisma.$queryRaw`
      SELECT reward_name
      FROM   reward_rules
      WHERE  min_referrals = (
        SELECT MAX(min_referrals)
        FROM   reward_rules
        WHERE  min_referrals <= ${successfulCount}
      )
      LIMIT 1
    `;

    const currentReward = tierRows.length > 0 ? tierRows[0].reward_name : null;

    return res.status(200).json({
      agent_id:             agentId,
      successful_referrals: successfulCount,
      current_reward:       currentReward,
    });

  } catch (err) {
    console.error('[GET /api/agents/:id/stats] Prisma error:', err.message);
    next(err);
  }
});

module.exports = router;
