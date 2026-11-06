/**
 * client/src/features/auth/ChangePassword.jsx
 * ─────────────────────────────────────────────
 * Forced password-change screen — rendered when must_change_password === true.
 *
 * Blocks access to the full dashboard until the agent sets a permanent password.
 *
 * V4 (Premium redesign — matches Login.jsx split-screen brand aesthetic):
 *   - Split-screen layout: left = rich NIB branding panel, right = form card.
 *   - Glassmorphism card, animated orbs, gold accent bar.
 *   - Premium password-strength indicator (3-segment bar).
 *   - Slide-in error / success banners with micro-interactions.
 *   - All inline `styles` object removed; pure Tailwind + minimal dynamic inline
 *     for the strength-bar color (computed at runtime).
 *   - Logic, Axios usage, and AuthContext calls are unchanged from V2.
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
  if (score <= 1) return { level: 1, label: 'Weak',   color: '#EF4444', textColor: '#EF4444' };
  if (score <= 3) return { level: 2, label: 'Fair',   color: '#F59E0B', textColor: '#D97706' };
  return              { level: 3, label: 'Strong', color: '#22C55E', textColor: '#16A34A' };
}

// ─── Shared input class builder (matches Login.jsx) ───────────────────────────
function inputCls(hasError) {
  const base =
    'w-full bg-[#F4F7F9] border rounded-xl px-4 py-3 text-[#0A1628] text-sm ' +
    'placeholder-[#94A3B8] outline-none transition-all duration-200 ' +
    'focus:bg-white focus:shadow-[0_0_0_3px_rgba(197,160,89,0.18)] ';
  return hasError
    ? base + 'border-red-400 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
    : base + 'border-[#D8DEE6] focus:border-[#C5A059]';
}

// ─── Left branding panel (mirrors Login) ─────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex relative flex-col justify-between overflow-hidden
                    bg-[#002B5B] w-[46%] flex-shrink-0 p-10 xl:p-14">

      {/* Deep gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#001830] via-[#002B5B] to-[#003E82] pointer-events-none" />

      {/* Dot-grid texture */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none" aria-hidden="true">
        <defs>
          <pattern id="dot-grid-cp" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="#C5A059" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid-cp)" />
      </svg>

      {/* Floating orbs */}
      <div className="animate-float-slow absolute -top-16 -right-16 w-72 h-72 rounded-full
                      bg-gradient-to-br from-[#C5A059]/20 to-transparent pointer-events-none" />
      <div className="animate-float absolute bottom-24 -left-20 w-56 h-56 rounded-full
                      bg-gradient-to-tr from-[#003E82]/80 to-[#C5A059]/10 pointer-events-none" />
      <div className="animate-float-slow absolute top-1/3 right-8 w-28 h-28 rounded-full
                      border border-[#C5A059]/20 pointer-events-none" style={{ animationDelay: '3s' }} />

      {/* Pulse rings behind logo area */}
      <div className="absolute top-10 left-10 xl:top-14 xl:left-14 w-16 h-16 pointer-events-none">
        <div className="animate-pulse-ring absolute inset-0 rounded-full border border-[#C5A059]/40" />
        <div className="animate-pulse-ring absolute inset-0 rounded-full border border-[#C5A059]/20"
             style={{ animationDelay: '0.9s' }} />
      </div>

      {/* Brand mark */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#C5A059] to-[#9A7A3C]
                          flex items-center justify-center shadow-lg">
            <span className="text-white text-xl font-black tracking-tight select-none">N</span>
          </div>
          <div>
            <p className="text-white font-bold text-base tracking-tight leading-none">NIB</p>
            <p className="text-[#C5A059] text-[10px] tracking-[0.2em] uppercase font-medium mt-0.5">
              International Bank
            </p>
          </div>
        </div>
      </div>

      {/* Hero text */}
      <div className="relative z-10 mt-auto pb-10">
        <h2 className="text-white font-extrabold text-3xl xl:text-4xl leading-tight tracking-tight mb-4">
          Account<br />
          <span className="text-[#C5A059]">Security</span><br />
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
            <div key={label}
                 className="flex items-center gap-3 bg-white/[0.06] border border-white/[0.10]
                             rounded-xl px-4 py-2.5 backdrop-blur-sm">
              <span className="text-base flex-shrink-0">{icon}</span>
              <span className="text-white/70 text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom gold divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r
                      from-transparent via-[#C5A059]/40 to-transparent" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ChangePassword() {
  const { user, logout, refreshUser } = useAuth();

  const [form, setForm]         = useState({ newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);
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
      // Show success briefly, then unlock dashboard
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
    <div className="min-h-screen flex bg-[#F4F7F9]">

      {/* ── Left branding panel ── */}
      <BrandPanel />

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10">

        {/* Mobile brand mark */}
        <div className="lg:hidden mb-8 flex items-center justify-between w-full max-w-[420px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#002B5B] flex items-center justify-center">
              <span className="text-[#C5A059] text-lg font-black">N</span>
            </div>
            <div>
              <p className="text-[#002B5B] font-bold text-sm leading-none">NIB International Bank</p>
              <p className="text-[#64748B] text-xs mt-0.5">Account Security Setup</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-[#64748B] font-semibold border border-[#D8DEE6] rounded-lg
                       px-3 py-1.5 hover:border-[#002B5B] hover:text-[#002B5B] transition-colors"
          >
            ↩ Sign Out
          </button>
        </div>

        {/* ── Form card ── */}
        <div className="w-full max-w-[420px]">

          {/* Gold accent bar */}
          <div className="h-1 w-16 rounded-full bg-gradient-to-r from-[#C5A059] to-[#9A7A3C] mb-8" />

          {/* Page heading */}
          <div className="mb-7 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {/* Lock icon */}
                <div className="w-8 h-8 rounded-lg bg-[#EBF0F7] flex items-center justify-center flex-shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="#002B5B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold text-[#C5A059] uppercase tracking-widest">
                  Account Setup Required
                </span>
              </div>
              <h1 className="text-[#0A1628] font-extrabold text-2xl tracking-tight leading-tight">
                Set Your Password
              </h1>
              <p className="text-[#64748B] text-sm mt-1.5 leading-relaxed">
                Welcome,{' '}
                <strong className="text-[#002B5B] font-semibold">{user?.username}</strong>.
                {' '}You must set a permanent password before accessing the portal.
              </p>
            </div>

            {/* Desktop sign out */}
            <button
              onClick={handleLogout}
              className="hidden lg:flex flex-shrink-0 ml-4 text-xs text-[#64748B] font-semibold
                         border border-[#D8DEE6] rounded-lg px-3 py-1.5 mt-1
                         hover:border-[#002B5B] hover:text-[#002B5B] transition-colors duration-150"
            >
              ↩ Sign Out
            </button>
          </div>

          {/* Info banner */}
          <div className="mb-6 flex items-start gap-3 bg-[#EBF0F7] border border-[#002B5B]/12
                          border-l-[3px] border-l-[#C5A059] rounded-xl p-3.5">
            <span className="text-[#C5A059] text-sm flex-shrink-0 mt-0.5" aria-hidden="true">ℹ</span>
            <p className="text-[#1E3A5F] text-xs leading-relaxed">
              <strong>Why am I seeing this?</strong> Temporary passwords are single-use.
              Once set, your temporary password is cryptographically invalidated and can never be used again.
            </p>
          </div>

          {/* ── Success state ── */}
          {success ? (
            <div className="animate-slide-in-down flex flex-col items-center gap-4 bg-white
                            border border-emerald-200 rounded-2xl p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-200
                              flex items-center justify-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                  stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-[#0A1628] font-bold text-base">Password set successfully</p>
                <p className="text-[#64748B] text-sm mt-1">Loading your dashboard…</p>
              </div>
              <div className="w-full h-1 bg-[#F4F7F9] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#002B5B] to-[#C5A059] rounded-full animate-[shimmer_1.4s_linear_infinite]"
                     style={{ width: '70%', backgroundSize: '200% auto' }} />
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
                <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5"
                       htmlFor="cp-new-password">
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

                {/* Strength bar — only shown when user has started typing */}
                {form.newPassword && (
                  <div className="mt-2.5 flex items-center gap-2.5 animate-fade-in">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3].map(n => (
                        <div
                          key={n}
                          className="flex-1 h-1.5 rounded-full transition-all duration-300"
                          style={{
                            background: strength.level >= n ? strength.color : '#E2E8F0',
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
                <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5"
                       htmlFor="cp-confirm-password">
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
                {/* Inline mismatch hint */}
                {confirmMismatch && (
                  <p className="mt-1.5 text-[11px] text-red-500 font-medium animate-slide-in-down">
                    Passwords don't match yet
                  </p>
                )}
              </div>

              {/* Error banner */}
              {error && (
                <div
                  className="animate-slide-in-down flex items-start gap-2.5 bg-red-50 border
                             border-red-200 rounded-xl p-3.5 text-red-800 text-xs leading-relaxed"
                  role="alert" aria-live="assertive"
                >
                  <span className="mt-0.5 text-red-500 flex-shrink-0 text-sm" aria-hidden="true">⚠</span>
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
                           bg-[#002B5B] hover:bg-[#003E82]
                           shadow-[0_4px_14px_rgba(0,43,91,0.35)] hover:shadow-[0_6px_20px_rgba(0,43,91,0.45)]
                           disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
                           active:scale-[0.98] flex items-center justify-center gap-2.5"
                aria-busy={submitting}
              >
                {/* Gold shimmer top line */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r
                                from-transparent via-[#C5A059]/60 to-transparent pointer-events-none" />
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0"
                          aria-hidden="true" />
                    Setting Password…
                  </>
                ) : (
                  <>🔐 Set Permanent Password</>
                )}
              </button>
            </form>
          )}

          {/* Footer */}
          <p className="mt-8 text-center text-[10px] text-[#94A3B8] leading-relaxed">
            🔐 Secured with HttpOnly JWT · Sessions are monitored
            <br />Internal use only · Nib International Bank
          </p>
        </div>
      </div>
    </div>
  );
}
