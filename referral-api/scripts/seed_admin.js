/**
 * referral-api/scripts/seed_admin.js
 * ------------------------------------
 * One-time script to create the default ADMIN user.
 *
 * HOW TO RUN (from the referral-api directory):
 *   node scripts/seed_admin.js
 *
 * WHAT IT DOES:
 *   1. Hashes the plaintext password with bcrypt (cost factor 12).
 *   2. Upserts a user row with role='ADMIN' and agent_id=NULL.
 *   3. Uses Prisma upsert so re-running the script is always safe —
 *      it will NOT overwrite an existing admin or throw an error.
 *
 * SECURITY NOTE:
 *   Change the default password immediately after first login in production.
 */

'use strict';

const path   = require('path');
// Load .env from the referral-api root (one level up from scripts/)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const prisma = require('../db-prisma');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const SALT_ROUNDS    = 12;

async function seedAdmin() {
  console.log('[seed_admin] Starting admin user seed...');

  try {
    console.log(`[seed_admin] Hashing password with cost factor ${SALT_ROUNDS}...`);
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    console.log('[seed_admin] Password hashed successfully.');

    // upsert: create if not exists, do nothing if username already taken.
    const result = await prisma.user.upsert({
      where:  { username: ADMIN_USERNAME },
      update: {},   // already exists → no change
      create: {
        username:             ADMIN_USERNAME,
        password_hash:        passwordHash,
        role:                 'ADMIN',
        agent_id:             null,
        must_change_password: false,
      },
    });

    if (result) {
      console.log('[seed_admin] ✅ Admin user ready.');
      console.log(`[seed_admin]    ID       : ${result.id}`);
      console.log(`[seed_admin]    Username : ${result.username}`);
      console.log(`[seed_admin]    Role     : ${result.role}`);
      console.log('[seed_admin] 🔑 Remember to change the default password after first login!');
    }

  } catch (err) {
    console.error('[seed_admin] ❌ Failed to seed admin user:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('[seed_admin] Database connection closed.');
  }
}

seedAdmin();
