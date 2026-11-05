/**
 * client/src/features/auth/Login.jsx
 * ─────────────────────────────────────
 * Premium banking login screen for the Nib Referral System.
 *
 * Two views toggled inside a single card:
 *   'login' → Staff Portal Sign In
 *   'apply' → Agent self-registration (public — no session required)
 *
 * V3 (Tailwind migration):
 *   - All CSS class names replaced with Tailwind utility classes.
 *   - `import '@/Login.css'` removed — no external CSS dependency.
 *   - Logic, Axios usage, and component structure are unchanged.
 *
 * Security:
 *   - POST /api/auth/login → browser stores HttpOnly JWT cookie automatically.
 *   - The token is NEVER read from the response body or stored in JS.
 *   - Only the decoded user identity { id, username, role } enters React state.
 */

import { useState } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/api';

// ─── Shared Tailwind class strings ───────────────────────────────────────────
const inputBase =
  'w-full bg-[#F2F5F8] border border-[#D8DEE6] rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#002B5B] focus:ring-2 focus:ring-[#002B5B]/20 transition';
const inputError =
  'w-full bg-[#F2F5F8] border border-red-400 rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 transition';

// ─── AgentApplyForm ───────────────────────────────────────────────────────────
function AgentApplyForm({ onBack, onSuccess }) {
  const [form, setForm]             = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const name  = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (!name || !phone || !email) {
      setError('Please fill in all three fields.');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.post('/agents/apply', { name, phone, email });
      onSuccess();
    } catch (err) {
      if (err.response?.status === 409) {
        setError('An agent with this phone number or email already exists.');
      } else {
        setError(err.response?.data?.error ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Back link */}
      <button
        type="button"
        className="text-[#002B5B] text-sm font-semibold hover:text-[#C5A059] flex items-center gap-1 mb-5 transition-colors"
        onClick={onBack}
        aria-label="Return to sign in"
      >
        ← Back to Sign In
      </button>

      <p className="text-[#002B5B] font-bold text-lg mb-1">Agent Application</p>
      <p className="text-gray-500 text-sm mb-5">
        Submit your details to apply as a Nib referral agent.
        An Admin will review and approve your application.
      </p>

      <form
        className="space-y-4"
        onSubmit={handleSubmit}
        noValidate
        aria-label="Agent application form"
      >
        {/* Full Name */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1" htmlFor="apply-name">
            Full Name
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" aria-hidden="true">👤</span>
            <input
              id="apply-name"
              name="name"
              type="text"
              className={error ? inputError : inputBase}
              placeholder="e.g. Sara Tesfaye"
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
              autoFocus
              required
            />
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1" htmlFor="apply-phone">
            Phone Number
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" aria-hidden="true">📱</span>
            <input
              id="apply-phone"
              name="phone"
              type="tel"
              className={error ? inputError : inputBase}
              placeholder="e.g. 0912345678"
              value={form.phone}
              onChange={handleChange}
              autoComplete="tel"
              required
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1" htmlFor="apply-email">
            Email Address
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" aria-hidden="true">✉️</span>
            <input
              id="apply-email"
              name="email"
              type="email"
              className={error ? inputError : inputBase}
              placeholder="e.g. sara@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg p-3 text-red-800 text-sm"
            role="alert"
            aria-live="assertive"
          >
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-[#002B5B] hover:bg-[#001e42] text-white font-semibold py-3 rounded-lg text-sm tracking-wide transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <>
              <span
                className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                aria-hidden="true"
              />
              Submitting…
            </>
          ) : (
            '📝 Submit Application'
          )}
        </button>
      </form>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
export default function Login() {
  const { login } = useAuth();

  const [form, setForm]                 = useState({ username: '', password: '' });
  const [error, setError]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [view, setView]                 = useState('login');
  const [applySuccess, setApplySuccess] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Please enter both your username and password.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data } = await api.post('/auth/login', {
        username: form.username.trim(),
        password: form.password,
      });
      login(data.user);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Invalid username or password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleApplySuccess() {
    setView('login');
    setApplySuccess(
      '✅ Application submitted! An Admin will review and contact you with your login credentials.'
    );
    setTimeout(() => setApplySuccess(''), 8000);
  }

  return (
    /* Page background */
    <div className="min-h-screen bg-gradient-to-br from-[#001e42] to-[#002B5B] flex items-center justify-center p-4">

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" role="main">

        {/* Card header — navy bar with logo */}
        <div className="bg-[#002B5B] px-8 py-6 text-center border-b-4 border-[#C5A059]">
          <span className="text-4xl" aria-hidden="true">🏦</span>
          <h1 className="text-white font-bold text-xl tracking-tight mt-2">Nib International Bank</h1>
          <p className="text-[#C5A059] text-sm mt-1 tracking-wide">Internal Referral Management</p>
        </div>

        {/* Card body — toggles between login and apply views */}
        <div className="px-8 py-6">
          {view === 'apply' ? (
            <AgentApplyForm
              onBack={() => setView('login')}
              onSuccess={handleApplySuccess}
            />
          ) : (
            <>
              <p className="text-[#002B5B] font-bold text-lg mb-1">Staff Portal Sign In</p>
              <p className="text-gray-500 text-sm mb-5">
                Enter your credentials to access the referral dashboard.
              </p>

              {applySuccess && (
                <div
                  className="bg-green-50 border border-green-200 border-l-4 border-l-green-500 rounded-lg p-3 text-green-800 text-sm mb-4"
                  role="status"
                  aria-live="polite"
                >
                  {applySuccess}
                </div>
              )}

              <form
                id="login-form"
                className="space-y-4"
                onSubmit={handleSubmit}
                noValidate
                aria-label="Login form"
              >
                {/* Username */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1" htmlFor="login-username">
                    Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" aria-hidden="true">👤</span>
                    <input
                      id="login-username"
                      name="username"
                      type="text"
                      className={error ? inputError : inputBase}
                      placeholder="Enter your username"
                      value={form.username}
                      onChange={handleChange}
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1" htmlFor="login-password">
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base" aria-hidden="true">🔒</span>
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      className={error ? inputError : inputBase}
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div
                    className="flex items-center gap-2 bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg p-3 text-red-800 text-sm"
                    role="alert"
                    aria-live="assertive"
                  >
                    <span aria-hidden="true">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  id="login-submit-btn"
                  type="submit"
                  className="w-full bg-[#002B5B] hover:bg-[#001e42] text-white font-semibold py-3 rounded-lg text-sm tracking-wide transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? (
                    <>
                      <span
                        className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                        aria-hidden="true"
                      />
                      Signing in…
                    </>
                  ) : (
                    '🔐 Sign In to Dashboard'
                  )}
                </button>
              </form>

              {/* Become an agent */}
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-center gap-2 text-sm">
                <span className="text-gray-500">Not a staff member?</span>
                <button
                  type="button"
                  className="text-[#002B5B] font-semibold hover:text-[#C5A059] hover:underline transition-colors"
                  onClick={() => { setError(''); setView('apply'); }}
                >
                  Want to become an agent? Apply here.
                </button>
              </div>
            </>
          )}
        </div>

        {/* Card footer */}
        <div className="px-8 py-3 bg-[#F2F5F8] border-t border-gray-200 text-center text-xs text-gray-400">
          Secured with <strong>HttpOnly JWT</strong> · Internal use only
        </div>

      </div>
    </div>
  );
}
