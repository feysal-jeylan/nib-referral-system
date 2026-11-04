/**
 * server/index.js
 * ───────────────────────────────────────────────────────────────────────────
 * Entry point for the Nib Bank Referral System Express server.
 *
 * IMPORTANT: 'module-alias/register' MUST be the first require() so that
 * the '@/' path alias is registered before any module that uses it is loaded.
 *
 * Architecture (Phase 3 MVC refactor):
 *   Campaigns module  → src/modules/campaigns/campaigns.routes.js  ✅ migrated
 *   Auth module       → routes/auth.js                             (pending)
 *   Agents module     → routes/agents.js                           (pending)
 *   Referrals module  → routes/referrals.js                        (pending)
 *   Integration module→ routes/integration.js                      (pending)
 *
 * Middleware:
 *   helmet       — secure HTTP headers
 *   cors         — restrict origin to Vite dev server (credentials: true)
 *   cookieParser — populate req.cookies for HttpOnly JWT auth
 *   express.json — parse JSON request bodies
 *
 * Security: JWT in HttpOnly, SameSite=Lax cookie — no token in JS memory.
 */

'use strict';

// ── MUST be first — registers '@/' alias for all subsequent requires ──────────
require('module-alias/register');

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Prisma singleton — warms up the connection pool on startup.
// Legacy path kept for the remaining unmigrated routes.
const prisma = require('./db-prisma');

// ── Route Imports ─────────────────────────────────────────────────────────────

// ✅ MVC module (Phase 3)
const campaignsRouter   = require('@/modules/campaigns/campaigns.routes');

// ⏳ Legacy flat routes (to be migrated in subsequent phases)
const agentsRouter      = require('./routes/agents');
const referralsRouter   = require('./routes/referrals');
const authRouter        = require('./routes/auth');
const integrationRouter = require('./routes/integration');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin:         'http://localhost:5173',
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));

app.use(cookieParser());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * No auth required — used by healthchecks and smoke tests.
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status:    'ok',
    message:   'Referral API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth',        authRouter);
app.use('/api/agents',      agentsRouter);
app.use('/api/referrals',   referralsRouter);
app.use('/api/campaigns',   campaignsRouter);   // ✅ MVC module
app.use('/api/integration', integrationRouter);

// ── Error Handling ────────────────────────────────────────────────────────────

// 404 — must come AFTER all valid routes
app.use((req, res) => {
  res.status(404).json({
    error: 'The requested resource was not found.',
    code:  'NOT_FOUND',
  });
});

// Global error handler (4-param signature required by Express)
// RULES.md §3: NEVER expose raw DB errors or stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected server error occurred.',
    code:  err.code    || 'INTERNAL_SERVER_ERROR',
  });
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[referral-api] Server running  -> http://localhost:${PORT}`);
  console.log(`[referral-api] Health check    -> http://localhost:${PORT}/api/health`);

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[referral-api] Prisma connected to PostgreSQL successfully.');
  } catch (err) {
    console.error('[referral-api] Prisma DB connection FAILED:', err.message);
    console.error('[referral-api] Check DATABASE_URL in .env and ensure PostgreSQL is running.');
  }
});
