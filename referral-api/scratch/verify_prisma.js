'use strict';
// Run from: referral-api directory
// node scratch/verify_prisma.js

const path   = require('path');
const apiDir = 'c:\\Users\\feysa\\OneDrive\\Desktop\\referral-system\\referral-api';

// Load env from referral-api/.env
require(path.join(apiDir, 'node_modules', 'dotenv')).config({
  path: path.join(apiDir, '.env'),
});

const prisma = require(path.join(apiDir, 'db-prisma'));

console.log('✅ db-prisma.js loaded — type:', typeof prisma);
console.log('✅ prisma.campaign exists:', typeof prisma.campaign);
console.log('✅ prisma.agent    exists:', typeof prisma.agent);
console.log('✅ prisma.campaignRule exists:', typeof prisma.campaignRule);

// Live DB query
prisma.campaign.count()
  .then(count => {
    console.log('✅ DB connection OK — campaign count:', Number(count));
    return prisma.campaign.findMany({
      take: 1,
      include: { rules: true },
      orderBy: { created_at: 'desc' },
    });
  })
  .then(rows => {
    console.log('✅ findMany works — first campaign:', JSON.stringify(rows[0] ?? null, null, 2));
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
  })
  .finally(() => {
    prisma.$disconnect().then(() => process.exit(0));
  });

