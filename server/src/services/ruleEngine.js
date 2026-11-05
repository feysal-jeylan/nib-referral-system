/**
 * src/services/ruleEngine.js
 * ───────────────────────────────────────────────────────────────────────────
 * Re-export of the rule engine from server/services/ruleEngine.js.
 * This bridge allows modules using the '@/' alias to import via:
 *   require('@/services/ruleEngine')
 *
 * The original file stays at server/services/ruleEngine.js (not under src/)
 * because it was written before the MVC refactor. This bridge keeps both
 * import paths working simultaneously without code duplication.
 */

'use strict';

module.exports = require('../../services/ruleEngine');
