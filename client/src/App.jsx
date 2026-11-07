/**
 * client/src/App.jsx
 * ───────────────────
 * Nib International Bank — Referral Management System
 *
 * Pure routing shell. All data-fetching, state, and layout live in Dashboard.
 *
 * Auth flow (useAuth from AuthContext):
 *   loading  → full-page spinner (prevents login-screen flash)
 *   !user    → <Login />
 *   must_change_password → <ChangePassword />
 *   otherwise → <Dashboard />
 *
 * Security: HttpOnly JWT cookie — no token in JS memory.
 * Axios instance (services/api.js) sends withCredentials: true automatically.
 */
//import './App.css';

import { useAuth } from '@/features/auth/AuthContext';
import Login from '@/features/auth/Login';
import ChangePassword from '@/features/auth/ChangePassword';
import Dashboard from '@/features/dashboard/Dashboard';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading" role="status" aria-label="Checking authentication…">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <p className="auth-loading__text">Verifying session…</p>
      </div>
    );
  }

  if (!user) return <Login />;
  if (user.must_change_password) return <ChangePassword />;

  return <Dashboard user={user} logout={logout} />;
}
