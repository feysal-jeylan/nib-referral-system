/**
 * src/config/db.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton PrismaClient — Prisma v7 driver-adapter pattern.
 * Moved from server root (db-prisma.js) into src/config/ as part of MVC refactor.
 *
 * All modules import from '@/config/db' (via module-alias).
 * Node's require cache guarantees a single PrismaClient instance process-wide.
 */

'use strict';

const { Pool }         = require('pg');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Graceful shutdown — prevents "too many connections" on Ctrl+C / SIGTERM
const shutdown = async (signal) => {
  console.log(`[Prisma] ${signal} received — disconnecting PrismaClient…`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = prisma;

