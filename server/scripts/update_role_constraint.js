'use strict';

require('module-alias/register');
const prisma = require('@/config/db');

async function migrate() {
  console.log('Updating chk_users_role constraint...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
    ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'AGENT', 'STAFF'));
  `);
  console.log('Constraint updated successfully to allow ADMIN, AGENT, STAFF.');
  await prisma.$disconnect();
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});

