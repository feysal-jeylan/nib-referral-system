/**
 * client/src/features/auth/Login.jsx
 * ─────────────────────────────────────
 * Premium enterprise login — Nib International Bank Referral System.
 *
 * Layout: Split-screen
 *   LEFT  — Rich branding panel: deep navy gradient, geometric SVG shapes,
 *            glassmorphism feature cards, animated floating orbs.
 *   RIGHT — Polished login / agent-apply form with focus rings, error
 *            slide-in animation, and smooth hover micro-interactions.
 *
 * Brand palette (brief-spec):
 *   Deep Navy  #002B5B   Gold  #C5A059   Slate  #F4F7F9
 *
 * Logic & Axios usage unchanged from V2.
 */

import { useState } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/api';

// ─── Shared input class builder ───────────────────────────────────────────────
function inputCls(hasError) {
  const base =
    'w-full bg-[#F4F7F9] border rounded-xl px-4 py-3 pl-11 text-[#0A1628] text-sm ' +
    'placeholder-[#94A3B8] outline-none transition-all duration-200 ' +
    'focus:bg-white focus:shadow-[0_0_0_3px_rgba(197,160,89,0.18)] ';
  return hasError
    ? base + 'border-red-400 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
    : base + 'border-[#D8DEE6] focus:border-[#C5A059]';
}

// ─── Left branding panel ──────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex relative flex-col justify-between overflow-hidden
                    bg-[#002B5B] w-[46%] flex-shrink-0 p-10 xl:p-14">

      {/* ── Deep gradient overlay ── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#001830] via-[#002B5B] to-[#003E82] pointer-events-none" />

      {/* ── Subtle dot-grid texture ── */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none" aria-hidden="true">
        <defs>
          <pattern id="dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="#C5A059" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* ── Floating geometric orbs ── */}
      <div className="animate-float-slow absolute -top-16 -right-16 w-72 h-72 rounded-full
                      bg-gradient-to-br from-[#C5A059]/20 to-transparent pointer-events-none" />
      <div className="animate-float absolute bottom-24 -left-20 w-56 h-56 rounded-full
                      bg-gradient-to-tr from-[#003E82]/80 to-[#C5A059]/10 pointer-events-none" />
      <div className="animate-float-slow absolute top-1/2 right-10 w-32 h-32 rounded-full
                      border border-[#C5A059]/20 pointer-events-none" style={{ animationDelay: '2s' }} />

      {/* ── Decorative ring behind logo ── */}
      <div className="absolute top-10 left-10 xl:top-14 xl:left-14 w-16 h-16 pointer-events-none">
        <div className="animate-pulse-ring absolute inset-0 rounded-full border border-[#C5A059]/40" />
        <div className="animate-pulse-ring absolute inset-0 rounded-full border border-[#C5A059]/20"
             style={{ animationDelay: '0.9s' }} />
      </div>

      {/* ── Brand mark ── */}
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

      {/* ── Hero text ── */}
      <div className="relative z-10 mt-auto pb-10">
        <h2 className="text-white font-extrabold text-3xl xl:text-4xl leading-tight tracking-tight mb-4">
          Referral<br />
          <span className="text-[#C5A059]">Management</span><br />
          System
        </h2>
        <p className="text-white/55 text-sm leading-relaxed max-w-[22ch]">
          A secure, real-time platform for managing Nib Bank's internal referral network.
        </p>

        {/* ── Feature pills ── */}
        <div className="mt-8 flex flex-col gap-3">
          {[
            { icon: '🔒', label: 'HttpOnly JWT Authentication' },
            { icon: '⚡', label: 'Live data sync every 5 seconds' },
            { icon: '🏦', label: 'Temenos Core Banking Integration' },
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

      {/* ── Bottom divider line ── */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r
                      from-transparent via-[#C5A059]/40 to-transparent" />
    </div>
  );
}

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

    if (!name || !phone || !email) { setError('Please fill in all three fields.'); return; }
    if (!email.includes('@'))      { setError('Please enter a valid email address.'); return; }

    setSubmitting(true); setError('');
    try {
      await api.post('/agents/apply', { name, phone, email });
      onSuccess();
    } catch (err) {
      setError(
        err.response?.status === 409
          ? 'An agent with this phone or email already exists.'
          : (err.response?.data?.error ?? 'Something went wrong. Please try again.')
      );
    } finally { setSubmitting(false); }
  }

  const fields = [
    { id: 'apply-name',  name: 'name',  type: 'text',  icon: '👤', label: 'Full Name',       placeholder: 'e.g. Sara Tesfaye',    autoComplete: 'name' },
    { id: 'apply-phone', name: 'phone', type: 'tel',   icon: '📱', label: 'Phone Number',    placeholder: 'e.g. 0912345678',      autoComplete: 'tel' },
    { id: 'apply-email', name: 'email', type: 'email', icon: '✉️', label: 'Email Address',   placeholder: 'e.g. sara@example.com', autoComplete: 'email' },
  ];

  return (
    <div className="animate-slide-in-up">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[#002B5B] text-xs font-semibold
                   hover:text-[#C5A059] transition-colors duration-150 mb-6 group"
      >
        <span className="transition-transform duration-150 group-hover:-translate-x-0.5">←</span>
        Back to Sign In
      </button>

      <div className="mb-6">
        <h2 className="text-[#0A1628] font-bold text-xl tracking-tight">Agent Application</h2>
        <p className="text-[#64748B] text-sm mt-1 leading-relaxed">
          Submit your details to apply as a Nib referral agent. An Admin will review your application.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Agent application form">
        {fields.map(({ id, name, type, icon, label, placeholder, autoComplete }, i) => (
          <div key={id}>
            <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5" htmlFor={id}>
              {label}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none" aria-hidden="true">
                {icon}
              </span>
              <input
                id={id} name={name} type={type}
                className={inputCls(!!error)}
                placeholder={placeholder}
                value={form[name]}
                onChange={handleChange}
                autoComplete={autoComplete}
                autoFocus={i === 0}
                required
              />
            </div>
          </div>
        ))}

        {error && <ErrorBanner message={error} />}

        <SubmitButton loading={submitting} label="Submit Application" loadingLabel="Submitting…" icon="📝" />
      </form>
    </div>
  );
}

// ─── Shared micro-components ──────────────────────────────────────────────────
function ErrorBanner({ message }) {
  return (
    <div
      className="animate-slide-in-down flex items-start gap-2.5 bg-red-50 border border-red-200
                 rounded-xl p-3.5 text-red-800 text-xs leading-relaxed"
      role="alert" aria-live="assertive"
    >
      <span className="mt-0.5 text-red-500 flex-shrink-0 text-sm">⚠</span>
      <span>{message}</span>
    </div>
  );
}

function SuccessBanner({ message }) {
  return (
    <div
      className="animate-slide-in-down flex items-start gap-2.5 bg-emerald-50 border border-emerald-200
                 rounded-xl p-3.5 text-emerald-800 text-xs leading-relaxed"
      role="status" aria-live="polite"
    >
      <span className="mt-0.5 text-emerald-500 flex-shrink-0 text-sm">✓</span>
      <span>{message}</span>
    </div>
  );
}

function SubmitButton({ loading, label, loadingLabel, icon }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="relative w-full mt-1 overflow-hidden rounded-xl px-5 py-3.5 text-sm font-bold
                 text-white tracking-wide transition-all duration-200
                 bg-[#002B5B] hover:bg-[#003E82]
                 shadow-[0_4px_14px_rgba(0,43,91,0.35)] hover:shadow-[0_6px_20px_rgba(0,43,91,0.45)]
                 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
                 active:scale-[0.98] flex items-center justify-center gap-2.5"
      aria-busy={loading}
    >
      {/* Gold shimmer line on top of button */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r
                      from-transparent via-[#C5A059]/60 to-transparent pointer-events-none" />
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        <>{icon && <span aria-hidden="true">{icon}</span>}{label}</>
      )}
    </button>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
export default function Login() {
  const { login } = useAuth();

  const [form, setForm]                 = useState({ username: '', password: '' });
  const [error, setError]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [view, setView]                 = useState('login');   // 'login' | 'apply'
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
    setSubmitting(true); setError('');
    try {
      const { data } = await api.post('/auth/login', {
        username: form.username.trim(),
        password: form.password,
      });
      login(data.user);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Invalid username or password. Please try again.');
    } finally { setSubmitting(false); }
  }

  function handleApplySuccess() {
    setView('login');
    setApplySuccess('Application submitted! An Admin will review and send your login credentials.');
    setTimeout(() => setApplySuccess(''), 9000);
  }

  return (
    <div className="min-h-screen flex bg-[#F4F7F9]">

      {/* ── Left branding panel ── */}
      <BrandPanel />

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10">

        {/* Mobile brand mark (shown when left panel is hidden) */}
        <div className="lg:hidden mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#002B5B] flex items-center justify-center">
            <span className="text-[#C5A059] text-lg font-black">N</span>
          </div>
          <div>
            <p className="text-[#002B5B] font-bold text-sm leading-none">NIB International Bank</p>
            <p className="text-[#64748B] text-xs mt-0.5">Referral Management System</p>
          </div>
        </div>

        {/* ── Form card ── */}
        <div className="w-full max-w-[420px]">

          {/* Card header accent bar */}
          <div className="h-1 w-16 rounded-full bg-gradient-to-r from-[#C5A059] to-[#9A7A3C] mb-8" />

          {view === 'apply' ? (
            <AgentApplyForm onBack={() => setView('login')} onSuccess={handleApplySuccess} />
          ) : (
            <div className="animate-fade-in">
              <div className="mb-8">
                <h1 className="text-[#0A1628] font-extrabold text-2xl tracking-tight leading-tight">
                  Welcome back
                </h1>
                <p className="text-[#64748B] text-sm mt-1.5">
                  Sign in to your secure staff portal.
                </p>
              </div>

              {applySuccess && <div className="mb-5"><SuccessBanner message={applySuccess} /></div>}

              <form
                id="login-form"
                onSubmit={handleSubmit}
                noValidate
                className="space-y-5"
                aria-label="Login form"
              >
                {/* Username */}
                <div>
                  <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5"
                         htmlFor="login-username">
                    Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none" aria-hidden="true">👤</span>
                    <input
                      id="login-username"
                      name="username"
                      type="text"
                      className={inputCls(!!error)}
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
                  <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5"
                         htmlFor="login-password">
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none" aria-hidden="true">🔒</span>
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      className={inputCls(!!error)}
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>

                {error && <ErrorBanner message={error} />}

                <SubmitButton loading={submitting} label="Sign In to Dashboard" loadingLabel="Signing in…" icon="🔐" />
              </form>

              {/* Apply CTA */}
              <div className="mt-7 pt-6 border-t border-[#E2E8F0] text-center">
                <p className="text-[#64748B] text-xs">
                  Not a staff member?{' '}
                  <button
                    type="button"
                    className="text-[#002B5B] font-bold hover:text-[#C5A059] underline-offset-2
                               hover:underline transition-colors duration-150"
                    onClick={() => { setError(''); setApplySuccess(''); setView('apply'); }}
                  >
                    Apply to become an agent →
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* Security badge */}
          <p className="mt-8 text-center text-[10px] text-[#94A3B8] leading-relaxed">
            🔐 Secured with HttpOnly JWT · Sessions are monitored
            <br />Internal use only · Nib International Bank
          </p>
        </div>
      </div>
    </div>
  );
}
