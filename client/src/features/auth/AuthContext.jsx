/**
 * client/src/features/auth/AuthContext.jsx
 * ──────────────────────────────────────────
 * React context that owns the session-check lifecycle.
 *
 * SECURITY: The JWT is stored in an HttpOnly cookie — never in JS memory.
 *   We only store the decoded user identity returned by GET /api/auth/me.
 *
 * Phase 1 (Zustand migration):
 *   This context STILL owns the async side-effects (GET /api/auth/me on mount,
 *   the 'auth:unauthorized' event listener, login(), logout(), refreshUser()).
 *   Once a user is resolved, it is pushed into the Zustand store via setUser()
 *   so all components can read it without prop-drilling.
 *
 *   App.jsx reads user from Zustand (useAppStore), not from this context.
 *   This context is kept lean — it exports only the action helpers needed by
 *   Login.jsx, ChangePassword.jsx, and Dashboard.jsx (logout).
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '@/services/api';
import useAppStore from '@/store/useAppStore';

const AuthContext = createContext({
  loading:     true,
  login:       () => {},
  logout:      () => Promise.resolve(),
  refreshUser: () => {},
});

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);

  // Pull Zustand actions (stable references — do not cause re-renders)
  const setUser  = useAppStore(s => s.setUser);
  const clearUser = useAppStore(s => s.clearUser);

  // ── On mount: check if the browser already has a valid session ──────────
  useEffect(() => {
    async function checkSession() {
      try {
        const { data } = await api.get('/auth/me');
        setUser(data);       // → Zustand
      } catch {
        setUser(null);       // → Zustand (already null by default)
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 'auth:unauthorized' event — fired by api.js on mid-session 401 ──────
  useEffect(() => {
    function handleSessionExpiry() { clearUser(); }
    window.addEventListener('auth:unauthorized', handleSessionExpiry);
    return () => window.removeEventListener('auth:unauthorized', handleSessionExpiry);
  }, [clearUser]);

  // ── login(userData) — called by Login.jsx after successful POST /auth/login
  const login = useCallback((userData) => {
    setUser(userData);
  }, [setUser]);

  // ── logout() — clears HttpOnly cookie then wipes Zustand ────────────────
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Network failure — still clear local state
    } finally {
      clearUser();
    }
  }, [clearUser]);

  // ── refreshUser(userData) — called by ChangePassword.jsx ────────────────
  const refreshUser = useCallback((userData) => {
    setUser(userData);
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
