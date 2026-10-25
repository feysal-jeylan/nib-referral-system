/**
 * referral-web/src/AuthContext.jsx
 * ─────────────────────────────────
 * Provides a React context that tracks the currently logged-in user.
 *
 * SECURITY: The JWT token is stored in an HttpOnly cookie managed entirely
 * by the backend. We NEVER touch localStorage, sessionStorage, or JS memory
 * for the token. This file only stores the decoded user identity (id, username,
 * role) — the data returned by GET /api/auth/me — so the UI knows who is
 * logged in. The actual token is invisible to JavaScript.
 *
 * State shape:
 *   user    : { id, username, role }  — null when not authenticated
 *   loading : boolean                 — true during the initial /me check
 *
 * Why a `loading` state?
 *   On every page load, we must call GET /api/auth/me to check if the
 *   browser's HttpOnly cookie is still valid. This takes a brief moment.
 *   Without `loading`, App.jsx would immediately render <Login /> before
 *   the check completes — causing an ugly flash for logged-in users.
 *   With `loading=true`, App.jsx shows a spinner until we know the answer.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ── Create context (default values are only used if a component is rendered
//    outside of <AuthProvider>, which should never happen in this app) ──────
const AuthContext = createContext({
  user:    null,
  loading: true,
  login:   () => {},
  logout:  () => {},
});

// ── AuthProvider ─────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── On mount: check if the browser already has a valid session ──────────
  //
  // credentials: 'include' instructs the browser to attach all cookies
  // (including the HttpOnly 'token' cookie) to this cross-origin request.
  // Without this flag, the browser silently strips cookies from fetch calls
  // that cross origins (Vite :5173 → Express :3000).
  //
  // This is the ONLY way we can "read" the HttpOnly cookie — we can't
  // inspect it in JavaScript, so we ask the server to verify it for us.
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include', // Send the HttpOnly cookie with the request
        });

        if (res.ok) {
          // Cookie exists and is valid — server returned { id, username, role }
          const data = await res.json();
          setUser(data);
        } else {
          // 401: no cookie, or cookie is expired/tampered — user is not logged in
          setUser(null);
        }
      } catch {
        // Network error (e.g. API is down) — treat as not logged in
        setUser(null);
      } finally {
        // Whether success or failure, we now know the auth state — stop loading
        setLoading(false);
      }
    }

    checkSession();
  }, []); // Run once on mount only

  // ── login(userData) ────────────────────────────────────────────────────────
  //
  // Called by Login.jsx after a successful POST /api/auth/login response.
  // The backend has already set the HttpOnly cookie at this point. We just
  // need to update the React state so the dashboard renders.
  const login = useCallback((userData) => {
    setUser(userData);
  }, []);

  // ── logout() ──────────────────────────────────────────────────────────────
  //
  // Calls the backend to clear the HttpOnly cookie (which JavaScript cannot
  // delete directly — only the browser's HTTP layer can). Then clears the
  // React user state so the app transitions back to <Login />.
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method:      'POST',
        credentials: 'include', // Required to send the cookie so the server can clear it
      });
    } catch {
      // If the network call fails, still log out locally.
      // On next page load, the expired/missing cookie will redirect to login.
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── useAuth hook ──────────────────────────────────────────────────────────────
// Convenience hook so components don't need to import useContext + AuthContext.
// Usage: const { user, loading, login, logout } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
