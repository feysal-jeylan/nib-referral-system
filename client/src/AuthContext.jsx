/**
 * referral-web/src/AuthContext.jsx
 * ─────────────────────────────────
 * Provides a React context that tracks the currently logged-in user.
 *
 * SECURITY: The JWT token is stored in an HttpOnly cookie managed entirely
 * by the backend. We NEVER touch localStorage, sessionStorage, or JS memory
 * for the token. This file only stores the decoded user identity
 * (id, username, role, must_change_password) — the data returned by
 * GET /api/auth/me — so the UI knows who is logged in and what state
 * they are in. The actual token is invisible to JavaScript.
 *
 * State shape:
 *   user    : { id, username, role, must_change_password } | null
 *   loading : boolean
 *
 * Exposed functions:
 *   login(userData)    — called by Login.jsx after successful POST /api/auth/login
 *   logout()           — calls POST /api/auth/logout then clears local state
 *   refreshUser(data)  — called by ChangePassword.jsx after a successful password
 *                        change to update the user state in-place (without a
 *                        full page reload) so the Dashboard renders immediately.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

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
  //
  // credentials: 'include' instructs the browser to attach the HttpOnly
  // 'token' cookie. We can't read it in JS, so we ask the server to verify
  // it and return the user's current state (including must_change_password).
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });

        if (res.ok) {
          // Returns { id, username, role, must_change_password }
          const data = await res.json();
          setUser(data);
        } else {
          setUser(null);
        }
      } catch {
        // Network error — treat as not logged in
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    checkSession();
  }, []);

  // ── login(userData) ────────────────────────────────────────────────────────
  // Called by Login.jsx after a successful POST /api/auth/login.
  // The backend has already set the HttpOnly cookie. We update local state
  // so the dashboard (or ChangePassword screen) renders immediately.
  const login = useCallback((userData) => {
    setUser(userData);
  }, []);

  // ── logout() ──────────────────────────────────────────────────────────────
  // Asks the backend to clear the HttpOnly cookie (JS cannot do this directly),
  // then clears local state so App renders <Login />.
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method:      'POST',
        credentials: 'include',
      });
    } catch {
      // Network failure — still clear local state so the UI shows login.
    } finally {
      setUser(null);
    }
  }, []);

  // ── refreshUser(userData) ─────────────────────────────────────────────────
  //
  // Called by ChangePassword.jsx after POST /api/auth/change-password returns
  // a fresh user object with must_change_password = false.
  //
  // This updates the React state in-place so App.jsx re-renders and shows
  // the Dashboard — without requiring the user to log in again.
  //
  // The backend has already replaced the HttpOnly cookie with a new JWT at
  // this point, so future API calls are also fully authenticated.
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
