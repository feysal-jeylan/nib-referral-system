/**
 * server/test_user_provisioning.js
 * ─────────────────────────────────────────────────────────────
 * Verification test for custom role user provisioning:
 * 1. createUser with custom role 'Auditor':
 *    - Sets legacy role to 'STAFF' (not 'AGENT').
 *    - Does NOT create an Agent record.
 *    - Leaves agent_id as null.
 *    - Permissions are strictly the Auditor permissions.
 * 2. createUser with role 'AGENT':
 *    - Sets legacy role to 'AGENT'.
 *    - Creates an Agent record and links agent_id.
 */

'use strict';

require('module-alias/register');
const prisma = require('@/config/db');
const usersSvc = require('@/modules/users/users.service');
const rbacSvc = require('@/modules/rbac/rbac.service');

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
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  User Provisioning & Role Isolation Test');
  console.log('═══════════════════════════════════════════════════\n');

  let auditorRole = null;
  let testAuditor = null;
  let testAgent = null;

  try {
    // 1. Create custom Auditor role if not present
    auditorRole = await prisma.role.upsert({
      where: { name: 'AUDITOR' },
      update: {},
      create: {
        name: 'AUDITOR',
        description: 'Auditor role',
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

    const actor = { actorId: 1, ipAddress: '127.0.0.1' };

    // 2. Provision Auditor user
    console.log('[1] Provision Custom Role User (Auditor)');
    testAuditor = await usersSvc.createUser({
      username: 'test_auditor_prov_user',
      email: 'auditor_prov@nib.et',
      password: 'SecurePassword123!',
      roleName: 'AUDITOR',
    }, actor);

    // Verify DB record
    const auditorDb = await prisma.user.findUnique({
      where: { id: testAuditor.id },
      include: { agent: true },
    });

    assert(auditorDb.role === 'STAFF', 'Auditor user legacy role is STAFF (not AGENT)');
    assert(auditorDb.agent_id === null, 'Auditor user agent_id is strictly null');
    assert(auditorDb.agent === null, 'No Agent record created in agents table');

    // Verify effective permissions
    const auditorRbac = await rbacSvc.resolveUserRolesAndPermissions(testAuditor.id);
    assert(auditorRbac.roles.includes('AUDITOR'), 'Auditor resolves role AUDITOR');
    assert(auditorRbac.permissions.includes('view_dashboard'), 'Auditor has view_dashboard');
    assert(auditorRbac.permissions.includes('view_referrals'), 'Auditor has view_referrals');
    assert(auditorRbac.permissions.includes('view_finance'), 'Auditor has view_finance');
    assert(!auditorRbac.permissions.includes('view_agents'), 'Auditor strictly lacks view_agents');
    assert(!auditorRbac.permissions.includes('view_campaigns'), 'Auditor strictly lacks view_campaigns');

    // 3. Provision Agent user
    console.log('\n[2] Provision Agent User');
    testAgent = await usersSvc.createUser({
      username: 'test_agent_prov_user',
      email: 'agent_prov@nib.et',
      password: 'SecurePassword123!',
      roleName: 'AGENT',
    }, actor);

    const agentDb = await prisma.user.findUnique({
      where: { id: testAgent.id },
      include: { agent: true },
    });

    assert(agentDb.role === 'AGENT', 'Agent user legacy role is AGENT');
    assert(agentDb.agent_id !== null, 'Agent user has non-null agent_id');
    assert(agentDb.agent !== null, 'Agent record created in agents table');

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    console.log('\n[3] Cleanup');
    if (testAuditor?.id) {
      await prisma.userRole.deleteMany({ where: { userId: testAuditor.id } });
      await prisma.user.deleteMany({ where: { id: testAuditor.id } });
    }
    if (testAgent?.id) {
      await prisma.userRole.deleteMany({ where: { userId: testAgent.id } });
      const a = await prisma.user.findUnique({ where: { id: testAgent.id } });
      await prisma.user.deleteMany({ where: { id: testAgent.id } });
      if (a?.agent_id) {
        await prisma.agent.deleteMany({ where: { id: a.agent_id } });
      }
    }
    console.log('  ✅ PASS  Cleaned up test users');
    passed++;
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Tests completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

run();

