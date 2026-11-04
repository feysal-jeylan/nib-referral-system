/**
 * src/services/ruleEngine.js
 * ───────────────────────────────────────────────────────────────────────────
 * Rule Engine — evaluates campaign qualification rules against a webhook payload.
 * Moved from server/services/ruleEngine.js into src/services/ as part of MVC
 * refactor. Import path: '@/services/ruleEngine'.
 *
 * No logic changes — only the import header is updated.
 */

'use strict';

// Re-export the existing rule engine unchanged so we don't risk
// any logic regression. We read it from its original location and
// re-expose it. After all modules are migrated, the original can be deleted.
module.exports = require('../../services/ruleEngine');
