/**
 * referral-api/routes/referrals.js
 * ----------------------------------
 * Router for all /api/referrals endpoints.
 *
 * V2 Architecture (approved by supervisor — RULES.md §6):
 *   Customers are NO LONGER registered manually through this API.
 *   All customer referrals arrive exclusively via the Temenos webhook
 *   (POST /api/integration/account-opened). The POST /api/referrals route
 *   has been permanently removed in this commit.
 *
 * Remaining endpoints:
 *   GET   /api/referrals            — List referrals (ADMIN: all, AGENT: own only).
 *   PATCH /api/referrals/:id/status — Approve or reject a referral (ADMIN only).
 *
 * V8 (Prisma migration):
 *   All raw pool.query() calls replaced with Prisma Client methods.
 *   Response shapes are identical to the raw-SQL version.
 *
 * Per RULES.md §2 & §3:
 *   - Prisma uses parameterised queries internally — no string concatenation.
 *   - Raw DB/Prisma errors are never sent to the client.
 *   - All inputs are validated server-side before touching the database.
 */

'use strict';

const express = require('express');
const prisma  = require('../db-prisma');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/referrals — requires authentication (any role).
//
// RBAC filtering:
//   ADMIN  → returns ALL referrals.
//   AGENT  → returns ONLY referrals where agent_id = req.user.agent_id.
//
// Pagination per RULES.md §7:
//   ?page=1&limit=20   (defaults: page=1, limit=20, max limit=100)
//
// Success response — 200 OK:
//   {
//     "total": 42,
//     "page": 1,
//     "limit": 20,
//     "referrals": [
//       {
//         "id":             7,
//         "customer_name":  "Tigist Alemu",
//         "customer_phone": "0922345678",
//         "agent_name":     "Abebe Kebede",
//         "referral_code":  "NIB-X7KP2A",
//         "status":         "PENDING",
//         "created_at":     "2026-10-25T08:00:00.000Z"
//       },
//       ...
//     ]
//   }
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    // ── Pagination ────────────────────────────────────────────────────────────
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    // ── RBAC: build Prisma `where` clause based on caller's role ─────────────
    // ADMIN  → {} (no restriction — see all referrals)
    // AGENT  → { agent_id: req.user.agent_id } (own referrals only)
    const where = req.user.role === 'AGENT'
      ? { agent_id: req.user.agent_id }
      : {};

    // ── Count + data in a single DB round-trip ────────────────────────────────
    const [total, rows] = await prisma.$transaction([
      prisma.referral.count({ where }),
      prisma.referral.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { created_at: 'desc' },
        // Include the agent so we can expose agent_name and referral_code
        // in the response — matching the old LEFT JOIN agents behaviour.
        include: {
          agent: {
            select: { name: true, referral_code: true },
          },
        },
      }),
    ]);

    // ── Shape response to match existing raw-SQL format ───────────────────────
    // Old format: { id, customer_name, customer_phone, agent_name,
    //               referral_code, status, created_at }
    // Prisma nests agent fields under `agent`; flatten them here.
    const referrals = rows.map(r => ({
      id:             r.id,
      customer_name:  r.customer_name,
      customer_phone: r.customer_phone,
      agent_name:     r.agent?.name    ?? null,
      referral_code:  r.agent?.referral_code ?? null,
      status:         r.status,
      created_at:     r.created_at,
    }));

    return res.status(200).json({
      total:     Number(total),
      page,
      limit,
      referrals,
    });

  } catch (err) {
    console.error('[GET /api/referrals] Prisma error:', err.message);
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/referrals/:id/status — ADMIN only: approve or reject a referral.
//
// Request body (JSON):
//   { "status": "SUCCESSFUL" }   or   { "status": "REJECTED" }
//
// Callers CANNOT set status back to 'PENDING'.
//
// Success response — 200 OK:
//   {
//     "referral_id":    7,
//     "agent_id":       3,
//     "customer_name":  "Tigist Alemu",
//     "customer_phone": "0922345678",
//     "status":         "SUCCESSFUL",
//     "created_at":     "2026-10-25T08:00:00.000Z"
//   }
//
// Error responses:
//   400 Bad Request — status is missing or not one of the allowed values
//   400 Bad Request — :id is not a valid integer
//   404 Not Found   — no referral row exists with the given :id
//   500 Server Error — unexpected DB failure
// ---------------------------------------------------------------------------
router.patch('/:id/status', authenticateToken, authorizeRole(['ADMIN']), async (req, res, next) => {
  // ── Step 1: Parse and validate the URL parameter ──────────────────────────
  const referralId = parseInt(req.params.id, 10);

  if (isNaN(referralId)) {
    return res.status(400).json({
      error: 'Referral ID must be a valid integer.',
      code:  'INVALID_ID',
    });
  }

  // ── Step 2: Validate the status value ────────────────────────────────────
  const ALLOWED_STATUSES = ['SUCCESSFUL', 'REJECTED'];
  const status = req.body.status?.trim().toUpperCase();

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}.`,
      code:  'INVALID_STATUS',
    });
  }

  try {
    // ── Step 3: Update and return the row ────────────────────────────────────
    // Prisma's update() throws P2025 (RecordNotFound) if id doesn't exist —
    // we catch that specifically to return a clean 404.
    const updated = await prisma.referral.update({
      where: { id: referralId },
      data:  { status },
      select: {
        id:             true,
        agent_id:       true,
        customer_name:  true,
        customer_phone: true,
        status:         true,
        created_at:     true,
      },
    });

    return res.status(200).json({
      referral_id:    updated.id,
      agent_id:       updated.agent_id,
      customer_name:  updated.customer_name,
      customer_phone: updated.customer_phone,
      status:         updated.status,
      created_at:     updated.created_at,
    });

  } catch (err) {
    // P2025 = "Record to update not found."
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: `Referral with id ${referralId} not found.`,
        code:  'REFERRAL_NOT_FOUND',
      });
    }
    console.error('[PATCH /api/referrals/:id/status] Prisma error:', err.message);
    next(err);
  }
});

module.exports = router;
