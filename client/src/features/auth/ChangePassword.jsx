/**
 * client/src/features/auth/ChangePassword.jsx
 * ─────────────────────────────────────────────
 * Forced password-change screen — rendered when must_change_password === true.
 *
 * Blocks access to the full dashboard until the agent sets a permanent password.
 *
 * V3 (Tailwind migration):
 *   - `const styles = { ... }` object removed entirely.
 *   - All `style={styles.X}` replaced with Tailwind className equivalents.
 *   - Dynamic values (strength color, mismatch border) kept as inline style.
 *   - Logic, Axios usage, and component structure are unchanged.
 */

import { useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/api';

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
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        newPassword: form.newPassword,
      });

      // Show success state briefly, then update AuthContext.
      // data.user has must_change_password: false — this unlocks the dashboard.
      setSuccess(true);
      setTimeout(() => refreshUser(data.user), 1200);

    } catch (err) {
      setError(err.response?.data?.error ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  // ── Password strength indicator ──────────────────────────────────────────
  function getStrength(pw) {
    if (!pw) return { level: 0, label: '', color: 'transparent' };
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: 'Weak',   color: '#EF4444' };
    if (score <= 3) return { level: 2, label: 'Fair',   color: '#F59E0B' };
    return              { level: 3, label: 'Strong', color: '#22C55E' };
  }

  const strength = getStrength(form.newPassword);

  // Confirm password border — dynamic red when mismatch
  const confirmMismatch =
    form.confirmPassword && form.confirmPassword !== form.newPassword;

  return (
    <div className="min-h-screen bg-[#F2F5F8] flex flex-col antialiased">

      {/* Header */}
      <header className="bg-[#002B5B] border-b-[3px] border-[#96720C] shadow-md">
        <div className="max-w-lg mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* NIB monogram */}
            <div className="w-9 h-9 bg-[#96720C] text-white text-[11px] font-extrabold tracking-wide flex items-center justify-center rounded flex-shrink-0 select-none">
              NIB
            </div>
            <div>
              <div className="text-white font-bold text-base tracking-tight leading-tight">
                Nib International Bank
              </div>
              <div className="text-white/50 text-[9.5px] tracking-widest uppercase mt-0.5">
                AGENT PORTAL — ACCOUNT SETUP
              </div>
            </div>
          </div>
          <button
            className="bg-transparent border border-white/25 text-white/80 rounded px-3.5 py-1.5 text-xs font-semibold cursor-pointer hover:border-white/50 hover:text-white transition-colors"
            onClick={handleLogout}
          >
            ↩ Sign Out
          </button>
        </div>
      </header>

      {/* Main — card centered */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="bg-white border border-[#D8DEE6] rounded-lg shadow-lg p-10 w-full max-w-[440px] flex flex-col gap-5">

          {/* Lock icon */}
          <div
            className="w-13 h-13 bg-[#EBF0F7] rounded-full flex items-center justify-center self-start"
            aria-hidden="true"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="#002B5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <h1 className="text-[#002B5B] text-xl font-bold tracking-tight leading-tight">
            Set Your Password
          </h1>
          <p className="text-gray-700 text-[13.5px] leading-relaxed -mt-2">
            Welcome, <strong>{user?.username}</strong>. You are using a temporary
            password. You must set a permanent password before accessing the portal.
          </p>

          {/* Info banner */}
          <div className="bg-[#EBF0F7] border border-[#002B5B]/15 border-l-[3px] border-l-[#96720C] rounded p-3.5 text-[12px] text-[#1E3A5F] leading-relaxed">
            <strong>Why am I seeing this?</strong> For your security, temporary
            passwords are single-use. Once you set a permanent password, the
            temporary one is cryptographically invalidated and can never be used again.
          </div>

          {success ? (
            <div
              className="flex items-center gap-2.5 bg-green-50 border border-green-300 border-l-[3px] border-l-green-500 rounded p-4 text-[13px] font-medium text-green-900"
              role="status"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="#14532D" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>Password set successfully. Loading your dashboard…</span>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-4"
              aria-label="Set permanent password"
            >
              {/* New password */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-[11px] font-bold text-gray-500 uppercase tracking-wide"
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
                  className="bg-[#F2F5F8] border-[1.5px] border-[#D8DEE6] rounded text-gray-900 text-[13.5px] px-3 py-2.5 outline-none w-full transition focus:border-[#002B5B] focus:ring-2 focus:ring-[#002B5B]/20"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
                {/* Strength bar */}
                {form.newPassword && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3].map(n => (
                        <div
                          key={n}
                          className="flex-1 h-1 rounded-sm transition-colors"
                          style={{
                            background: strength.level >= n ? strength.color : '#E5E7EB',
                          }}
                        />
                      ))}
                    </div>
                    {/* Dynamic color kept as inline style */}
                    <span
                      className="text-[11px] font-semibold flex-shrink-0 w-11 text-right"
                      style={{ color: strength.color }}
                    >
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-[11px] font-bold text-gray-500 uppercase tracking-wide"
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
                  className="bg-[#F2F5F8] border-[1.5px] rounded text-gray-900 text-[13.5px] px-3 py-2.5 outline-none w-full transition focus:ring-2"
                  style={{
                    borderColor: confirmMismatch ? '#EF4444' : '#D8DEE6',
                    // Tailwind focus ring colour also swaps dynamically
                  }}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div
                  className="bg-red-50 border border-red-300 border-l-[3px] border-l-red-500 rounded p-3.5 text-xs text-red-900"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <button
                id="change-password-btn"
                type="submit"
                disabled={submitting}
                className="bg-[#002B5B] hover:bg-[#001e42] text-white rounded px-5 py-3 text-[13.5px] font-semibold tracking-wide transition-colors disabled:opacity-60 disabled:cursor-not-allowed w-full"
              >
                {submitting ? 'Setting Password…' : 'Set Permanent Password'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-[11px] text-gray-400 text-center">
          Nib International Bank · Internal Security System · All sessions are monitored.
        </p>
      </main>
    </div>
  );
}
