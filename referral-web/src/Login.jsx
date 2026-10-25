/**
 * referral-web/src/Login.jsx
 * ───────────────────────────
 * Premium banking login screen for the Nib Referral System.
 *
 * Security:
 *   - POST /api/auth/login with credentials:'include' so the browser
 *     receives the Set-Cookie header and stores the HttpOnly JWT cookie.
 *   - The token is NEVER read from the response body or stored in JS.
 *   - On success, we only store the user identity { id, username, role }
 *     in React context — the token itself remains invisible to JavaScript.
 */

import { useState } from 'react';
import { useAuth } from './AuthContext';
import './Login.css';

export default function Login() {
  const { login }                   = useAuth();
  const [form, setForm]             = useState({ username: '', password: '' });
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    // Clear error as soon as the user starts correcting their input
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
      // ── POST credentials to the backend ─────────────────────────────────
      //
      // credentials: 'include' is CRITICAL here. Without it, the browser
      // ignores the 'Set-Cookie' header in the response, the HttpOnly JWT
      // cookie is never stored, and every subsequent /api call returns 401.
      //
      // The token is NOT in the JSON response body — the backend puts it
      // only in the cookie. We only read the user identity from the body.
      const res  = await fetch('/api/auth/login', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          username: form.username.trim(),
          password: form.password,
        }),
        credentials: 'include', // Tell browser: "store any cookies from this response"
      });

      const data = await res.json();

      if (!res.ok) {
        // 401 from backend — wrong credentials (generic message, no enumeration)
        setError(data.error ?? 'Invalid username or password. Please try again.');
        return;
      }

      // ── Success — update auth context with user identity ─────────────────
      //
      // data.user = { id, username, role }
      // The HttpOnly cookie is now set in the browser. Any subsequent fetch
      // to /api/* will automatically include it (with credentials:'include').
      login(data.user);

    } catch {
      setError('Cannot reach the server. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card" role="main">

        {/* ── Card header ─────────────────────────────────────────────── */}
        <div className="login-card__header">
          <span className="login-card__logo" aria-hidden="true">🏦</span>
          <h1 className="login-card__bank-name">Nib International Bank</h1>
          <p className="login-card__tagline">Internal Referral Management</p>
        </div>

        {/* ── Card body ────────────────────────────────────────────────── */}
        <div className="login-card__body">
          <p className="login-card__title">Staff Portal Sign In</p>
          <p className="login-card__subtitle">
            Enter your credentials to access the referral dashboard.
          </p>

          <form
            id="login-form"
            className="login-form"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Login form"
          >
            {/* ── Username field ─────────────────────────────────────── */}
            <div className="login-field">
              <label className="login-field__label" htmlFor="login-username">
                Username
              </label>
              <div className="login-field__input-wrap">
                <span className="login-field__icon" aria-hidden="true">👤</span>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  className={`login-field__input${error ? ' login-field__input--error' : ''}`}
                  placeholder="Enter your username"
                  value={form.username}
                  onChange={handleChange}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* ── Password field ─────────────────────────────────────── */}
            <div className="login-field">
              <label className="login-field__label" htmlFor="login-password">
                Password
              </label>
              <div className="login-field__input-wrap">
                <span className="login-field__icon" aria-hidden="true">🔒</span>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  className={`login-field__input${error ? ' login-field__input--error' : ''}`}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {/* ── Error message ──────────────────────────────────────── */}
            {error && (
              <div className="login-error" role="alert" aria-live="assertive">
                <span className="login-error__icon" aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* ── Submit button ──────────────────────────────────────── */}
            <button
              id="login-submit-btn"
              type="submit"
              className="login-btn"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  🔑 Sign In to Dashboard
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── Card footer ─────────────────────────────────────────────── */}
        <div className="login-card__footer">
          Secured with <strong>HttpOnly JWT</strong> · Internal use only
        </div>

      </div>
    </div>
  );
}
