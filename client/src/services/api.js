/**
 * client/src/services/api.js
 * ───────────────────────────
 * Centralized Axios instance — the ONLY place that should ever call the API.
 *
 * Every request automatically:
 *   • Targets /api (Vite proxies → http://localhost:3000)
 *   • Sends the HttpOnly JWT cookie  (withCredentials: true)
 *   • Times out after 10 s
 *   • Has JSON response bodies already parsed (Axios does this by default)
 *
 * ── 401 Session-expiry Interceptor ──────────────────────────────────────────
 * When the backend returns 401 for a *protected* route (session expired mid-use),
 * the interceptor fires a custom DOM event: 'auth:unauthorized'.
 * AuthContext listens for this event and clears local user state → login screen.
 *
 * Why a DOM event instead of a direct import?
 *   api.js → AuthContext  AND  AuthContext → api.js  would be a circular
 *   dependency. The event bus pattern breaks the cycle cleanly.
 *
 * Which routes are excluded from the interceptor?
 *   • /auth/login       — a 401 means wrong credentials, not session expiry
 *   • /auth/logout      — already logging out; don't re-trigger
 *   • /auth/me          — called on mount; AuthContext handles its own 401
 *   • /agents/apply     — public endpoint; unauthenticated by design
 */

import axios from 'axios';
import useAppStore from '@/store/useAppStore';

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         '/api',
  withCredentials: true,          // ← replaces credentials: 'include' everywhere
  timeout:         10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Routes where a 401 is expected behavior and should NOT trigger session-expiry.
const SKIP_INTERCEPT = new Set([
  '/auth/login',
  '/auth/logout',
  '/auth/me',
  '/agents/apply',
]);

// ── Response interceptor ──────────────────────────────────────────────────────
api.interceptors.response.use(
  // 2xx — pass through unchanged
  (response) => response,

  // Error — inspect and potentially signal session expiry or suspension
  (error) => {
    const url    = error.config?.url ?? '';
    const status = error.response?.status;
    const code   = error.response?.data?.code;

    // Auto-logout on 401/403 with ACCOUNT_SUSPENDED or NO_TOKEN
    if (
      (status === 401 || status === 403) &&
      (code === 'ACCOUNT_SUSPENDED' || code === 'NO_TOKEN')
    ) {
      useAppStore.getState().clearUser();
      window.dispatchEvent(
        new CustomEvent('auth:unauthorized', { detail: { url, code } })
      );
      if (window.location.pathname !== '/login' && window.location.pathname !== '/activate') {
        window.location.href = '/login';
      }
    } else if (status === 401 && !SKIP_INTERCEPT.has(url)) {
      // Mid-session expiry: notify AuthContext via DOM event.
      // AuthContext's listener will call setUser(null) → <Login /> renders.
      useAppStore.getState().clearUser();
      window.dispatchEvent(
        new CustomEvent('auth:unauthorized', { detail: { url } })
      );
    }

    // Always re-throw so the calling code's catch block still runs.
    return Promise.reject(error);
  }
);

export default api;
