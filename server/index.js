/**
 * server/index.js
 * ───────────────────────────────────────────────────────────────────────────
 * Entry point for the Nib Bank Referral System Express server.
 *
 * IMPORTANT: 'module-alias/register' MUST be the very first require() so the
 * '@/' alias is registered before any module that uses it is loaded.
 *
 * Phase 3b (complete) — all routes now use MVC modules under src/modules/:
 *   /api/auth        → src/modules/auth/auth.routes.js
 *   /api/agents      → src/modules/agents/agents.routes.js
 *   /api/referrals   → src/modules/referrals/referrals.routes.js
 *   /api/campaigns   → src/modules/campaigns/campaigns.routes.js
 *   /api/integration → src/modules/integration/integration.routes.js
 *
 * The legacy routes/ folder has been removed. All imports use the '@/' alias.
 *
 * Security:
 *   helmet       — secure HTTP headers
 *   cors         — restrict origin to Vite dev server (credentials: true)
 *   cookieParser — populate req.cookies for HttpOnly JWT auth
 *   express.json — parse JSON request bodies
 */

'use strict';

// ── MUST be first — registers '@/' → './src' alias ────────────────────────────
require('module-alias/register');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Prisma singleton — warms up the connection pool on startup.
const prisma = require('@/config/db');

// ── Route Imports (all via @/ alias) ─────────────────────────────────────────
const authRouter        = require('@/modules/auth/auth.routes');
const agentsRouter      = require('@/modules/agents/agents.routes');
const referralsRouter   = require('@/modules/referrals/referrals.routes');
const campaignsRouter   = require('@/modules/campaigns/campaigns.routes');
const integrationRouter = require('@/modules/integration/integration.routes');
const dashboardRouter   = require('@/modules/dashboard/dashboard.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());

// credentials:true + explicit origin required for HttpOnly cookie cross-port flow
// (Vite :5173 → API :3000)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
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
    status: 'ok',
    message: 'Referral API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth',        authRouter);
app.use('/api/agents',      agentsRouter);
app.use('/api/referrals',   referralsRouter);
app.use('/api/campaigns',   campaignsRouter);
app.use('/api/integration', integrationRouter);
app.use('/api/dashboard',   dashboardRouter);

// ── Error Handling ────────────────────────────────────────────────────────────

// 404 — must come AFTER all valid routes
app.use((req, res) => {
  res.status(404).json({
    error: 'The requested resource was not found.',
    code: 'NOT_FOUND',
  });
});

// Global error handler (4-param signature required by Express)
// RULES.md §3: NEVER expose raw DB errors or stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected server error occurred.',
    code: err.code || 'INTERNAL_SERVER_ERROR',
  });
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[referral-api] Server running  -> http://localhost:${PORT}`);
  console.log(`[referral-api] Health check    -> http://localhost:${PORT}/api/health`);

  try {
    // prisma.$queryRaw is NOT supported with the @prisma/adapter-pg driver adapter
    // in Prisma v7 — it fails silently with an empty invocation error.
    // prisma.$connect() is the correct way to verify the connection when using
    // a driver adapter; it exercises the actual pg Pool without raw SQL.
    await prisma.$connect();
    console.log('[referral-api] Prisma connected to PostgreSQL successfully.');
  } catch (err) {
    console.error('[referral-api] Prisma DB connection FAILED:', err.message);
    console.error('[referral-api] Check DATABASE_URL in .env and ensure PostgreSQL is running.');
  }
});
