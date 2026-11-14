/**
 * client/src/features/auth/ResetPassword.jsx
 * ──────────────────────────────────────────
 * Password recovery reset page — rendered at /reset-password?token=...
 *
 * Implements NIB International Bank security specification:
 *   - SHA-256 token lookup validation
 *   - Strict password policy enforcement (min 8 chars)
 *   - Visual strength feedback matching ChangePassword.jsx
 *   - Clean state handling (expired/invalid vs success vs loading)
 *   - Does NOT automatically log the user in
 */

import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle2, AlertCircle, Clock, ShieldCheck, ArrowLeft } from 'lucide-react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ── NIB Brand Palette ─────────────────────────────────────────────────────────
const C = {
  pageBg:     '#FAF8F5',
  cardBg:     '#FFFFFF',
  border:     'rgba(138, 77, 31, 0.15)',
  borderLight:'rgba(138, 77, 31, 0.08)',
  brown:      '#8A4D1F',
  brownDark:  '#6E3C16',
  gold:       '#D4AF37',
  goldLight:  '#FDF8EE',
  text1:      '#3E2723',
  text2:      '#5C3A2E',
  text3:      '#9C8577',
  textMuted:  '#B8A598',
};

// ── Password strength calculator ─────────────────────────────────────────────
function getStrength(pw) {
  if (!pw) return { level: 0, label: '', color: 'transparent', textColor: 'transparent' };
  let score = 0;
  if (pw.length >= 8)           score++;
  if (pw.length >= 12)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { level: 1, label: 'Weak',   color: '#E8A090', textColor: '#7A2518' };
  if (score <= 3) return { level: 2, label: 'Fair',   color: '#F0C854', textColor: '#7C4A03' };
  return             { level: 3, label: 'Strong', color: '#7DC898', textColor: '#1A5C34' };
}

export default function ResetPassword() {
  const [token, setToken] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Status: 'idle' | 'submitting' | 'success' | 'expired' | 'error'
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Resend state for expired/invalid token
  const [requestEmail, setRequestEmail] = useState('');
  const [requestSending, setRequestSending] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Extract token safely on mount using URLSearchParams
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');

    if (tokenParam && tokenParam.trim()) {
      setToken(tokenParam.trim());
      setStatus('idle');
      setErrorMessage('');
    } else {
      setStatus('expired');
      setErrorMessage('No password reset token was provided in the link.');
    }
    setIsChecking(false);
  }, []);

  const strength = getStrength(password);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    if (!token) {
      setStatus('expired');
      return setErrorMessage('No password reset token was provided in the link.');
    }

    if (!password || password.length < 8) {
      return setErrorMessage('Password must be at least 8 characters long.');
    }
    if (password !== confirmPassword) {
      return setErrorMessage('Passwords do not match. Please re-enter.');
    }

    setStatus('submitting');
    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword: password,
      });
      setStatus('success');
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'INVALID_OR_EXPIRED_TOKEN' || code === 'MISSING_TOKEN') {
        setStatus('expired');
        setErrorMessage('This password reset link has expired or has already been used.');
      } else {
        setStatus('error');
        setErrorMessage(err.response?.data?.error || 'Failed to reset password. Please try again.');
      }
    }
  }

  async function handleRequestNewLink(e) {
    e.preventDefault();
    if (!requestEmail.trim()) {
      return setRequestError('Please enter your registered email address.');
    }
    setRequestSending(true);
    setRequestError('');
    try {
      await api.post('/auth/forgot-password', { email: requestEmail.trim() });
      setRequestSent(true);
    } catch {
      setRequestSent(true);
    } finally {
      setRequestSending(false);
    }
  }

  // ── Initial Checking State (prevents flash of error UI) ────────────────────
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.pageBg }}>
        <div className="flex flex-col items-center gap-3 text-center animate-in fade-in duration-200">
          <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium" style={{ color: C.text3 }}>
            Verifying reset link…
          </p>
        </div>
      </div>
    );
  }

  // ── Success State View ───────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.pageBg }}>
        <div
          className="w-full max-w-md p-8 sm:p-10 rounded-2xl shadow-xl border text-center animate-in fade-in duration-300"
          style={{ background: C.cardBg, borderColor: C.border }}
        >
          <div
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-5"
            style={{ background: '#FAF5EE', border: `1.5px solid ${C.gold}` }}
          >
            <CheckCircle2 size={32} style={{ color: C.gold }} strokeWidth={2.5} />
          </div>

          <h2 className="text-2xl font-bold tracking-tight mb-2" style={{ color: C.text1 }}>
            Password Reset Complete
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.text2 }}>
            Your account password has been updated successfully. All previous active sessions have been securely terminated.
          </p>

          <Button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="w-full py-3 h-auto rounded-xl text-sm font-bold text-white transition-all duration-200"
            style={{ background: C.brown }}
            onMouseEnter={e => { e.currentTarget.style.background = C.brownDark; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.brown; }}
          >
            Proceed to Sign In →
          </Button>
        </div>
      </div>
    );
  }

  // ── Expired / Invalid State View (renders if no token or token expired) ──────
  if (status === 'expired' || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.pageBg }}>
        <div
          className="w-full max-w-md p-8 sm:p-10 rounded-2xl shadow-xl border text-center animate-in fade-in duration-300"
          style={{ background: C.cardBg, borderColor: C.border }}
        >
          <div
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-5"
            style={{ background: '#FDF2F0', border: '1.5px solid #E8A090' }}
          >
            <Clock size={32} className="text-[#C53030]" strokeWidth={2.2} />
          </div>

          <h2 className="text-2xl font-bold tracking-tight mb-2" style={{ color: C.text1 }}>
            Link Expired or Invalid
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.text3 }}>
            {errorMessage || 'For your security, password reset links expire after 15 minutes and can only be used once.'}
          </p>

          {requestSent ? (
            <div className="p-4 rounded-xl mb-6 bg-[#FAF5EE] border border-[#D4AF37]/30 text-left">
              <p className="text-xs font-semibold text-[#8A4D1F] mb-1">✓ Request Submitted</p>
              <p className="text-xs text-[#5C3A2E]">
                If an account exists with that email, a fresh reset link has been dispatched. Please check your inbox.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRequestNewLink} className="space-y-3 mb-6 text-left">
              <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: C.text2 }}>
                Request a New Reset Link
              </label>
              <Input
                type="email"
                placeholder="Enter your registered email"
                value={requestEmail}
                onChange={e => setRequestEmail(e.target.value)}
                required
                className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 text-sm"
              />
              {requestError && <p className="text-xs text-red-600">{requestError}</p>}
              <Button
                type="submit"
                disabled={requestSending}
                className="w-full py-2.5 h-auto rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: C.brown }}
              >
                {requestSending ? 'Sending…' : 'Send New Link'}
              </Button>
            </form>
          )}

          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:underline"
            style={{ color: C.brown }}
          >
            <ArrowLeft size={14} /> Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ── Standard Reset Form View (Only renders if valid token in state) ─────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: C.pageBg }}>
      <div
        className="w-full max-w-md p-8 sm:p-10 rounded-2xl shadow-xl border relative"
        style={{ background: C.cardBg, borderColor: C.border }}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: C.gold }}
          >
            <span className="text-white font-black text-lg select-none">N</span>
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-tight leading-tight" style={{ color: C.text1 }}>
              NIB International Bank
            </h3>
            <p className="text-[11px] tracking-wider uppercase font-semibold" style={{ color: C.brown }}>
              Referral Management System
            </p>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight mb-1.5" style={{ color: C.text1 }}>
            Set New Password
          </h1>
          <p className="text-xs leading-relaxed" style={{ color: C.text3 }}>
            Choose a strong, unique password for your account. Once changed, all existing sessions will be signed out.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New password input */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.text2 }}>
              New Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                required
                className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 pr-10 text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9C8577] hover:text-[#3E2723] transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password strength bar */}
            {password.length > 0 && (
              <div className="mt-2.5">
                <div className="flex gap-1.5 mb-1.5">
                  {[1, 2, 3].map(bar => (
                    <div
                      key={bar}
                      className="h-1.5 flex-1 rounded-full transition-all duration-300"
                      style={{
                        background: bar <= strength.level ? strength.color : '#EBE3D5',
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span style={{ color: C.text3 }}>Strength:</span>
                  <span className="font-semibold" style={{ color: strength.textColor }}>
                    {strength.label}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm password input */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.text2 }}>
              Confirm Password
            </label>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-[#FAF8F5] border border-[#EBE3D5] rounded-xl px-4 py-2.5 pr-10 text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9C8577] hover:text-[#3E2723] transition-colors"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Security requirement check items */}
          <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#EBE3D5] space-y-1.5 text-[11px] text-[#7D6A5D]">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className={password.length >= 8 ? 'text-green-600' : 'text-[#B8A598]'} />
              <span className={password.length >= 8 ? 'text-green-800 font-medium' : ''}>
                At least 8 characters
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className={/[A-Z]/.test(password) && /[0-9]/.test(password) ? 'text-green-600' : 'text-[#B8A598]'} />
              <span className={/[A-Z]/.test(password) && /[0-9]/.test(password) ? 'text-green-800 font-medium' : ''}>
                Include uppercase letters and numbers
              </span>
            </div>
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full py-3 h-auto rounded-xl text-sm font-bold text-white transition-all duration-200"
            style={{ background: C.brown }}
            onMouseEnter={e => { if (status !== 'submitting') e.currentTarget.style.background = C.brownDark; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.brown; }}
          >
            {status === 'submitting' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating Password…
              </span>
            ) : (
              'Save New Password →'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="inline-flex items-center gap-1.5 text-xs transition-colors hover:underline"
            style={{ color: C.text3 }}
          >
            <ArrowLeft size={13} /> Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
