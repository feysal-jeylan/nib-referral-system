/**
 * client/src/features/auth/ChangePassword.jsx
 * ─────────────────────────────────────────────
 * Forced password-change screen — rendered when must_change_password === true.
 *
 * Blocks access to the full dashboard until the agent sets a permanent password.
 *
 * V5 (Nib Bank brand refresh — matches Login.jsx warm brown / honey gold aesthetic):
 *   - Split-screen layout: left = NIB warm brown branding panel, right = form card.
 *   - Premium password-strength indicator (3-segment bar).
 *   - Slide-in error / success banners with micro-interactions.
 *   - All old navy (#002B5B) and old gold (#C5A059) replaced with brand tokens.
 *   - Logic, Axios usage, and AuthContext calls are unchanged.
 */

import { useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/api';

// ─── Strength helpers ─────────────────────────────────────────────────────────
function getStrength(pw) {
  if (!pw) return { level: 0, label: '', color: 'transparent', textColor: 'transparent' };
  let score = 0;
  if (pw.length >= 8)            score++;
  if (pw.length >= 12)           score++;
  if (/[A-Z]/.test(pw))         score++;
  if (/[0-9]/.test(pw))         score++;
  if (/[^A-Za-z0-9]/.test(pw))  score++;
  if (score <= 1) return { level: 1, label: 'Weak',   color: '#E8A090', textColor: '#7A2518' };
  if (score <= 3) return { level: 2, label: 'Fair',   color: '#F0C854', textColor: '#7C4A03' };
  return              { level: 3, label: 'Strong', color: '#7DC898', textColor: '#1A5C34' };
}

// ─── Shared input class builder ───────────────────────────────────────────────
function inputCls(hasError) {
  const base =
    'w-full bg-bg border rounded-xl px-4 py-3 text-text-1 text-sm ' +
    'placeholder-text-3 outline-none transition-all duration-200 ' +
    'focus:bg-surface ';
  return hasError
    ? base + 'border-reject-bdr focus:border-reject-bdr focus:ring-1 focus:ring-reject-bdr'
    : base + 'border-border focus:border-gold focus:ring-1 focus:ring-gold';
}

// ─── Left branding panel ──────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex relative flex-col justify-between overflow-hidden
                    bg-brand w-[46%] flex-shrink-0 p-10 xl:p-14">

      {/* Warm gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#6B3A15] via-[#8A4D1F] to-[#A0622A] pointer-events-none" />

      {/* Hexagonal SVG pattern — matches Login left panel */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="hex-cp" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
            <polygon
              points="28,2 52,15 52,33 28,46 4,33 4,15"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex-cp)" />
      </svg>

      {/* Floating orbs */}
      <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full
                      bg-gradient-to-br from-gold/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-24 -left-20 w-56 h-56 rounded-full
                      bg-gradient-to-tr from-brand-muted/80 to-gold/10 pointer-events-none" />

      {/* Brand mark */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-gold flex items-center justify-center shadow-lg">
            <span className="text-white text-xl font-black tracking-tight select-none">N</span>
          </div>
          <div>
            <p className="text-white font-bold text-base tracking-tight leading-none">NIB</p>
            <p className="text-gold text-[10px] tracking-[0.2em] uppercase font-medium mt-0.5">
              International Bank
            </p>
          </div>
        </div>
      </div>

      {/* Hero text */}
      <div className="relative z-10 mt-auto pb-10">
        <h2 className="text-white font-extrabold text-3xl xl:text-4xl leading-tight tracking-tight mb-4">
          Account<br />
          <span className="text-gold">Security</span><br />
          Setup
        </h2>
        <p className="text-white/55 text-sm leading-relaxed max-w-[26ch]">
          You're one step away from full portal access. Set a strong, permanent password to secure your account.
        </p>

        {/* Security tips */}
        <div className="mt-8 flex flex-col gap-3">
          {[
            { icon: '🔑', label: 'Use at least 8 characters' },
            { icon: '💪', label: 'Mix uppercase, numbers & symbols' },
            { icon: '🛡️', label: 'Temporary passwords are single-use' },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 bg-white/[0.06] border border-white/[0.10]
                         rounded-xl px-4 py-2.5 backdrop-blur-sm"
            >
              <span className="text-base flex-shrink-0">{icon}</span>
              <span className="text-white/70 text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom gold divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r
                      from-transparent via-gold/40 to-transparent" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChangePassword() {
  const { user, logout, refreshUser } = useAuth();

  const [form, setForm]             = useState({ newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState(false);
  const newPwRef = useRef(null);

  function handleChange(e) {
    setError('');
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setTimeout(() => refreshUser(data.user), 1400);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() { await logout(); }

  const strength       = getStrength(form.newPassword);
  const confirmMismatch =
    form.confirmPassword.length > 0 && form.confirmPassword !== form.newPassword;

  return (
    <div className="min-h-screen flex bg-panel">

      {/* ── Left branding panel ── */}
      <BrandPanel />

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10 bg-surface">

        {/* Mobile brand mark */}
        <div className="lg:hidden mb-8 flex items-center justify-between w-full max-w-[420px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
              <span className="text-gold text-lg font-black">N</span>
            </div>
            <div>
              <p className="text-text-1 font-bold text-sm leading-none">NIB International Bank</p>
              <p className="text-text-3 text-xs mt-0.5">Account Security Setup</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-text-3 font-semibold border border-border rounded-lg
                       px-3 py-1.5 hover:border-brand hover:text-brand transition-colors"
          >
            ↩ Sign Out
          </button>
        </div>

        {/* ── Form card ── */}
        <div className="w-full max-w-[420px]">

          {/* Gold accent bar */}
          <div className="h-1 w-16 rounded-full bg-gradient-to-r from-gold to-gold-hover mb-8" />

          {/* Page heading */}
          <div className="mb-7 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {/* Lock icon */}
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="#8A4D1F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold text-gold uppercase tracking-widest">
                  Account Setup Required
                </span>
              </div>
              <h1 className="text-text-1 font-extrabold text-2xl tracking-tight leading-tight">
                Set Your Password
              </h1>
              <p className="text-text-2 text-sm mt-1.5 leading-relaxed">
                Welcome,{' '}
                <strong className="text-brand font-semibold">{user?.username}</strong>.
                {' '}You must set a permanent password before accessing the portal.
              </p>
            </div>

            {/* Desktop sign out */}
            <button
              onClick={handleLogout}
              className="hidden lg:flex flex-shrink-0 ml-4 text-xs text-text-3 font-semibold
                         border border-border rounded-lg px-3 py-1.5 mt-1
                         hover:border-brand hover:text-brand transition-colors duration-150"
            >
              ↩ Sign Out
            </button>
          </div>

          {/* Info banner */}
          <div className="mb-6 flex items-start gap-3 bg-gold-light border border-gold/20
                          border-l-[3px] border-l-gold rounded-xl p-3.5">
            <span className="text-gold text-sm flex-shrink-0 mt-0.5" aria-hidden="true">ℹ</span>
            <p className="text-text-2 text-xs leading-relaxed">
              <strong>Why am I seeing this?</strong> Temporary passwords are single-use.
              Once set, your temporary password is cryptographically invalidated and can never be used again.
            </p>
          </div>

          {/* ── Success state ── */}
          {success ? (
            <div className="animate-slide-in-down flex flex-col items-center gap-4 bg-surface
                            border border-success-bdr rounded-2xl p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-success-bg border-2 border-success-bdr
                              flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                  stroke="#1A5C34" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-text-1 font-bold text-base">Password set successfully</p>
                <p className="text-text-2 text-sm mt-1">Loading your dashboard…</p>
              </div>
              <div className="w-full h-1 bg-panel rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full animate-[shimmer_1.4s_linear_infinite]"
                  style={{
                    background: 'linear-gradient(90deg, #8A4D1F, #D4AF37)',
                    width: '70%',
                    backgroundSize: '200% auto',
                  }}
                />
              </div>
            </div>
          ) : (
            /* ── Form ── */
            <form
              onSubmit={handleSubmit}
              noValidate
              className="space-y-5"
              aria-label="Set permanent password"
            >
              {/* New password */}
              <div>
                <label
                  className="block text-[11px] font-bold text-text-3 uppercase tracking-widest mb-1.5"
                  htmlFor="cp-new-password"
                >
                  New Password
                </label>
                <input
                  id="cp-new-password"
                  name="newPassword"
                  type="password"
                  value={form.newPassword}
                  onChange={handleChange}
                  required
                  autoFocus
                  ref={newPwRef}
                  className={inputCls(!!error && form.newPassword.length > 0 && form.newPassword.length < 8)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />

                {/* Strength bar */}
                {form.newPassword && (
                  <div className="mt-2.5 flex items-center gap-2.5 animate-fade-in">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3].map(n => (
                        <div
                          key={n}
                          className="flex-1 h-1.5 rounded-full transition-all duration-300"
                          style={{
                            background: strength.level >= n ? strength.color : '#E5DED6',
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className="text-[11px] font-bold flex-shrink-0 w-11 text-right transition-colors duration-300"
                      style={{ color: strength.textColor }}
                    >
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label
                  className="block text-[11px] font-bold text-text-3 uppercase tracking-widest mb-1.5"
                  htmlFor="cp-confirm-password"
                >
                  Confirm New Password
                </label>
                <input
                  id="cp-confirm-password"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  className={inputCls(confirmMismatch)}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />
                {confirmMismatch && (
                  <p className="mt-1.5 text-[11px] text-reject-txt font-medium animate-slide-in-down">
                    Passwords don't match yet
                  </p>
                )}
              </div>

              {/* Error banner */}
              {error && (
                <div
                  className="animate-slide-in-down flex items-start gap-2.5 bg-reject-bg border
                             border-reject-bdr rounded-xl p-3.5 text-reject-txt text-xs leading-relaxed"
                  role="alert"
                  aria-live="assertive"
                >
                  <span className="mt-0.5 flex-shrink-0 text-sm" aria-hidden="true">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit button */}
              <button
                id="change-password-btn"
                type="submit"
                disabled={submitting}
                className="relative w-full mt-1 overflow-hidden rounded-xl px-5 py-3.5 text-sm font-bold
                           text-white tracking-wide transition-all duration-200
                           bg-brand hover:bg-brand-hover
                           shadow-[0_4px_14px_rgba(138,77,31,0.35)] hover:shadow-[0_6px_20px_rgba(138,77,31,0.45)]
                           disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
                           active:scale-[0.98] flex items-center justify-center gap-2.5"
                aria-busy={submitting}
              >
                {/* Gold shimmer top line */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r
                                from-transparent via-gold/60 to-transparent pointer-events-none" />
                {submitting ? (
                  <>
                    <span
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0"
                      aria-hidden="true"
                    />
                    Setting Password…
                  </>
                ) : (
                  <>🔐 Set Permanent Password</>
                )}
              </button>
            </form>
          )}

          {/* Footer */}
          <p className="mt-8 text-center text-[10px] text-text-3 leading-relaxed">
            🔐 Secured with HttpOnly JWT · Sessions are monitored
            <br />Internal use only · Nib International Bank
          </p>
        </div>
      </div>
    </div>
  );
}
