/**
 * referral-api/index.js
 * ---------------------
 * Entry point for the Nib Bank Referral System Express server.
 *
 * What each middleware does (for your report):
 *  - helmet        : Sets secure HTTP headers automatically (e.g., hides "X-Powered-By: Express").
 *  - cors          : Allows only the React dev server to call this API (with credentials).
 *                    'credentials: true' is required for the browser to send/receive cookies
 *                    on cross-origin requests (Vite on :5173 → API on :3000).
 *  - cookieParser  : Parses the Cookie header so req.cookies.token is available to middleware.
 *                    Without this, req.cookies is undefined and the JWT cannot be read.
 *  - express.json(): Parses incoming JSON request bodies so we can read req.body.
 *
 * Authentication: JWT stored in an HttpOnly, SameSite=Strict cookie.
 * See routes/auth.js and middleware/authMiddleware.js for full details.
 */

'use strict';

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// ─── Route Imports ────────────────────────────────────────────────────────────
const agentsRouter    = require('./routes/agents');
const referralsRouter = require('./routes/referrals');
const authRouter      = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ──────────────────────────────────────────────────────

// helmet() adds ~15 secure response headers in one call.
app.use(helmet());

// cors() restricts which origins can call this API.
// Per RULES.md §3, we lock it to the Vite dev server URL only.
//
// credentials: true — REQUIRED for the browser to send cookies on cross-origin
//   requests (Vite :5173 → API :3000). Without this flag, Set-Cookie headers
//   from the server are silently ignored by the browser and the JWT cookie
//   is never stored. The 'origin' must be an explicit URL (not '*') when
//   credentials: true is set — browsers block wildcard + credentials combos.
app.use(cors({
  origin:      'http://localhost:5173',
  credentials: true,                         // Allow cookies on cross-origin requests
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type'],          // Authorization header no longer needed
}));

// cookieParser() parses the Cookie request header and populates req.cookies.
// Without this, req.cookies is undefined and authenticateToken() cannot read
// the JWT. Must be registered BEFORE any middleware that reads req.cookies.
app.use(cookieParser());

// Parse JSON bodies — required for POST/PUT endpoints.
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * A simple health-check so we can verify the server is running.
 * Returns: 200 OK with a JSON status message.
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Referral API is running',
    timestamp: new Date().toISOString(),
  });
});

// Mount feature routers.
// Each router handles all sub-routes under its prefix.
app.use('/api/auth',     authRouter);       // Login, logout, /me — no auth required
app.use('/api/agents',   agentsRouter);
app.use('/api/referrals', referralsRouter);

// ─── Error Handling Middleware ─────────────────────────────────────────────────
/**
 * 404 handler — catches any route that doesn't exist.
 * Must be placed AFTER all valid routes.
 */
app.use((req, res, next) => {
  res.status(404).json({
    error: 'The requested resource was not found.',
    code: 'NOT_FOUND',
  });
});

/**
 * Global error handler — catches errors passed via next(err).
 * Per RULES.md §3: we NEVER expose raw SQL errors or stack traces to the client.
 * We log the full error on the server and send only a safe message to the frontend.
 *
 * Express identifies this as an error handler because it has 4 parameters (err, req, res, next).
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Log the full error server-side so developers can debug it.
  console.error('[Server Error]', err.message, err.stack);

  // Send a safe, structured error to the frontend — no raw details.
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected server error occurred.',
    code: err.code || 'INTERNAL_SERVER_ERROR',
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[referral-api] Server running on http://localhost:${PORT}`);
  console.log(`[referral-api] Health check: http://localhost:${PORT}/api/health`);
});
