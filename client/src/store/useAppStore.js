/**
 * client/src/store/useAppStore.js
 * ────────────────────────────────
 * Zustand global store — single source of truth for:
 *   • auth.user       — the authenticated user object (or null)
 *   • ui.activePage   — current sidebar view
 *
 * The session-check lifecycle (GET /api/auth/me on mount) stays in
 * AuthContext. Once the user is known, AuthContext calls setUser() here
 * so ALL components can read it from Zustand without prop-drilling.
 *
 * Pages: 'overview' | 'agents' | 'campaigns' | 'referrals' | 'logs'
 */

import { create } from 'zustand';

const useAppStore = create((set) => ({
  // ── Auth slice ────────────────────────────────────────────────────────────
  user: null,

  /** Called by AuthContext once /api/auth/me resolves successfully. */
  setUser: (user) => set({ user }),

  /** Called on logout — wipes user and resets page to overview. */
  clearUser: () => set({ user: null, activePage: 'overview' }),

  // ── UI slice ──────────────────────────────────────────────────────────────
  activePage: 'overview',

  /** Navigate to a named page. */
  setActivePage: (page) => set({ activePage: page }),

  // ── Sidebar collapse state ────────────────────────────────────────────────
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));

export default useAppStore;

