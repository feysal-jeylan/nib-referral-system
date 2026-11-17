/**
 * server/test_rbac.js
 * ─────────────────────────────────────────────────────────────
 * Verification suite for Part 1: Dynamic Relational RBAC Foundation.
 * Run from the server/ directory: node test_rbac.js
 */

'use strict';

require('module-alias/register');
require('dotenv').config();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('@/config/db');
const {
  resolveUserRolesAndPermissions,
  hasPermission,
  assignRoleToUser,
  removeRoleFromUser,
  deleteRole,
  createRole,
  addPermissionToRole,
  removePermissionFromRole,
} = require('@/modules/rbac/rbac.service');
const { PERMISSIONS, SYSTEM_ROLES, AGENT_DEFAULT_PERMISSIONS } = require('@/modules/rbac/rbac.catalog');
const {
  authenticateToken,
  authorizePermission,
  authorizeAnyPermission,
  authorizeAllPermissions,
  authorizeRole,
} = require('@/middleware/auth');
const authController = require('@/modules/auth/auth.controller');
const authService = require('@/modules/auth/auth.service');

const TEST_ADMIN_EMAIL = 'rbac_test_admin@nibbank.test';
const TEST_AGENT_EMAIL = 'rbac_test_agent@nibbank.test';
const TEST_CUSTOM_USER_EMAIL = 'rbac_test_custom@nibbank.test';

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✅ PASS  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`);
  failed++;
}

function assert(cond, label, detail = '') {
  cond ? pass(label) : fail(label, detail);
}

function createMockReqRes(options = {}) {
  let statusCode = 200;
  let responseData = null;
  const req = {
    cookies: options.cookies || {},
    headers: options.headers || {},
    body: options.body || {},
    user: options.user || null,
    userRoles: options.userRoles || null,
    userPermissions: options.userPermissions || null,
    ip: '127.0.0.1',
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    cookie(name, val, opts) {
      req.cookies[name] = val;
      return this;
    },
    clearCookie(name, opts) {
      delete req.cookies[name];
      return this;
    },
  };
  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData,
  };
}

async function setupTestData() {
  await cleanupTestData();

  // 1. Create Test Agent
  const agentRow = await prisma.agent.create({
    data: {
      name: 'RBAC Agent Test',
      phone: '0911002233',
      email: TEST_AGENT_EMAIL,
      referral_code: 'NIB-RBAC-01',
      status: 'APPROVED',
    },
  });

  const agentUser = await prisma.user.create({
    data: {
      username: TEST_AGENT_EMAIL,
      email: TEST_AGENT_EMAIL,
      password_hash: await bcrypt.hash('AgentPass123!', 10),
      role: 'AGENT',
      agent_id: agentRow.id,
      isActivated: true,
      tokenVersion: 0,
    },
  });

  // Assign AGENT role in user_roles
  await assignRoleToUser(agentUser.id, SYSTEM_ROLES.AGENT);

  // 2. Create Test Admin
  const adminUser = await prisma.user.create({
    data: {
      username: TEST_ADMIN_EMAIL,
      email: TEST_ADMIN_EMAIL,
      password_hash: await bcrypt.hash('AdminPass123!', 10),
      role: 'ADMIN',
      isActivated: true,
      tokenVersion: 0,
    },
  });

  // Assign ADMIN role in user_roles
  await assignRoleToUser(adminUser.id, SYSTEM_ROLES.ADMIN);

  // 3. Create Custom Test User
  const customUser = await prisma.user.create({
    data: {
      username: TEST_CUSTOM_USER_EMAIL,
      email: TEST_CUSTOM_USER_EMAIL,
      password_hash: await bcrypt.hash('CustomPass123!', 10),
      role: 'AGENT',
      isActivated: true,
      tokenVersion: 0,
    },
  });

  return { agentRow, agentUser, adminUser, customUser };
}

async function cleanupTestData() {
  const users = await prisma.user.findMany({
    where: { username: { in: [TEST_AGENT_EMAIL, TEST_ADMIN_EMAIL, TEST_CUSTOM_USER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map(u => u.id);

  if (userIds.length > 0) {
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.agent.deleteMany({
    where: { email: { in: [TEST_AGENT_EMAIL, TEST_ADMIN_EMAIL, TEST_CUSTOM_USER_EMAIL] } },
  });

  // Clean any test custom roles
  const customRole = await prisma.role.findUnique({ where: { name: 'TEST_FINANCE_SPECIALIST' } });
  if (customRole) {
    await prisma.rolePermission.deleteMany({ where: { roleId: customRole.id } });
    await prisma.userRole.deleteMany({ where: { roleId: customRole.id } });
    await prisma.role.delete({ where: { id: customRole.id } });
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('   NIB Bank Referral System — Dynamic Relational RBAC Test Suite    ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let testContext;
  try {
    testContext = await setupTestData();
    const { agentRow, agentUser, adminUser, customUser } = testContext;

    // ── TEST 1: Admin Dynamic Role & Permission Resolution ────────────────────────
    console.log('[1] Admin Dynamic Role & Permission Resolution');
    const adminRes = await resolveUserRolesAndPermissions(adminUser.id);
    assert(
      adminRes.roles.includes('ADMIN'),
      'Admin user resolves role ADMIN from relational table'
    );
    assert(
      adminRes.permissions.length === 17 &&
      adminRes.permissions.includes(PERMISSIONS.MANAGE_ROLES) &&
      adminRes.permissions.includes(PERMISSIONS.MANAGE_FINANCE),
      'Admin user has all 17 full system permissions'
    );

    // ── TEST 2: Agent Scoped Permissions & Separation of Viewing vs Managing ─────
    console.log('\n[2] Agent Scoped Permissions & Viewing vs Managing Separation');
    const agentRes = await resolveUserRolesAndPermissions(agentUser.id);
    assert(
      agentRes.roles.includes('AGENT'),
      'Agent user resolves role AGENT from relational table'
    );
    assert(
      agentRes.permissions.includes(PERMISSIONS.VIEW_DASHBOARD) &&
      agentRes.permissions.includes(PERMISSIONS.VIEW_REFERRALS) &&
      agentRes.permissions.includes(PERMISSIONS.VIEW_CAMPAIGNS) &&
      agentRes.permissions.includes(PERMISSIONS.VIEW_AGENTS),
      'Agent user has 4 read-only permissions'
    );
    assert(
      !agentRes.permissions.includes(PERMISSIONS.MANAGE_AGENTS) &&
      !agentRes.permissions.includes(PERMISSIONS.MANAGE_ROLES) &&
      !agentRes.permissions.includes(PERMISSIONS.VIEW_FINANCE) &&
      !agentRes.permissions.includes(PERMISSIONS.MANAGE_FINANCE),
      'Agent user strictly lacks management and finance permissions'
    );

    // ── TEST 3: Auth Controller Login and Me Return Roles & Permissions ──────────
    console.log('\n[3] Auth Controller Login & Me Contract Verification');
    const mockLogin = createMockReqRes({
      body: { username: TEST_ADMIN_EMAIL, password: 'AdminPass123!' },
    });
    await authController.login(mockLogin.req, mockLogin.res, (err) => { if (err) throw err; });
    const loginData = mockLogin.getData();
    assert(
      mockLogin.getStatusCode() === 200 &&
      loginData.user.roles.includes('ADMIN') &&
      loginData.user.role === 'ADMIN' &&
      Array.isArray(loginData.user.permissions) &&
      loginData.user.permissions.length === 17,
      'POST /api/auth/login returns user with role, roles[], and permissions[]'
    );

    const adminCookie = mockLogin.req.cookies[authService.COOKIE_NAME];
    const mockMe = createMockReqRes({
      cookies: { [authService.COOKIE_NAME]: adminCookie },
    });
    await authController.me(mockMe.req, mockMe.res, (err) => { if (err) throw err; });
    const meData = mockMe.getData();
    assert(
      mockMe.getStatusCode() === 200 &&
      meData.roles.includes('ADMIN') &&
      meData.permissions.length === 17,
      'GET /api/auth/me returns user with roles[] and dynamic permissions[]'
    );

    // ── TEST 4: authenticateToken Middleware Populates DB Permissions ────────────
    console.log('\n[4] authenticateToken Middleware Verification');
    const mockAuthReq = createMockReqRes({
      cookies: { [authService.COOKIE_NAME]: adminCookie },
    });
    let authNextCalled = false;
    await authenticateToken(mockAuthReq.req, mockAuthReq.res, (err) => {
      if (!err) authNextCalled = true;
    });
    assert(
      authNextCalled &&
      mockAuthReq.req.user.roles.includes('ADMIN') &&
      mockAuthReq.req.userPermissions.has(PERMISSIONS.MANAGE_ROLES),
      'authenticateToken successfully resolves and attaches DB permissions to req'
    );

    // ── TEST 5: Missing Permission Receives 403 FORBIDDEN ─────────────────────────
    console.log('\n[5] Authorization Middleware Missing Permission Guard');
    const agentToken = authService.signToken({
      id: agentUser.id,
      role: 'AGENT',
      agent_id: agentRow.id,
      token_version: agentUser.tokenVersion,
    });
    const mockAgentAuth = createMockReqRes({
      cookies: { [authService.COOKIE_NAME]: agentToken },
    });
    await authenticateToken(mockAgentAuth.req, mockAgentAuth.res, () => {});

    const mockDenial = createMockReqRes({
      user: mockAgentAuth.req.user,
      userPermissions: mockAgentAuth.req.userPermissions,
    });
    let denialNextCalled = false;
    const authorizeRoleMgr = authorizePermission(PERMISSIONS.MANAGE_ROLES);
    await authorizeRoleMgr(mockDenial.req, mockDenial.res, () => {
      denialNextCalled = true;
    });
    assert(
      !denialNextCalled &&
      mockDenial.getStatusCode() === 403 &&
      mockDenial.getData()?.code === 'FORBIDDEN',
      'authorizePermission blocks Agent from manage_roles with 403 FORBIDDEN'
    );

    // ── TEST 6: Unauthenticated Request Handling (401 NO_TOKEN / NO_USER) ────────
    console.log('\n[6] Unauthenticated Request Guards');
    const mockNoToken = createMockReqRes();
    let noTokenNext = false;
    await authenticateToken(mockNoToken.req, mockNoToken.res, () => { noTokenNext = true; });
    assert(
      !noTokenNext &&
      mockNoToken.getStatusCode() === 401 &&
      mockNoToken.getData()?.code === 'NO_TOKEN',
      'authenticateToken blocks request without token with 401 NO_TOKEN'
    );

    const mockNoUser = createMockReqRes();
    let noUserNext = false;
    await authorizeRoleMgr(mockNoUser.req, mockNoUser.res, () => { noUserNext = true; });
    assert(
      !noUserNext &&
      mockNoUser.getStatusCode() === 401 &&
      mockNoUser.getData()?.code === 'NO_USER',
      'authorizePermission blocks request with missing req.user with 401 NO_USER'
    );

    // ── TEST 7: Suspended Agent Blocked with 403 ACCOUNT_SUSPENDED ────────────────
    console.log('\n[7] Suspended Agent Guard (SEC-P1-01)');
    await prisma.agent.update({
      where: { id: agentRow.id },
      data: { status: 'SUSPENDED' },
    });
    const mockSuspended = createMockReqRes({
      cookies: { [authService.COOKIE_NAME]: agentToken },
    });
    let suspendedNext = false;
    await authenticateToken(mockSuspended.req, mockSuspended.res, () => { suspendedNext = true; });
    assert(
      !suspendedNext &&
      mockSuspended.getStatusCode() === 403 &&
      mockSuspended.getData()?.code === 'ACCOUNT_SUSPENDED',
      'authenticateToken blocks suspended agent with 403 ACCOUNT_SUSPENDED'
    );
    // Restore agent status
    await prisma.agent.update({
      where: { id: agentRow.id },
      data: { status: 'APPROVED' },
    });

    // ── TEST 8: Dynamic DB Permission Revocation Takes Effect Immediately ─────────
    console.log('\n[8] Dynamic DB Permission Revocation Without Re-Login');
    // Assign custom role with view_finance to agentUser
    const testRole = await createRole('TEST_FINANCE_SPECIALIST', 'Temporary role for testing', false);
    await addPermissionToRole(testRole.id, PERMISSIONS.VIEW_FINANCE);
    await assignRoleToUser(agentUser.id, testRole.id);

    // Verify view_finance is active on agent
    const beforeRevocation = await resolveUserRolesAndPermissions(agentUser.id);
    assert(
      beforeRevocation.permissions.includes(PERMISSIONS.VIEW_FINANCE),
      'User immediately gains view_finance via newly assigned role in DB'
    );

    // Revoke permission from role in the database
    await removePermissionFromRole(testRole.id, PERMISSIONS.VIEW_FINANCE);

    // Re-resolve permissions for the SAME user without changing their token or logging in
    const afterRevocation = await resolveUserRolesAndPermissions(agentUser.id);
    assert(
      !afterRevocation.permissions.includes(PERMISSIONS.VIEW_FINANCE),
      'Revoking permission from role in DB takes effect immediately without re-login'
    );

    // ── TEST 9: Multiple Roles per User & Permissions Union ───────────────────────
    console.log('\n[9] Multiple Roles Support & Permission Union');
    // Re-add view_finance and view_logs
    await addPermissionToRole(testRole.id, PERMISSIONS.VIEW_FINANCE);
    await addPermissionToRole(testRole.id, PERMISSIONS.VIEW_LOGS);
    const multiRoleRes = await resolveUserRolesAndPermissions(agentUser.id);
    assert(
      multiRoleRes.roles.includes('AGENT') &&
      multiRoleRes.roles.includes('TEST_FINANCE_SPECIALIST') &&
      multiRoleRes.permissions.includes(PERMISSIONS.VIEW_REFERRALS) &&
      multiRoleRes.permissions.includes(PERMISSIONS.VIEW_FINANCE) &&
      multiRoleRes.permissions.includes(PERMISSIONS.VIEW_LOGS) &&
      !multiRoleRes.permissions.includes(PERMISSIONS.MANAGE_FINANCE),
      'User with multiple roles gets seamless union of all permissions with zero privilege escalation'
    );

    // ── TEST 10: authorizeAnyPermission & authorizeAllPermissions Middleware ──────
    console.log('\n[10] Composite Permission Middleware Verification');
    const mockPermReq = createMockReqRes({
      user: { id: agentUser.id },
      userPermissions: new Set(multiRoleRes.permissions),
    });

    let anyPassed = false;
    const testAny = authorizeAnyPermission([PERMISSIONS.MANAGE_USERS, PERMISSIONS.VIEW_FINANCE]);
    await testAny(mockPermReq.req, mockPermReq.res, () => { anyPassed = true; });
    assert(anyPassed, 'authorizeAnyPermission succeeds when user has 1 of the required permissions');

    let allPassed = false;
    const mockAllRes = createMockReqRes({
      user: { id: agentUser.id },
      userPermissions: new Set(multiRoleRes.permissions),
    });
    const testAll = authorizeAllPermissions([PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE]);
    await testAll(mockAllRes.req, mockAllRes.res, () => { allPassed = true; });
    assert(
      !allPassed &&
      mockAllRes.getStatusCode() === 403 &&
      mockAllRes.getData()?.code === 'FORBIDDEN',
      'authorizeAllPermissions denies with 403 when user lacks 1 of the required permissions'
    );

    // ── TEST 11: System Role Deletion Guard ───────────────────────────────────────
    console.log('\n[11] System Role Deletion Guard');
    let deletionBlocked = false;
    try {
      await deleteRole(SYSTEM_ROLES.ADMIN);
    } catch (err) {
      if (err.code === 'CANNOT_DELETE_SYSTEM_ROLE') {
        deletionBlocked = true;
      }
    }
    assert(deletionBlocked, 'deleteRole rejects deletion of system role ADMIN with CANNOT_DELETE_SYSTEM_ROLE');

    // ── TEST 12: Audit Logging Verification ──────────────────────────────────────
    console.log('\n[12] Audit Logging Verification');
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'USER_ROLE',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    assert(
      auditLogs.length > 0 &&
      auditLogs.some(l => l.action === 'ROLE_ASSIGNED'),
      'Audit log records ROLE_ASSIGNED events in the database'
    );

    // ── TEST 13: Backward Compatibility with Legacy Role Column ──────────────────
    console.log('\n[13] Backward Compatibility Fallback');
    // Create an unmapped legacy user (no userRoles row)
    const legacyUser = await prisma.user.create({
      data: {
        username: 'legacy_agent_test@nibbank.test',
        email: 'legacy_agent_test@nibbank.test',
        password_hash: 'hash',
        role: 'AGENT',
      },
    });
    const legacyRes = await resolveUserRolesAndPermissions(legacyUser.id);
    assert(
      legacyRes.roles.includes('AGENT') &&
      legacyRes.permissions.includes(PERMISSIONS.VIEW_DASHBOARD),
      'Unmapped user seamlessly falls back to legacy role column and gets standard default permissions'
    );
    // Cleanup legacy user
    await prisma.user.delete({ where: { id: legacyUser.id } });

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await cleanupTestData();
    await prisma.$disconnect();
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  Tests completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests();
