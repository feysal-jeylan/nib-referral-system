/**
 * client/src/features/auth/Login.jsx
 * ─────────────────────────────────────
 * Premium banking login screen for the Nib Referral System.
 *
 * Two views toggled inside a single card:
 *   'login' → Staff Portal Sign In
 *   'apply' → Agent self-registration (public — no session required)
 *
 * V2 (Axios migration):
 *   - fetch() replaced with api.js Axios instance throughout.
 *   - Error messages read from err.response?.data?.error (Axios pattern).
 *   - withCredentials is handled globally by api.js — no per-call option needed.
 *
 * Security:
 *   - POST /api/auth/login → browser stores HttpOnly JWT cookie automatically.
 *   - The token is NEVER read from the response body or stored in JS.
 *   - Only the decoded user identity { id, username, role } enters React state.
 */

import { useState } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/api';
import '@/Login.css';

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
      // Public endpoint — no session required. api.js still sends cookies
      // if they exist (harmless), and withCredentials doesn't block this.
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
    <div className="login-apply-view">

      <button
        type="button"
        className="login-back-link"
        onClick={onBack}
        aria-label="Return to sign in"
      >
        ← Back to Sign In
      </button>

      <p className="login-card__title">Agent Application</p>
      <p className="login-card__subtitle">
        Submit your details to apply as a Nib referral agent.
        An Admin will review and approve your application.
      </p>

      <form
        className="login-form"
        onSubmit={handleSubmit}
        noValidate
        aria-label="Agent application form"
      >
        {/* Full Name */}
        <div className="login-field">
          <label className="login-field__label" htmlFor="apply-name">Full Name</label>
          <div className="login-field__input-wrap">
            <span className="login-field__icon" aria-hidden="true">👤</span>
            <input
              id="apply-name"
              name="name"
              type="text"
              className={`login-field__input${error ? ' login-field__input--error' : ''}`}
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
        <div className="login-field">
          <label className="login-field__label" htmlFor="apply-phone">Phone Number</label>
          <div className="login-field__input-wrap">
            <span className="login-field__icon" aria-hidden="true">📱</span>
            <input
              id="apply-phone"
              name="phone"
              type="tel"
              className={`login-field__input${error ? ' login-field__input--error' : ''}`}
              placeholder="e.g. 0912345678"
              value={form.phone}
              onChange={handleChange}
              autoComplete="tel"
              required
            />
          </div>
        </div>

        {/* Email */}
        <div className="login-field">
          <label className="login-field__label" htmlFor="apply-email">Email Address</label>
          <div className="login-field__input-wrap">
            <span className="login-field__icon" aria-hidden="true">✉️</span>
            <input
              id="apply-email"
              name="email"
              type="email"
              className={`login-field__input${error ? ' login-field__input--error' : ''}`}
              placeholder="e.g. sara@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>
        </div>

        {error && (
          <div className="login-error" role="alert" aria-live="assertive">
            <span className="login-error__icon" aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="login-btn"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <>
              <span className="login-spinner" aria-hidden="true" />
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

  const [form, setForm]             = useState({ username: '', password: '' });
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView]             = useState('login');
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
      // credentials: 'include' is handled globally by api.js (withCredentials: true).
      // The browser stores the HttpOnly cookie from the Set-Cookie response header.
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
    <div className="login-page">
      <div className="login-card" role="main">

        {/* Card header */}
        <div className="login-card__header">
          <span className="login-card__logo" aria-hidden="true">🏦</span>
          <h1 className="login-card__bank-name">Nib International Bank</h1>
          <p className="login-card__tagline">Internal Referral Management</p>
        </div>

        {/* Card body — toggles between login and apply views */}
        <div className="login-card__body">
          {view === 'apply' ? (
            <AgentApplyForm
              onBack={() => setView('login')}
              onSuccess={handleApplySuccess}
            />
          ) : (
            <>
              <p className="login-card__title">Staff Portal Sign In</p>
              <p className="login-card__subtitle">
                Enter your credentials to access the referral dashboard.
              </p>

              {applySuccess && (
                <div className="login-apply-success" role="status" aria-live="polite">
                  {applySuccess}
                </div>
              )}

              <form
                id="login-form"
                className="login-form"
                onSubmit={handleSubmit}
                noValidate
                aria-label="Login form"
              >
                {/* Username */}
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

                {/* Password */}
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

                {error && (
                  <div className="login-error" role="alert" aria-live="assertive">
                    <span className="login-error__icon" aria-hidden="true">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

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
                    ' Sign In to Dashboard'
                  )}
                </button>
              </form>

              {/* Become an agent */}
              <div className="login-apply-row">
                <span className="login-apply-row__text">Not a staff member?</span>
                <button
                  type="button"
                  className="login-apply-link"
                  onClick={() => { setError(''); setView('apply'); }}
                >
                  Want to become an agent? Apply here.
                </button>
              </div>
            </>
          )}
        </div>

        {/* Card footer */}
        <div className="login-card__footer">
          Secured with <strong>HttpOnly JWT</strong> · Internal use only
        </div>

      </div>
    </div>
  );
}
