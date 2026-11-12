/**
 * src/modules/agents/agents.service.js
 * ──────────────────────────────────────
 * Data-access layer for agent operations.
 * All Prisma queries live here — no HTTP logic.
 */

'use strict';

const crypto  = require('crypto');
const bcrypt  = require('bcrypt');
const prisma  = require('@/config/db');
const { sendActivationEmail } = require('@/services/emailService');

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateReferralCode() {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `NIB-${random}`;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

/** Generates a 32-byte hex token and its SHA-256 hash. */
function generateActivationToken() {
  const rawToken    = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires     = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  return { rawToken, hashedToken, expires };
}

// ── PUBLIC: submit application ────────────────────────────────────────────────
async function applyAsAgent({ name, phone, email }) {
  return prisma.agent.create({
    data: { name, phone, email, status: 'PENDING', referral_code: null },
  });
}

// ── List agents (RBAC-filtered, paginated, searchable) ───────────────────────
async function listAgents(role, agentId, { page = 1, limit = 10, search = '', status = '' } = {}) {
  const skip = (page - 1) * limit;

  // AGENT role: can only see their own record
  if (role === 'AGENT' && (agentId == null)) {
    const err = new Error('Agent account is not linked to an agent profile.');
    err.status = 403;
    throw err;
  }
  const baseWhere = role === 'AGENT' ? { id: agentId } : {};

  // Admin filters
  const statusFilter  = status  ? { status }  : {};
  const searchFilter  = search
    ? {
        OR: [
          { name:          { contains: search, mode: 'insensitive' } },
          { phone:         { contains: search, mode: 'insensitive' } },
          { referral_code: { contains: search, mode: 'insensitive' } },
          { email:         { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const where = { ...baseWhere, ...statusFilter, ...searchFilter };

  const tiers = await prisma.$queryRaw`
    SELECT reward_name, min_referrals
    FROM   reward_rules
    ORDER  BY min_referrals ASC
  `;

  const getRewardTier = (count) => {
    let tier = null;
    for (const t of tiers) {
      if (count >= Number(t.min_referrals)) tier = t.reward_name;
    }
    return tier;
  };

  const [total, agents] = await prisma.$transaction([
    prisma.agent.count({ where }),
    prisma.agent.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { created_at: 'desc' },
      include: { referrals: { select: { status: true } } },
    }),
  ]);

  const data = agents.map(agent => {
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

  return {
    data,
    meta: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) },
  };
}

// ── ADMIN: create approved agent (direct creation flow) ───────────────────────
async function createApprovedAgent({ name, phone, email }) {
  const referralCode = generateReferralCode();
  const { rawToken, hashedToken, expires } = generateActivationToken();

  const newAgent = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: { name, phone, email, referral_code: referralCode, status: 'APPROVED' },
      select: { id: true, name: true, referral_code: true, status: true, created_at: true },
    });
    await tx.user.create({
      data: {
        username:             email,
        password_hash:        'PENDING_ACTIVATION',   // placeholder — overwritten on activate
        role:                 'AGENT',
        agent_id:             agent.id,
        must_change_password: true,
        activationToken:      hashedToken,
        activationExpires:    expires,
        isActivated:          false,
      },
    });
    return agent;
  });

  // Send the activation email (never expose rawToken to the Admin response)
  await sendActivationEmail(email, name, rawToken);

  return { agent: newAgent, email };
}

// ── ADMIN: approve pending agent ──────────────────────────────────────────────
async function findAgentById(id) {
  return prisma.agent.findUnique({
    where:  { id },
    select: { id: true, name: true, email: true, referral_code: true, status: true },
  });
}

async function approveAgent(agentId, agentEmail, agentName, existingCode) {
  const referralCode = existingCode ?? generateReferralCode();
  const { rawToken, hashedToken, expires } = generateActivationToken();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedAgent = await tx.agent.update({
      where:  { id: agentId },
      data:   { status: 'APPROVED', referral_code: referralCode },
      select: { id: true, name: true, referral_code: true, status: true },
    });
    await tx.user.create({
      data: {
        username:             agentEmail,
        password_hash:        'PENDING_ACTIVATION',   // placeholder — overwritten on activate
        role:                 'AGENT',
        agent_id:             agentId,
        must_change_password: true,
        activationToken:      hashedToken,
        activationExpires:    expires,
        isActivated:          false,
      },
    });
    return updatedAgent;
  });

  // Send activation email — Admin NEVER sees the rawToken
  await sendActivationEmail(agentEmail, agentName, rawToken);

  return { agent: updated };
}

// ── ADMIN: reject pending agent ───────────────────────────────────────────────
async function rejectAgent(agentId) {
  return prisma.agent.update({
    where:  { id: agentId },
    data:   { status: 'REJECTED' },
    select: { id: true, name: true, status: true },
  });
}

// ── Agent stats ───────────────────────────────────────────────────────────────
async function getAgentStats(agentId) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId }, select: { id: true, name: true },
  });
  if (!agent) return null;

  const successfulCount = await prisma.referral.count({
    where: { agent_id: agentId, status: 'SUCCESSFUL' },
  });

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

  return {
    agent_id:             agentId,
    successful_referrals: successfulCount,
    current_reward:       tierRows.length > 0 ? tierRows[0].reward_name : null,
  };
}

module.exports = {
  applyAsAgent,
  listAgents,
  createApprovedAgent,
  findAgentById,
  approveAgent,
  rejectAgent,
  getAgentStats,
};

