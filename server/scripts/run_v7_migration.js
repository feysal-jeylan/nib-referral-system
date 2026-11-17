/**
 * server/scripts/run_v7_migration.js
 * Executes schema_v7_rbac.sql against PostgreSQL referral_db.
 */
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  console.log('Connecting to PostgreSQL database...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const sqlPath = path.join(__dirname, '../schema_v7_rbac.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing schema_v7_rbac.sql...');
    await pool.query(sql);
    console.log('Migration executed successfully!');

    // Verification queries
    const rolesRes = await pool.query('SELECT id, name, is_system FROM roles ORDER BY id');
    console.log('\nRoles in DB:', rolesRes.rows);

    const permsRes = await pool.query('SELECT COUNT(*) AS total_permissions FROM permissions');
    console.log('Permissions count:', permsRes.rows[0].total_permissions);

    const adminPermsRes = await pool.query(`
      SELECT COUNT(*) AS admin_perm_count
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      WHERE r.name = 'ADMIN'
    `);
    console.log('ADMIN permissions count:', adminPermsRes.rows[0].admin_perm_count);

    const agentPermsRes = await pool.query(`
      SELECT p.key
      FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.name = 'AGENT'
      ORDER BY p.key
    `);
    console.log('AGENT permissions:', agentPermsRes.rows.map(r => r.key));

    const userRolesRes = await pool.query(`
      SELECT u.id AS user_id, u.username, u.role AS legacy_role, r.name AS assigned_role
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      ORDER BY u.id
    `);
    console.log('\nUser Role Assignments:');
    console.table(userRolesRes.rows);

    // Verify all users have at least 1 role
    const unassigned = userRolesRes.rows.filter(r => !r.assigned_role);
    if (unassigned.length > 0) {
      console.error('WARNING: Found users without an assigned role:', unassigned);
      process.exit(1);
    } else {
      console.log('ALL existing users successfully mapped to RBAC roles!');
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
