/**
 * client/src/features/auth/AuthContext.jsx
 * ──────────────────────────────────────────
 * React context that tracks the currently logged-in user.
 *
 * SECURITY: The JWT is stored in an HttpOnly cookie — never in JS memory.
 *   We only store the decoded user identity returned by GET /api/auth/me.
 *
 * V2 (Axios migration):
 *   - All fetch() calls replaced with the centralized api.js Axios instance.
 *   - Added a 'auth:unauthorized' DOM event listener: when api.js detects a
 *     mid-session 401 on a protected route, it fires this event. The listener
 *     here calls setUser(null), rendering <Login /> without a page reload.
 *     This avoids a circular dependency (api.js ← AuthContext ← api.js).
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '@/services/api';

const AuthContext = createContext({
  user:        null,
  loading:     true,
  login:       () => {},
  logout:      () => {},
  refreshUser: () => {},
});

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── On mount: check if the browser already has a valid session ──────────
  // api.get('/auth/me') sends the HttpOnly cookie automatically.
  // 200 → user is logged in; any error → not logged in (setUser stays null).
  useEffect(() => {
    async function checkSession() {
      try {
        const { data } = await api.get('/auth/me');
        setUser(data);
      } catch {
        // 401 (no session) or network error — treat as not logged in.
        // The 401 interceptor in api.js skips /auth/me, so no event fires.
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  // ── 'auth:unauthorized' event listener ───────────────────────────────────
  // api.js fires this event when a *protected* route returns 401 mid-session.
  // We clear user state here (without calling the full logout() to avoid
  // triggering another api.post('/auth/logout') on an already-expired session).
  useEffect(() => {
    function handleSessionExpiry() {
      setUser(null);
    }
    window.addEventListener('auth:unauthorized', handleSessionExpiry);
    return () => window.removeEventListener('auth:unauthorized', handleSessionExpiry);
  }, []); // No deps — setUser is a stable reference

  // ── login(userData) ────────────────────────────────────────────────────────
  // Called by Login.jsx after a successful POST /api/auth/login.
  // The backend has already set the HttpOnly cookie. We just update local state.
  const login = useCallback((userData) => {
    setUser(userData);
  }, []);

  // ── logout() ──────────────────────────────────────────────────────────────
  // Asks the backend to clear the HttpOnly cookie, then clears local state.
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Network failure or already-expired session — still clear local state.
    } finally {
      setUser(null);
    }
  }, []);

  // ── refreshUser(userData) ─────────────────────────────────────────────────
  // Called by ChangePassword.jsx after a successful password change.
  // Updates state in-place (must_change_password → false) → Dashboard renders.
  const refreshUser = useCallback((userData) => {
    setUser(userData);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
