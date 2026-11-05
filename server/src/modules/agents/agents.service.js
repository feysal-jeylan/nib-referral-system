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

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateReferralCode() {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `NIB-${random}`;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

function generateTempPassword() {
  return crypto.randomBytes(16).toString('hex');
}

// ── PUBLIC: submit application ────────────────────────────────────────────────
async function applyAsAgent({ name, phone, email }) {
  return prisma.agent.create({
    data: { name, phone, email, status: 'PENDING', referral_code: null },
  });
}

// ── List agents (RBAC-filtered) ───────────────────────────────────────────────
async function listAgents(role, agentId) {
  const where = role === 'AGENT' ? { id: agentId } : {};

  const agents = await prisma.agent.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: { referrals: { select: { status: true } } },
  });

  // reward_rules not in Prisma schema — use $queryRaw
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

  return agents.map(agent => {
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
}

// ── ADMIN: create approved agent ──────────────────────────────────────────────
async function createApprovedAgent({ name, phone, email }) {
  const referralCode = generateReferralCode();
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const newAgent = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: { name, phone, email, referral_code: referralCode, status: 'APPROVED' },
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

  return { agent: newAgent, tempPassword, email };
}

// ── ADMIN: approve pending agent ──────────────────────────────────────────────
async function findAgentById(id) {
  return prisma.agent.findUnique({
    where:  { id },
    select: { id: true, name: true, email: true, referral_code: true, status: true },
  });
}

async function approveAgent(agentId, agentEmail, existingCode) {
  const referralCode = existingCode ?? generateReferralCode();
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const updated = await prisma.$transaction(async (tx) => {
    const updatedAgent = await tx.agent.update({
      where:  { id: agentId },
      data:   { status: 'APPROVED', referral_code: referralCode },
      select: { id: true, name: true, referral_code: true, status: true },
    });
    await tx.user.create({
      data: {
        username:             agentEmail,
        password_hash:        passwordHash,
        role:                 'AGENT',
        agent_id:             agentId,
        must_change_password: true,
      },
    });
    return updatedAgent;
  });

  return { agent: updated, tempPassword };
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
