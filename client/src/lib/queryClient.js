/**
 * client/src/lib/queryClient.js
 * ──────────────────────────────
 * Singleton QueryClient for TanStack Query.
 *
 * Default options:
 *   - staleTime: 5 minutes  — cached data is considered fresh for 5 min,
 *                             preventing unnecessary background refetches.
 *   - refetchOnWindowFocus: false — no automatic refetch when the tab regains focus.
 *   - retry: 1              — queries retry once on failure before throwing.
 *   - mutations.retry: 0    — mutations never auto-retry (let the UI handle it).
 *
 * Import this single instance anywhere you need direct cache access
 * (e.g. queryClient.invalidateQueries(...) inside a mutation callback).
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

