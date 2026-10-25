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