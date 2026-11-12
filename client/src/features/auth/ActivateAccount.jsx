/**
 * features/auth/ActivateAccount.jsx
 * ────────────────────────────────────
 * Shown at /activate?token=RAW_TOKEN
 * Lets the agent set their own password to activate their account.
 * No React Router — reads window.location.search directly.
 */

import { useState } from 'react';
import api from '@/services/api';

// ── Brand palette ─────────────────────────────────────────────────────────────
// #8A4D1F  brand brown
// #3E2723  chocolate dark
// #9C8577  muted brown
// #FAF8F5  warm ivory
// #D4AF37  honey gold

export default function ActivateAccount() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token') ?? '';

  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [status,      setStatus]      = useState('idle'); // idle | loading | success | error | expired
  const [message,     setMessage]     = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendMsg,   setResendMsg]   = useState('');
  const [resending,   setResending]   = useState(false);
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Set password ─────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');

    if (password.length < 8) {
      return setMessage('Password must be at least 8 characters.');
    }
    if (password !== confirm) {
      return setMessage('Passwords do not match.');
    }

    setStatus('loading');
    try {
      await api.post('/auth/activate', { token, newPassword: password });
      setStatus('success');
      setMessage('Account activated! Redirecting to login…');
      setTimeout(() => {
        window.location.href = '/';
      }, 2500);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'INVALID_OR_EXPIRED_TOKEN') {
        setStatus('expired');
      } else {
        setStatus('error');
      }
      setMessage(err.response?.data?.error ?? 'Activation failed. Please try again.');
    }
  }

  // ── Resend activation email ───────────────────────────────────────────────────
  async function handleResend(e) {
    e.preventDefault();
    setResendMsg('');
    if (!resendEmail.trim()) {
      return setResendMsg('Please enter your email address.');
    }
    setResending(true);
    try {
      await api.post('/auth/resend-activation', { email: resendEmail });
      setResendMsg('✓ A new activation link has been sent. Check your inbox.');
    } catch (err) {
      setResendMsg(err.response?.data?.error ?? 'Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  }

  // ── Missing token guard ───────────────────────────────────────────────────────
  if (!token) {
    return (
      <PageShell>
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold" style={{ color: '#3E2723' }}>Invalid Activation Link</h2>
          <p className="text-sm" style={{ color: '#9C8577' }}>
            This link appears to be incomplete or corrupted. Please use the full link from the email.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <PageShell>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: '#F0FDF4' }}>
            <svg className="w-8 h-8" style={{ color: '#16A34A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold" style={{ color: '#3E2723' }}>Account Activated!</h2>
          <p className="text-sm" style={{ color: '#9C8577' }}>{message}</p>
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#EDE9E6' }}>
            <div className="h-full animate-pulse rounded-full" style={{ backgroundColor: '#D4AF37', width: '100%' }} />
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Expired / Invalid token — show resend form ────────────────────────────────
  if (status === 'expired') {
    return (
      <PageShell>
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
              style={{ backgroundColor: '#FEF3C7' }}>
              <svg className="w-8 h-8" style={{ color: '#D97706' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold" style={{ color: '#3E2723' }}>Link Expired</h2>
            <p className="text-sm" style={{ color: '#9C8577' }}>
              {message || 'This activation link has expired (links are valid for 30 minutes).'}
            </p>
          </div>

          <form onSubmit={handleResend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#3E2723' }}>
                Your Email Address
              </label>
              <input
                type="email"
                value={resendEmail}
                onChange={e => setResendEmail(e.target.value)}
                placeholder="agent@example.com"
                className="w-full px-4 py-2.5 rounded-lg border outline-none transition text-sm"
                style={{
                  borderColor: '#D6CCC5',
                  backgroundColor: '#FFFFFF',
                  color: '#3E2723',
                }}
                onFocus={e => (e.target.style.borderColor = '#8A4D1F')}
                onBlur={e  => (e.target.style.borderColor = '#D6CCC5')}
              />
            </div>

            {resendMsg && (
              <p className="text-sm" style={{ color: resendMsg.startsWith('✓') ? '#16A34A' : '#DC2626' }}>
                {resendMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={resending}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition"
              style={{ backgroundColor: resending ? '#9C8577' : '#8A4D1F' }}
            >
              {resending ? 'Sending…' : 'Resend Activation Link'}
            </button>
          </form>
        </div>
      </PageShell>
    );
  }

  // ── Default: set password form ────────────────────────────────────────────────
  return (
    <PageShell>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold" style={{ color: '#3E2723' }}>Activate Your Account</h2>
          <p className="text-sm mt-1" style={{ color: '#9C8577' }}>
            Choose a secure password to complete your account setup.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#3E2723' }}>
              New Password
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-4 py-2.5 pr-10 rounded-lg border outline-none transition text-sm"
                style={{ borderColor: '#D6CCC5', backgroundColor: '#FFFFFF', color: '#3E2723' }}
                onFocus={e => (e.target.style.borderColor = '#8A4D1F')}
                onBlur={e  => (e.target.style.borderColor = '#D6CCC5')}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: '#9C8577' }}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
            {/* Strength bar */}
            {password.length > 0 && (
              <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#EDE9E6' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (password.length / 16) * 100)}%`,
                    backgroundColor:
                      password.length < 8  ? '#EF4444' :
                      password.length < 12 ? '#D4AF37' : '#16A34A',
                  }}
                />
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#3E2723' }}>
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full px-4 py-2.5 pr-10 rounded-lg border outline-none transition text-sm"
                style={{
                  borderColor: confirm && confirm !== password ? '#EF4444' : '#D6CCC5',
                  backgroundColor: '#FFFFFF',
                  color: '#3E2723',
                }}
                onFocus={e => (e.target.style.borderColor = '#8A4D1F')}
                onBlur={e  => (e.target.style.borderColor = confirm && confirm !== password ? '#EF4444' : '#D6CCC5')}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: '#9C8577' }}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
            {confirm && confirm !== password && (
              <p className="text-xs mt-1" style={{ color: '#EF4444' }}>Passwords do not match.</p>
            )}
          </div>

          {/* Error message */}
          {message && status !== 'success' && (
            <p className="text-sm text-center" style={{ color: '#DC2626' }}>{message}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{ backgroundColor: status === 'loading' ? '#9C8577' : '#8A4D1F' }}
          >
            {status === 'loading' ? 'Activating…' : 'Activate Account'}
          </button>
        </form>

        <p className="text-center text-xs" style={{ color: '#9C8577' }}>
          Link expired?{' '}
          <button
            onClick={() => setStatus('expired')}
            className="underline font-medium"
            style={{ color: '#8A4D1F' }}
          >
            Request a new one
          </button>
        </p>
      </div>
    </PageShell>
  );
}

// ── Shared page shell (centered card on ivory background) ─────────────────────
function PageShell({ children }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#FAF8F5' }}
    >
      {/* NIB branding */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <img
          src="/nib-logo.png"
          alt="NIB"
          className="w-14 h-14 rounded-full object-cover shadow-md"
          onError={e => { e.target.style.display = 'none'; }}
        />
        <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#9C8577' }}>
          Nib International Bank
        </p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-lg border"
        style={{ backgroundColor: '#FFFFFF', borderColor: '#EDE9E6' }}
      >
        {children}
      </div>

      <p className="mt-6 text-xs" style={{ color: '#9C8577' }}>
        © {new Date().getFullYear()} Nib International Bank — Referral System
      </p>
    </div>
  );
}
