/**
 * server/test_auditor_scoping.js
 * ─────────────────────────────────────────────────────────────
 * Verification test for Enterprise RBAC scoping:
 * 1. Auditor role (view_dashboard, view_referrals, view_finance) without agent_id:
 *    - Resolves permissions correctly.
 *    - /api/auth/me returns agent_id: null.
 *    - GET /api/referrals returns the global list (not scoped by agent_id = null, no 403).
 * 2. Agent role with agent_id:
 *    - /api/auth/me returns agent_id: <id>.
 *    - GET /api/referrals scopes to their own agent_id only.
 */

'use strict';

require('module-alias/register');
const prisma = require('@/config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rbacService = require('@/modules/rbac/rbac.service');
const referralsCtrl = require('@/modules/referrals/referrals.controller');
const authCtrl = require('@/modules/auth/auth.controller');

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL  ${label}`);
    failed++;
  }
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Auditor Scoping & Context Verification Test Suite');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let auditorRole = null;
  let auditorUser = null;
  let testAgent = null;
  let testAgentUser = null;

  try {
    // 1. Ensure AUDITOR role exists with view_dashboard, view_referrals, view_finance
    console.log('[1] Setup Custom Auditor Role & User');
    auditorRole = await prisma.role.upsert({
      where: { name: 'AUDITOR' },
      update: {},
      create: {
        name: 'AUDITOR',
        description: 'Auditor with view-only operational access',
        isSystem: false,
      },
    });

    const perms = await prisma.permission.findMany({
      where: { key: { in: ['view_dashboard', 'view_referrals', 'view_finance'] } },
    });

    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: auditorRole.id, permissionId: p.id } },
        update: {},
        create: { roleId: auditorRole.id, permissionId: p.id },
      });
    }

    const hashedPw = await bcrypt.hash('AuditorPass123!', 10);
    auditorUser = await prisma.user.upsert({
      where: { username: 'test_auditor_enterprise' },
      update: { agent_id: null },
      create: {
        username: 'test_auditor_enterprise',
        password_hash: hashedPw,
        role: 'ADMIN', // legacy column fallback
        agent_id: null,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: auditorUser.id, roleId: auditorRole.id } },
      update: {},
      create: { userId: auditorUser.id, roleId: auditorRole.id },
    });

    // Resolve Auditor permissions
    const auditorRes = await rbacService.resolveUserRolesAndPermissions(auditorUser.id);
    assert(auditorRes.roles.includes('AUDITOR'), 'Auditor resolves role AUDITOR');
    assert(auditorRes.permissions.includes('view_referrals'), 'Auditor has view_referrals');
    assert(auditorRes.permissions.includes('view_dashboard'), 'Auditor has view_dashboard');
    assert(!auditorRes.permissions.includes('manage_referrals'), 'Auditor strictly lacks manage_referrals');

    // 2. Test /api/auth/me for Auditor
    console.log('\n[2] Auth Controller /api/auth/me Contract');
    const token = jwt.sign(
      { id: auditorUser.id, role: 'AUDITOR', agent_id: null, token_version: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    let meData = null;
    const mockMeReq = {
      cookies: { token },
      user: { id: auditorUser.id },
    };
    const mockMeRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        meData = data;
        return this;
      },
    };

    await authCtrl.me(mockMeReq, mockMeRes, () => {});
    assert(mockMeRes.statusCode === 200, 'GET /api/auth/me returns 200');
    assert(meData.agent_id === null, 'GET /api/auth/me returns agent_id: null for Auditor');
    assert(meData.roles.includes('AUDITOR'), 'GET /api/auth/me includes AUDITOR in roles');

    // 3. Test Referral Listing Scoping for Auditor (no agent_id, has view_referrals, no manage_referrals)
    console.log('\n[3] Referral Scoping for Auditor (Global Visibility)');
    let referralsData = null;
    let referralsStatus = null;
    const mockRefReq = {
      user: { id: auditorUser.id, agent_id: null },
      userRoles: ['AUDITOR'],
      userPermissions: new Set(auditorRes.permissions),
      query: { page: '1', limit: '10' },
    };
    const mockRefRes = {
      status(code) {
        referralsStatus = code;
        return this;
      },
      json(data) {
        referralsData = data;
        return this;
      },
    };

    await referralsCtrl.listReferrals(mockRefReq, mockRefRes, (err) => {
      if (err) console.error('Referrals ctrl error:', err);
    });

    assert(referralsStatus === 200, 'GET /api/referrals returns 200 for Auditor without agent_id');
    assert(Array.isArray(referralsData?.data), 'Referrals data array is returned');
    assert(referralsData?.meta?.total >= 0, 'Referrals meta total is returned');

    // Count all referrals in DB to verify global view
    const totalInDb = await prisma.referral.count();
    assert(referralsData?.meta?.total === totalInDb, `Auditor sees all ${totalInDb} referrals globally`);

    // 4. Test Agent Referral Scoping
    console.log('\n[4] Agent Scoping (Strict Isolation)');
    // Find or create test agent
    testAgent = await prisma.agent.create({
      data: {
        name: 'Enterprise Test Agent',
        phone: '+251911999999',
        email: 'ent_agent@nib.et',
        status: 'APPROVED',
        referral_code: 'NIB-ENT01',
      },
    });

    const agentPw = await bcrypt.hash('AgentPass123!', 10);
    testAgentUser = await prisma.user.create({
      data: {
        username: 'ent_agent@nib.et',
        password_hash: agentPw,
        role: 'AGENT',
        agent_id: testAgent.id,
      },
    });

    const agentToken = jwt.sign(
      { id: testAgentUser.id, role: 'AGENT', agent_id: testAgent.id, token_version: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    let agentMeData = null;
    const mockAgentMeReq = {
      cookies: { token: agentToken },
      user: { id: testAgentUser.id },
    };
    const mockAgentMeRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        agentMeData = data;
        return this;
      },
    };

    await authCtrl.me(mockAgentMeReq, mockAgentMeRes, () => {});
    assert(mockAgentMeRes.statusCode === 200, 'GET /api/auth/me returns 200 for Agent');
    assert(agentMeData.agent_id === testAgent.id, 'GET /api/auth/me returns correct agent_id for Agent');

    let agentRefData = null;
    let agentRefStatus = null;
    const mockAgentRefReq = {
      user: { id: testAgentUser.id, agent_id: testAgent.id },
      userRoles: ['AGENT'],
      userPermissions: new Set(['view_referrals']),
      query: { page: '1', limit: '10' },
    };
    const mockAgentRefRes = {
      status(code) {
        agentRefStatus = code;
        return this;
      },
      json(data) {
        agentRefData = data;
        return this;
      },
    };

    await referralsCtrl.listReferrals(mockAgentRefReq, mockAgentRefRes, (err) => {
      if (err) console.error('Agent referrals error:', err);
    });

    assert(agentRefStatus === 200, 'GET /api/referrals returns 200 for Agent');
    // Agent has 0 referrals for this newly created agent
    assert(agentRefData?.meta?.total === 0, 'Agent sees 0 referrals (strictly scoped to their agent_id)');

  } catch (err) {
    console.error('Test run failed with error:', err);
    failed++;
  } finally {
    // Cleanup
    console.log('\n[5] Cleanup Test Data');
    try {
      if (testAgentUser?.id) {
        await prisma.userRole.deleteMany({ where: { userId: testAgentUser.id } });
        await prisma.user.deleteMany({ where: { id: testAgentUser.id } });
      }
      if (testAgent?.id) {
        await prisma.agent.deleteMany({ where: { id: testAgent.id } });
      }
      if (auditorUser?.id) {
        await prisma.userRole.deleteMany({ where: { userId: auditorUser.id } });
        await prisma.user.deleteMany({ where: { id: auditorUser.id } });
      }
      if (auditorRole?.id) {
        await prisma.rolePermission.deleteMany({ where: { roleId: auditorRole.id } });
        await prisma.role.deleteMany({ where: { id: auditorRole.id } });
      }
      console.log('  ✅ PASS  Cleaned up all test artifacts successfully');
      passed++;
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Tests completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run();
