/**
 * referral-web/src/Login.jsx
 * ───────────────────────────
 * Premium banking login screen for the Nib Referral System.
 *
 * V5 update — Public agent self-registration:
 *   Added a two-view toggle inside the login card:
 *     'login' → existing Staff Portal Sign In form (unchanged)
 *     'apply' → new AgentApplyForm for self-registration applications
 *
 *   The "Want to become an agent? Apply here." link at the bottom of the
 *   login card switches to the apply view.  The apply form has a back link
 *   that returns to the login view.
 *
 *   POST /api/agents/apply is PUBLIC — no credentials needed.
 *   On success, a toast-style success message is shown and the view snaps
 *   back to 'login' so the applicant knows their form was received.
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

// ─── AgentApplyForm ───────────────────────────────────────────────────────────
//
// Defined inside Login.jsx because it is only ever rendered inside the login
// card and shares no state with the rest of the application (it is pre-auth).
//
// Props:
//   onBack    — () => void  called when user clicks "← Back to Sign In"
//   onSuccess — () => void  called after a successful submission; parent
//                           switches view back to 'login' and shows success msg
function AgentApplyForm({ onBack, onSuccess }) {
  const [form, setForm]           = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const name  = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    // ── Client-side validation ──────────────────────────────────────────────
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
      // ── POST to the public apply endpoint ─────────────────────────────────
      //
      // No credentials:'include' here — this is a public route, there is no
      // cookie to attach and no cookie is returned.
      const res  = await fetch('/api/agents/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, phone, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError('An agent with this phone number or email already exists.');
        } else {
          setError(data.error ?? 'Something went wrong. Please try again.');
        }
        return;
      }

      // ── Success: bubble up so Login can show success message ──────────────
      onSuccess();

    } catch {
      setError('Cannot reach the server. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-apply-view">

      {/* ── Back link ──────────────────────────────────────────────────── */}
      <button
        type="button"
        className="login-back-link"
        onClick={onBack}
        aria-label="Return to sign in"
      >
        ← Back to Sign In
      </button>

      {/* ── Heading ────────────────────────────────────────────────────── */}
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
        {/* ── Full Name ──────────────────────────────────────────────── */}
        <div className="login-field">
          <label className="login-field__label" htmlFor="apply-name">
            Full Name
          </label>
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

        {/* ── Phone ──────────────────────────────────────────────────── */}
        <div className="login-field">
          <label className="login-field__label" htmlFor="apply-phone">
            Phone Number
          </label>
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

        {/* ── Email ──────────────────────────────────────────────────── */}
        <div className="login-field">
          <label className="login-field__label" htmlFor="apply-email">
            Email Address
          </label>
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

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && (
          <div className="login-error" role="alert" aria-live="assertive">
            <span className="login-error__icon" aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Submit ─────────────────────────────────────────────────── */}
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

  // ── Login form state ─────────────────────────────────────────────────────
  const [form, setForm]             = useState({ username: '', password: '' });
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── View toggle: 'login' | 'apply' ──────────────────────────────────────
  const [view, setView]             = useState('login');

  // ── Apply success message (shown briefly on the login view after apply) ──
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
      // ── POST credentials to the backend ─────────────────────────────────
      //
      // credentials: 'include' is CRITICAL here. Without it, the browser
      // ignores the 'Set-Cookie' header in the response, the HttpOnly JWT
      // cookie is never stored, and every subsequent /api call returns 401.
      const res  = await fetch('/api/auth/login', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          username: form.username.trim(),
          password: form.password,
        }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Invalid username or password. Please try again.');
        return;
      }

      login(data.user);

    } catch {
      setError('Cannot reach the server. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Callback from AgentApplyForm on successful submission ────────────────
  function handleApplySuccess() {
    setView('login');
    setApplySuccess(
      '✅ Application submitted! An Admin will review and contact you with your login credentials.'
    );
    // Auto-dismiss the success banner after 8 seconds
    setTimeout(() => setApplySuccess(''), 8000);
  }

  return (
    <div className="login-page">
      <div className="login-card" role="main">

        {/* ── Card header (always visible) ─────────────────────────────── */}
        <div className="login-card__header">
          <span className="login-card__logo" aria-hidden="true">🏦</span>
          <h1 className="login-card__bank-name">Nib International Bank</h1>
          <p className="login-card__tagline">Internal Referral Management</p>
        </div>

        {/* ── Card body — toggles between login and apply views ─────────── */}
        <div className="login-card__body">

          {view === 'apply' ? (
            /* ── Apply view ────────────────────────────────────────────── */
            <AgentApplyForm
              onBack={() => setView('login')}
              onSuccess={handleApplySuccess}
            />
          ) : (
            /* ── Login view ────────────────────────────────────────────── */
            <>
              <p className="login-card__title">Staff Portal Sign In</p>
              <p className="login-card__subtitle">
                Enter your credentials to access the referral dashboard.
              </p>

              {/* ── Apply success banner ──────────────────────────────── */}
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
                {/* ── Username ───────────────────────────────────────── */}
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

                {/* ── Password ───────────────────────────────────────── */}
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

                {/* ── Error ─────────────────────────────────────────── */}
                {error && (
                  <div className="login-error" role="alert" aria-live="assertive">
                    <span className="login-error__icon" aria-hidden="true">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* ── Submit ────────────────────────────────────────── */}
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

              {/* ── "Become an agent" link ──────────────────────────── */}
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

        {/* ── Card footer (always visible) ─────────────────────────────── */}
        <div className="login-card__footer">
          Secured with <strong>HttpOnly JWT</strong> · Internal use only
        </div>

      </div>
    </div>
  );
}
