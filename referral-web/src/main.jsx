import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* AuthProvider wraps the entire app so every component can access
        the auth state (user, loading, login, logout) via useAuth().
        It runs the GET /api/auth/me check once on mount. */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)

