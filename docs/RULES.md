# Master Project Rules: Nib Bank Referral System

## 1. Project Context & Constraints
- **Domain:** Banking Internship Prototype (Nib International Bank).
- **Goal:** Track agent referrals, calculate successful referrals, and display reward eligibility.
- **Stack:** React (Vite), Express.js (Node), PostgreSQL.
- **Timeline:** Strict deadline of October 30, 2026. Prioritize a working MVP over complex features.
- **Data:** **ABSOLUTELY NO REAL CUSTOMER DATA.** All data must be fictional demo data.

## 2. Architectural Principles
- **Monolith Structure:** `referral-api` (backend) and `referral-web` (frontend) in a single root folder.
- **Backend is Authoritative:** The React frontend is just a display layer. The Express backend must validate **all** inputs, calculate **all** counts, and enforce **all** business rules.
- **Database Integrity:** 
  - Use PostgreSQL relational tables with Primary/Foreign keys.
  - Use `UNIQUE` constraints to prevent duplicate referrals.
  - **Never** use string concatenation for SQL queries. Use **Parameterized Queries** (`$1, $2`) exclusively.
- **Simplicity:** No Docker, no microservices, no complex state managers (use React state/hooks or context). Do not over-engineer.

## 3. Security & Banking Context (CRITICAL)
- **No Real Payouts:** The system only *calculates* reward eligibility for the demo. Do not integrate with payment gateways or real money transfers.
- **Authentication (Pending Supervisor Approval):** 
  - If no auth is approved, clearly document the prototype as insecure.
  - If auth is added, use JWT or secure sessions. Never store plain-text passwords. Use `bcrypt`.
- **Input Validation:** Validate all incoming request bodies (e.g., `name`, `phone`, `referral_code`). Reject malformed inputs with a `400 Bad Request`.
- **Error Handling:** 
  - Never expose raw SQL errors or stack traces to the frontend.
  - Return structured JSON errors: `{ "error": "Human readable message", "code": "ERROR_CODE" }`.
  - Use appropriate HTTP status codes (201 Created, 400 Bad Request, 404 Not Found, 409 Conflict, 500 Server Error).
- **Environment Variables:** Never hardcode database passwords. Use `.env` for secrets. `.env` must be in `.gitignore`.
- **CORS:** Restrict CORS in Express to the frontend's local URL (e.g., `http://localhost:5173`).

## 4. Pending Business Rules (DO NOT BUILD YET - Awaiting Supervisor)
- **Agent Creation:** Waiting for supervisor (likely Admin only via dashboard).
- **Referral Success:** Waiting for supervisor (likely `PENDING` -> `SUCCESSFUL` via admin action).
- **Customer Identity:** Waiting for supervisor (likely Phone Number as unique ID).
- **Reward Rules:** Waiting for supervisor (likely configurable thresholds, e.g., 3, 5, 10 referrals).

## 5. AI Behavior & Mentorship Rules (For Antigravity/Claude/ChatGPT)
- **Do not generate the entire app at once.** Work in small, vertical slices.
- **Do not write database schema** or business logic until explicitly instructed.
- **Explain the code** you generate briefly so the student can learn and defend it in their report.
- **Do not change filenames, database columns, or folder structures** without explaining why.
- **Ask for confirmation** before making architectural decisions.
## 6. V2 Pivot: Real-World Banking Workflow (Approved by Supervisor)
The system is no longer a simple manual-entry app. It must reflect real banking operations.

- **Agent Onboarding:** External marketers can register publicly. Their status is `PENDING`. Only an Admin can approve them. Upon approval, the system generates their `referral_code` and creates their User account.
- **No Customer Registration UI:** Customers are NEVER registered inside this app. 
- **Core Banking Integration:** This system must expose an API endpoint (e.g., `POST /api/integration/account-opened`) to receive webhooks from the core banking system (Temenos) when a customer opens an account.
- **Flexible Campaigns:** Hardcoded 3/5/10 thresholds are removed. Admins create `campaigns` with dynamic `campaign_rules` (e.g., min deposit, account type, start/end dates).

## 7. Scalability & Production Constraints (CRITICAL)
Because this will integrate with a real banking system, scalability is non-negotiable.

- **Idempotency:** The integration webhook must be idempotent. If Temenos sends the same `transaction_id` twice, the system must ignore the duplicate and return `200 OK` to prevent double-crediting an agent.
- **Asynchronous Processing:** The webhook endpoint must respond immediately (`202 Accepted`) and process the referral validation in the background (or via a queue) to prevent blocking the core banking system.
- **JSONB for Rules:** Use PostgreSQL `JSONB` for `campaign_rules` and `integration_logs` payloads. This allows schema flexibility without constant database migrations.
- **Audit Trails:** Every status change on a `referral` or `campaign` must record `updated_at` and `updated_by` (User ID).
- **Pagination:** All `GET` endpoints (agents, referrals, campaigns) must support pagination (`?page=1&limit=20`) to handle thousands of records.
- **Database Indexes:** Add indexes on `referrals(agent_id)`, `referrals(status)`, `campaigns(status)`, and `integration_logs(status)` for fast querying.