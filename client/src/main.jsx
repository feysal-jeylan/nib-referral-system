import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from '@/features/auth/AuthContext.jsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/lib/queryClient'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/*
      QueryClientProvider must be an outer wrapper so every component
      in the tree can call useQuery / useMutation hooks.

      AuthProvider wraps the entire app so every component can access
      the auth state (user, loading, login, logout) via useAuth().
      It runs the GET /api/auth/me check once on mount.

      ReactQueryDevtools are development-only (Vite strips them in
      production builds automatically via the devtools package).
    */}
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
