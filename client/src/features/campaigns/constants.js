/**
 * features/campaigns/constants.js
 * ─────────────────────────────────
 * Shared rule-engine constants used by CampaignForm and CampaignTable.
 * Must stay in sync with VALID_OPERATORS in server/routes/campaigns.js.
 */

export const RULE_TYPES = ['MIN_DEPOSIT', 'ACCOUNT_TYPE', 'COMPOSITE'];

export const OPERATORS = [
  { value: 'GREATER_THAN',          label: '> Greater Than'           },
  { value: 'LESS_THAN',             label: '< Less Than'              },
  { value: 'EQUALS',                label: '= Equals'                 },
  { value: 'GREATER_THAN_OR_EQUAL', label: '>= Greater Than or Equal' },
  { value: 'LESS_THAN_OR_EQUAL',    label: '<= Less Than or Equal'    },
  { value: 'NOT_EQUALS',            label: '!= Not Equals'            },
];

/** Human-readable symbols for rendering rule tags in the table. */
export const OPERATOR_SYMBOL = {
  GREATER_THAN:          '>',
  LESS_THAN:             '<',
  EQUALS:                '=',
  GREATER_THAN_OR_EQUAL: '>=',
  LESS_THAN_OR_EQUAL:    '<=',
  NOT_EQUALS:            '!=',
};

/** Fields available for COMPOSITE rule conditions. Banking rules only. */
export const COMPOSITE_FIELDS = [
  { value: 'deposit_amount', label: 'Deposit Amount' },
  { value: 'account_type',   label: 'Account Type'   },
];

/** Fields whose values are numeric (used to coerce condition values). */
export const NUMERIC_CONDITION_FIELDS = new Set(['deposit_amount']);

