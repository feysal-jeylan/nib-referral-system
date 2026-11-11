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
 *
 * Phase 5b: App.css import removed — fully migrated to Tailwind.
 */

import { useAuth } from '@/features/auth/AuthContext';
import Login from '@/features/auth/Login';
import ChangePassword from '@/features/auth/ChangePassword';
import Dashboard from '@/features/dashboard/Dashboard';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div
        className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4"
        role="status"
        aria-label="Checking authentication…"
      >
        {/* NIB logo spinner */}
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-2 border-border border-t-brand animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/nib-logo.png"
              alt="NIB"
              className="w-16 h-16 rounded-full object-cover"
            />
          </div>
        </div>
        <p className="text-text-3 text-sm font-medium">Verifying session…</p>
      </div>
    );
  }

  if (!user) return <Login />;
  if (user.must_change_password) return <ChangePassword />;

  return <Dashboard user={user} logout={logout} />;
}
