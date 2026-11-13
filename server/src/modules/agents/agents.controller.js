/**
 * src/modules/agents/agents.controller.js
 * ─────────────────────────────────────────
 * HTTP layer for agent endpoints.
 * Handles req/res and input validation.
 * All DB work delegated to agents.service.js.
 */

'use strict';

const svc = require('./agents.service');

// ── POST /api/agents/apply  (PUBLIC) ─────────────────────────────────────────
async function applyAsAgent(req, res, next) {
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim()?.toLowerCase();

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'All fields are required: name, phone, email.', code: 'MISSING_FIELDS' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.', code: 'INVALID_EMAIL' });
  }

  try {
    await svc.applyAsAgent({ name, phone, email });
    return res.status(201).json({ message: 'Application submitted. Awaiting Admin approval.' });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An agent with this phone number or email already exists.', code: 'DUPLICATE_ENTRY' });
    }
    console.error('[POST /api/agents/apply] Prisma error:', err.message);
    next(err);
  }
}

// ── GET /api/agents ───────────────────────────────────────────────────────────
async function listAgents(req, res, next) {
  try {
    const page   = Math.max(1,   parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(50,  Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search ?? '').trim();
    const status = (req.query.status ?? '').trim().toUpperCase();

    const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];
    const safeStatus = VALID_STATUSES.includes(status) ? status : '';

    const result = await svc.listAgents(req.user.role, req.user.agent_id, {
      page, limit, search, status: safeStatus,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/agents] Prisma error:', err.message);
    next(err);
  }
}

// ── POST /api/agents  (ADMIN) ─────────────────────────────────────────────────
async function createAgent(req, res, next) {
  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim();

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'All fields are required: name, phone, email.', code: 'MISSING_FIELDS' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.', code: 'INVALID_EMAIL' });
  }

  try {
    const { agent, email: agentEmail } = await svc.createApprovedAgent({ name, phone, email });

    console.log(`[AGENT ONBOARDING] Activation email sent to: ${agentEmail}`);

    return res.status(201).json({
      id:            agent.id,
      name:          agent.name,
      referral_code: agent.referral_code,
      status:        agent.status,
      created_at:    agent.created_at,
      message:       `Agent created. An activation email has been sent to ${agentEmail}.`,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      let field = 'phone or email';
      const target = err.meta?.target ?? '';
      if (String(target).includes('phone'))         field = 'phone number';
      if (String(target).includes('email'))         field = 'email address';
      if (String(target).includes('referral_code')) field = 'referral code';
      if (String(target).includes('username'))      field = 'email (user account)';
      return res.status(409).json({ error: `An agent with this ${field} already exists.`, code: 'DUPLICATE_ENTRY' });
    }
    console.error('[POST /api/agents] Prisma error:', err.message);
    next(err);
  }
}

// ── PATCH /api/agents/:id/approve  (ADMIN) ───────────────────────────────────
async function approveAgent(req, res, next) {
  const agentId = parseInt(req.params.id, 10);
  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  let agent;
  try {
    agent = await svc.findAgentById(agentId);
  } catch (err) {
    console.error('[PATCH /api/agents/:id/approve] DB lookup error:', err.message);
    return next(err);
  }

  if (!agent) {
    return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
  }

  try {
    const { agent: updated } = await svc.approveAgent(agentId, agent.email, agent.name, agent.referral_code);

    console.log(`[AGENT APPROVAL] Activation email sent to: ${agent.email}`);

    return res.status(200).json({
      id:            updated.id,
      name:          updated.name,
      referral_code: updated.referral_code,
      status:        updated.status,
      message:       `Agent approved. An activation email has been sent to ${agent.email}.`,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A user account for this agent already exists.', code: 'DUPLICATE_ENTRY' });
    }
    console.error('[PATCH /api/agents/:id/approve] Error:', err.message);
    next(err);
  }
}

// ── PATCH /api/agents/:id/reject  (ADMIN) ────────────────────────────────────
async function rejectAgent(req, res, next) {
  const agentId = parseInt(req.params.id, 10);
  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const updated = await svc.rejectAgent(agentId);
    return res.status(200).json({ id: updated.id, name: updated.name, status: updated.status });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }
    console.error('[PATCH /api/agents/:id/reject] Prisma error:', err.message);
    next(err);
  }
}

// ── GET /api/agents/:id/stats ─────────────────────────────────────────────────
async function getAgentStats(req, res, next) {
  const agentId = parseInt(req.params.id, 10);
  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  // RBAC: agents can only view their own stats
  if (req.user.role === 'AGENT' && req.user.agent_id !== agentId) {
    return res.status(403).json({ error: 'Access denied. Agents can only view their own stats.', code: 'FORBIDDEN' });
  }

  try {
    const stats = await svc.getAgentStats(agentId);
    if (!stats) {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }
    return res.status(200).json(stats);
  } catch (err) {
    console.error('[GET /api/agents/:id/stats] Prisma error:', err.message);
    next(err);
  }
}

// ── PUT /api/agents/:id  (ADMIN) ─────────────────────────────────────────────
async function updateAgent(req, res, next) {
  const agentId = parseInt(req.params.id, 10);
  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  const name  = req.body.name?.trim();
  const phone = req.body.phone?.trim();
  const email = req.body.email?.trim()?.toLowerCase();

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'All fields are required: name, phone, email.', code: 'MISSING_FIELDS' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.', code: 'INVALID_EMAIL' });
  }

  try {
    const updated = await svc.updateAgent(agentId, { name, phone, email });
    return res.status(200).json({
      ...updated,
      message: `Agent "${updated.name}" updated successfully.`,
    });
  } catch (err) {
    if (err.status === 404 || err.code === 'AGENT_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: 'AGENT_NOT_FOUND' });
    }
    if (err.code === 'P2002') {
      let field = 'phone or email';
      const target = err.meta?.target ?? '';
      if (String(target).includes('phone'))    field = 'phone number';
      if (String(target).includes('email'))    field = 'email address';
      if (String(target).includes('username')) field = 'email address';
      return res.status(409).json({ error: `An agent with this ${field} already exists.`, code: 'DUPLICATE_ENTRY' });
    }
    console.error('[PUT /api/agents/:id] Prisma error:', err.message);
    next(err);
  }
}

// ── PATCH /api/agents/:id/suspend  (ADMIN) ───────────────────────────────────
async function suspendAgent(req, res, next) {
  const agentId = parseInt(req.params.id, 10);
  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const updated = await svc.suspendAgent(agentId);
    return res.status(200).json({
      id:      updated.id,
      name:    updated.name,
      status:  updated.status,
      message: `Agent "${updated.name}" has been suspended.`,
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }
    console.error('[PATCH /api/agents/:id/suspend] Prisma error:', err.message);
    next(err);
  }
}

// ── PATCH /api/agents/:id/activate  (ADMIN) ──────────────────────────────────
async function activateAgent(req, res, next) {
  const agentId = parseInt(req.params.id, 10);
  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const updated = await svc.activateAgent(agentId);
    return res.status(200).json({
      id:      updated.id,
      name:    updated.name,
      status:  updated.status,
      message: `Agent "${updated.name}" has been activated.`,
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: `Agent with id ${agentId} not found.`, code: 'AGENT_NOT_FOUND' });
    }
    console.error('[PATCH /api/agents/:id/activate] Prisma error:', err.message);
    next(err);
  }
}

// ── DELETE /api/agents/:id  (ADMIN) ──────────────────────────────────────────
async function deleteAgent(req, res, next) {
  const agentId = parseInt(req.params.id, 10);
  if (isNaN(agentId)) {
    return res.status(400).json({ error: 'Agent ID must be a valid integer.', code: 'INVALID_ID' });
  }

  try {
    const result = await svc.deleteAgent(agentId);
    return res.status(200).json({
      id:      result.id,
      message: `Agent "${result.name}" deleted successfully.`,
    });
  } catch (err) {
    if (err.status === 404 || err.code === 'AGENT_NOT_FOUND') {
      return res.status(404).json({ error: err.message, code: 'AGENT_NOT_FOUND' });
    }
    if (err.status === 409 || err.code === 'EXISTING_REFERRALS') {
      return res.status(409).json({ error: err.message, code: 'EXISTING_REFERRALS' });
    }
    console.error('[DELETE /api/agents/:id] Prisma error:', err.message);
    next(err);
  }
}

module.exports = {
  applyAsAgent,
  listAgents,
  createAgent,
  approveAgent,
  rejectAgent,
  updateAgent,
  suspendAgent,
  activateAgent,
  deleteAgent,
  getAgentStats,
};

