/**
 * referral-api/index.js
 * ---------------------
 * Entry point for the Nib Bank Referral System Express server.
 *
 * What each middleware does:
 *  - helmet        : Sets secure HTTP headers (hides "X-Powered-By: Express", etc.).
 *  - cors          : Allows only the React dev server to call this API (with credentials).
 *                    'credentials: true' is required for the browser to send/receive cookies
 *                    on cross-origin requests (Vite :5173 -> API :3000).
 *  - cookieParser  : Parses the Cookie header so req.cookies.token is available to middleware.
 *  - express.json(): Parses incoming JSON request bodies (req.body).
 *
 * Database:
 *  - All database access goes through db-prisma.js (Prisma v7 + @prisma/adapter-pg).
 *  - db.js (raw pg Pool) has been removed — Prisma is the sole DB layer.
 *
 * Authentication: JWT stored in an HttpOnly, SameSite=Lax cookie.
 * See routes/auth.js and middleware/authMiddleware.js for full details.
 */

'use strict';

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Prisma singleton — imported here so the connection pool warms up on startup.
// All routes import from the same singleton; Node's require cache ensures only
// one PrismaClient instance is ever created across the whole process.
const prisma = require('./db-prisma');

// ── Route Imports ─────────────────────────────────────────────────────────────
const agentsRouter      = require('./routes/agents');
const referralsRouter   = require('./routes/referrals');
const authRouter        = require('./routes/auth');
const campaignsRouter   = require('./routes/campaigns');    // Campaign Management
const integrationRouter = require('./routes/integration');  // Core Banking Webhook

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ───────────────────────────────────────────────────────

app.use(helmet());

// cors() restricts which origins can call this API.
// credentials: true — REQUIRED for the browser to send cookies on cross-origin
// requests (Vite :5173 -> API :3000). Origin must be an explicit URL (not '*')
// when credentials: true is set.
app.use(cors({
  origin:         'http://localhost:5173',
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));

// cookieParser populates req.cookies — must come BEFORE auth middleware.
app.use(cookieParser());

// Parse JSON bodies — required for POST/PUT endpoints.
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Simple health-check endpoint — no auth required.
 * Returns 200 OK with a JSON status message.
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
app.use('/api/campaigns',   campaignsRouter);
app.use('/api/integration', integrationRouter);

// ── Error Handling ────────────────────────────────────────────────────────────

// 404 handler — must come AFTER all valid routes.
app.use((req, res) => {
  res.status(404).json({
    error: 'The requested resource was not found.',
    code:  'NOT_FOUND',
  });
});

// Global error handler — catches errors forwarded via next(err).
// Per RULES.md §3: NEVER expose raw DB errors or stack traces to the client.
// 4-parameter signature tells Express this is an error handler.
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

  // Verify Prisma can reach the database on startup.
  // A failed ping means DATABASE_URL is wrong or Postgres is down —
  // clearer than a cryptic failure on the first API call.
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[referral-api] Prisma connected to PostgreSQL successfully.');
  } catch (err) {
    console.error('[referral-api] Prisma DB connection FAILED:', err.message);
    console.error('[referral-api] Check DATABASE_URL in .env and ensure PostgreSQL is running.');
  }
});
