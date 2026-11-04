/**
 * db-prisma.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton PrismaClient instance — Prisma v7 driver-adapter pattern.
 *
 * Prisma v7 BREAKING CHANGE:
 *   The `url` property inside the `datasource db {}` block of schema.prisma
 *   is no longer supported.  Connection details must instead be passed via:
 *     a) `prisma.config.ts`  (TypeScript projects)
 *     b) A driver adapter passed to the PrismaClient constructor ← used here
 *
 * We use option (b) because this is a CommonJS project (no TypeScript):
 *   1. `pg.Pool` reads DATABASE_URL from the environment and opens a pool.
 *   2. `PrismaPg` wraps that pool as a Prisma-compatible driver adapter.
 *   3. `PrismaClient` receives the adapter and uses it for all queries.
 *
 * Why keep db.js (raw pg) as well?
 *   The webhook route (integration.js) and the campaign DELETE route need
 *   manual BEGIN / COMMIT / ROLLBACK control which Prisma's `$transaction`
 *   API does not expose at the same granularity.  Raw pg stays for those.
 *
 * RULES.md compliance:
 *   §2  Parameterised queries — Prisma handles this natively.
 *   §3  Never expose raw DB errors — callers catch and call next(err).
 */

'use strict';

const { Pool }      = require('pg');
const { PrismaPg }  = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// ── Connection pool ──────────────────────────────────────────────────────────
// DATABASE_URL format:
//   postgresql://postgres:the%20best%4051@localhost:5432/referral_db?schema=public
//
// URL-encoding note: password "the best@51" → space=%20, @=%40
// The connection_limit param is NOT in the URL (Prisma ignores it there);
// we set max on the Pool constructor directly.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // connection pool ceiling
});

// ── Prisma v7 driver adapter ─────────────────────────────────────────────────
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development'
    ? ['warn', 'error']
    : ['error'],
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Disconnect Prisma (and drain the pg pool) when the Node process exits.
// Prevents "too many connections" errors in development (Ctrl+C) and
// in production (SIGTERM from process manager / Docker stop).
const shutdown = async (signal) => {
  console.log(`[Prisma] ${signal} received — disconnecting PrismaClient…`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = prisma;
