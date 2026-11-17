/**
 * server/test_users_module.js
 * ─────────────────────────────
 * Smoke test for the /api/users module.
 * Tests: list, create, update, suspend, activate.
 * Uses direct module imports (no HTTP server).
 */

'use strict';

require('module-alias/register');
const prisma    = require('@/config/db');
const usersSvc  = require('@/modules/users/users.service');
const rbacSvc   = require('@/modules/rbac/rbac.service');

let passed = 0;
let failed = 0;
const testUser = { id: null, agentId: null };

function assert(cond, label) {
  if (cond) {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL  ${label}`);
    failed++;
  }
}

async function cleanup() {
  if (testUser.id) {
    try {
      const u = await prisma.user.findUnique({ where: { id: testUser.id } });
      await prisma.userRole.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.deleteMany({ where: { id: testUser.id } });
      const agentId = u?.agent_id || testUser.agentId;
      if (agentId) {
        await prisma.agent.deleteMany({ where: { id: agentId } });
      }
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }
  }
  // Also clean up any lingering test user by username
  try {
    const lingering = await prisma.user.findFirst({ where: { username: 'test_users_module_usr' } });
    if (lingering) {
      await prisma.userRole.deleteMany({ where: { userId: lingering.id } });
      await prisma.user.deleteMany({ where: { id: lingering.id } });
      if (lingering.agent_id) {
        await prisma.agent.deleteMany({ where: { id: lingering.agent_id } });
      }
    }
  } catch (_) {}
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Users Module Smoke Tests');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // Initial cleanup in case previous run failed midway
    await cleanup();

    // ── [1] Create user ───────────────────────────────────────────────────────
    console.log('[1] Create User');
    const actor = { actorId: 1, ipAddress: '127.0.0.1' };
    const created = await usersSvc.createUser({
      username: 'test_users_module_usr',
      email:    'test_users_module@nibbank.et',
      password: 'SecurePass123!',
      roleName: 'AGENT',
    }, actor);
    testUser.id = created?.id;
    assert(created?.id, 'createUser returns user with id');
    assert(created?.username === 'test_users_module_usr', 'username matches');
    assert(Array.isArray(created?.roles), 'roles array present');
    assert(created?.roles?.some(r => r.name === 'AGENT'), 'AGENT role assigned');

    // ── [2] Duplicate guard ───────────────────────────────────────────────────
    console.log('\n[2] Duplicate Guard');
    let threw = false;
    try {
      await usersSvc.createUser({ username: 'test_users_module_usr', password: 'pass1234', email: null, roleName: null }, actor);
    } catch (err) {
      threw = err.code === 'USER_ALREADY_EXISTS';
    }
    assert(threw, 'createUser throws USER_ALREADY_EXISTS on duplicate username');

    // ── [3] List users ─────────────────────────────────────────────────────────
    console.log('\n[3] List Users');
    const { users, meta } = await usersSvc.listUsers({ page: 1, limit: 50, search: 'test_users_module_usr' });
    assert(users.length >= 1, 'listUsers returns at least 1 user');
    assert(meta.total >= 1, 'meta.total >= 1');
    assert(Array.isArray(users[0].roles), 'listed user has roles array');

    // ── [4] Get by ID ─────────────────────────────────────────────────────────
    console.log('\n[4] Get User By ID');
    const fetched = await usersSvc.getUserById(testUser.id);
    assert(fetched?.id === testUser.id, 'getUserById returns correct user');

    // ── [5] Suspend ───────────────────────────────────────────────────────────
    console.log('\n[5] Suspend User (via Agent status)');
    const suspended = await usersSvc.suspendUser(testUser.id);
    assert(suspended?.is_suspended === true, 'suspendUser sets is_suspended=true (agent status SUSPENDED)');

    // ── [6] Activate ──────────────────────────────────────────────────────────
    console.log('\n[6] Activate User (via Agent status)');
    const activated = await usersSvc.activateUser(testUser.id);
    assert(activated?.is_suspended === false, 'activateUser sets is_suspended=false (agent status APPROVED)');

    // ── [7] Update ────────────────────────────────────────────────────────────
    console.log('\n[7] Update User');
    const updated = await usersSvc.updateUser(testUser.id, { email: 'updated_users_test@nibbank.et' });
    assert(updated?.email === 'updated_users_test@nibbank.et', 'updateUser updates email');

  } catch (err) {
    console.error('\n[FATAL]', err.message, err.stack);
    failed++;
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Tests completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
