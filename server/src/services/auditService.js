/**
 * src/services/auditService.js
 * ────────────────────────────
 * Reusable audit logging service for security-sensitive operations.
 * Never logs passwords, access tokens, or sensitive credentials.
 */

'use strict';

const prisma = require('@/config/db');

async function logAuditEvent({ userId = null, action, entity, entityId = null, details = null, ipAddress = null }) {
  try {
    let sanitizedDetails = null;
    if (details && typeof details === 'object') {
      sanitizedDetails = { ...details };
      delete sanitizedDetails.password;
      delete sanitizedDetails.newPassword;
      delete sanitizedDetails.password_hash;
      delete sanitizedDetails.token;
      delete sanitizedDetails.rawToken;
      delete sanitizedDetails.passwordResetToken;
      delete sanitizedDetails.activationToken;
    }

    return await prisma.auditLog.create({
      data: {
        userId: userId ? Number(userId) : null,
        action: String(action),
        entity: String(entity),
        entityId: entityId ? String(entityId) : null,
        details: sanitizedDetails,
        ipAddress: ipAddress ? String(ipAddress).substring(0, 45) : null,
      },
    });
  } catch (err) {
    console.error('[auditService] Failed to write audit log:', err.message);
    return null;
  }
}

module.exports = { logAuditEvent };
