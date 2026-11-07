/**
 * client/src/features/auth/Login.jsx
 * ─────────────────────────────────────
 * Premium enterprise login — Nib International Bank Referral System.
 *
 * Phase 5 Brand Refresh — Warm Brown / Honey Gold palette.
 *
 * Layout: Split-screen (stacks to single column on mobile)
 *   LEFT  — Warm parchment/ivory brand panel with abstract geometric
 *            network pattern (SVG, no cartoon imagery), animated orbs,
 *            feature cards, and NIB monogram.
 *   RIGHT — Crisp white form panel with clean typography, gold focus
 *            states, slide-in error animation, and smooth micro-interactions.
 *
 * Brand palette:
 *   Warm Brown  #8A4D1F  (primary CTA, brand mark)
 *   Honey Gold  #D4AF37  (focus rings, dividers, accents)
 *   Warm Ivory  #FAF8F5  (page bg)
 *   Parchment   #F3EDE6  (left panel bg)
 *
 * Logic & Axios usage unchanged from V2 — only the visual layer changed.
 */

import { useState } from 'react';
import { useAuth } from './AuthContext';
import api from '@/services/api';

// ─── Brand constants ──────────────────────────────────────────────────────────
const C = {
  brown:       '#8A4D1F',
  brownHover:  '#6B3A15',
  brownMuted:  '#7F483B',
  gold:        '#D4AF37',
  goldLight:   '#FBF5DC',
  panel:       '#F3EDE6',   // left panel background
  pageBg:      '#FAF8F5',   // right side background
  surface:     '#FFFFFF',
  border:      '#E5DED6',
  text1:       '#1C0F05',
  text2:       '#4A3728',
  text3:       '#9C8577',
};

// ─── Input class builder ──────────────────────────────────────────────────────
function inputCls(hasError) {
  const base =
    'w-full bg-[#FAF8F5] border rounded-lg px-4 py-3 pl-11 text-[#1C0F05] text-sm ' +
    'placeholder-[#9C8577] outline-none transition-all duration-200 ' +
    'focus:bg-white focus:shadow-[0_0_0_3px_rgba(212,175,55,0.22)] ';
  return hasError
    ? base + 'border-[#E8A090] focus:border-[#D4701C] focus:shadow-[0_0_0_3px_rgba(216,80,30,0.14)]'
    : base + `border-[${C.border}] focus:border-[${C.gold}]`;
}

// ─── Abstract geometric pattern SVG (network/hexagonal motif) ─────────────────
// Pure SVG — no cartoon imagery. Uses muted gold lines on ivory background.
function GeometricPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Hexagonal grid tile */}
        <pattern id="hex-net" x="0" y="0" width="80" height="92"
          patternUnits="userSpaceOnUse">
          {/* Hexagon outline */}
          <polygon
            points="40,4 72,22 72,70 40,88 8,70 8,22"
            fill="none"
            stroke="#D4AF37"
            strokeWidth="0.6"
            opacity="0.28"
          />
          {/* Inner cross */}
          <line x1="40" y1="4"  x2="40" y2="88" stroke="#8A4D1F" strokeWidth="0.4" opacity="0.10" />
          <line x1="8"  y1="22" x2="72" y2="70" stroke="#8A4D1F" strokeWidth="0.4" opacity="0.10" />
          <line x1="72" y1="22" x2="8"  y2="70" stroke="#8A4D1F" strokeWidth="0.4" opacity="0.10" />
          {/* Centre node */}
          <circle cx="40" cy="46" r="2.5" fill="#D4AF37" opacity="0.20" />
          {/* Vertex nodes */}
          <circle cx="40" cy="4"  r="1.5" fill="#8A4D1F" opacity="0.14" />
          <circle cx="72" cy="22" r="1.5" fill="#8A4D1F" opacity="0.14" />
          <circle cx="72" cy="70" r="1.5" fill="#8A4D1F" opacity="0.14" />
          <circle cx="40" cy="88" r="1.5" fill="#8A4D1F" opacity="0.14" />
          <circle cx="8"  cy="70" r="1.5" fill="#8A4D1F" opacity="0.14" />
          <circle cx="8"  cy="22" r="1.5" fill="#8A4D1F" opacity="0.14" />
        </pattern>

        {/* Radial vignette to fade the pattern at edges */}
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%"   stopColor="#F3EDE6" stopOpacity="0" />
          <stop offset="100%" stopColor="#F3EDE6" stopOpacity="0.75" />
        </radialGradient>
      </defs>

      {/* Pattern fill */}
      <rect width="100%" height="100%" fill="url(#hex-net)" />
      {/* Vignette overlay — softens pattern at edges */}
      <rect width="100%" height="100%" fill="url(#vignette)" />
    </svg>
  );
}

// ─── Left branding panel ──────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div
      className="hidden lg:flex relative flex-col justify-between overflow-hidden
                 w-[46%] flex-shrink-0 p-10 xl:p-14"
      style={{ background: C.panel }}
    >
      {/* Geometric network pattern */}
      <GeometricPattern />

      {/* Warm gradient overlay — reinforces depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(160deg, rgba(243,237,230,0) 40%, rgba(138,77,31,0.07) 100%)',
        }}
      />

      {/* Floating orbs — warm tones */}
      <div
        className="animate-float-slow absolute -top-20 -right-20 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.14) 0%, transparent 70%)' }}
      />
      <div
        className="animate-float absolute bottom-20 -left-24 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(138,77,31,0.10) 0%, transparent 70%)' }}
      />

      {/* Decorative pulse ring */}
      <div className="absolute top-10 left-10 xl:top-14 xl:left-14 w-14 h-14 pointer-events-none">
        <div
          className="animate-pulse-ring absolute inset-0 rounded-full border"
          style={{ borderColor: `${C.gold}50` }}
        />
        <div
          className="animate-pulse-ring absolute inset-0 rounded-full border"
          style={{ borderColor: `${C.gold}28`, animationDelay: '0.95s' }}
        />
      </div>

      {/* ── NIB brand mark ── */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          {/* Monogram badge */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${C.brown} 0%, ${C.brownMuted} 100%)` }}
          >
            <span
              className="text-[13px] font-black tracking-widest select-none"
              style={{ color: C.gold }}
            >
              NIB
            </span>
          </div>
          <div>
            <p className="font-bold text-sm tracking-tight leading-none" style={{ color: C.text1 }}>
              Nib International Bank
            </p>
            <p
              className="text-[9.5px] tracking-[0.22em] uppercase font-semibold mt-0.5"
              style={{ color: C.goldMuted || C.brownMuted }}
            >
              Internal Portal
            </p>
          </div>
        </div>
      </div>

      {/* ── Hero text + feature cards ── */}
      <div className="relative z-10 mt-auto">
        <div className="mb-8">
          {/* Gold accent bar */}
          <div
            className="h-[3px] w-10 rounded-full mb-5"
            style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.brown})` }}
          />
          <h2
            className="font-extrabold text-3xl xl:text-4xl leading-[1.15] tracking-tight"
            style={{ color: C.text1 }}
          >
            Referral<br />
            <span style={{ color: C.brown }}>Management</span><br />
            System
          </h2>
          <p className="text-sm leading-relaxed mt-3 max-w-[24ch]" style={{ color: C.brownMuted }}>
            A secure, real-time platform for managing Nib Bank's internal referral network.
          </p>
        </div>

        {/* Feature cards — warm glassmorphism on ivory */}
        <div className="flex flex-col gap-2.5">
          {[
            { label: 'HttpOnly JWT Authentication',      icon: '🔒' },
            { label: 'Live data sync every 5 seconds',   icon: '⚡' },
            { label: 'Temenos Core Banking Integration', icon: '🏦' },
          ].map(({ label, icon }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: 'rgba(255,255,255,0.55)',
                border:     `1px solid rgba(212,175,55,0.22)`,
                backdropFilter: 'blur(8px)',
              }}
            >
              <span className="text-sm flex-shrink-0" aria-hidden="true">{icon}</span>
              <span className="text-xs font-medium" style={{ color: C.text2 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom gold divider */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${C.gold}55, transparent)` }}
      />
    </div>
  );
}

// ─── Shared banner components ─────────────────────────────────────────────────
function ErrorBanner({ message }) {
  return (
    <div
      className="animate-slide-in-down flex items-start gap-2.5 rounded-lg p-3.5
                 text-xs leading-relaxed"
      style={{
        background:  '#FDF3F0',
        border:      '1px solid #E8A090',
        borderLeft:  '3px solid #C0442A',
        color:       '#7A2518',
      }}
      role="alert"
      aria-live="assertive"
    >
      <span className="mt-0.5 flex-shrink-0 text-sm" style={{ color: '#C0442A' }} aria-hidden="true">⚠</span>
      <span>{message}</span>
    </div>
  );
}

function SuccessBanner({ message }) {
  return (
    <div
      className="animate-slide-in-down flex items-start gap-2.5 rounded-lg p-3.5
                 text-xs leading-relaxed"
      style={{
        background: '#F2FAF4',
        border:     '1px solid #7DC898',
        borderLeft: '3px solid #2D8A50',
        color:      '#1A5C34',
      }}
      role="status"
      aria-live="polite"
    >
      <span className="mt-0.5 flex-shrink-0 text-sm" style={{ color: '#2D8A50' }} aria-hidden="true">✓</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Submit button ────────────────────────────────────────────────────────────
function SubmitButton({ loading, label, loadingLabel, icon }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="relative w-full mt-1 overflow-hidden rounded-lg px-5 py-3.5 text-sm font-bold
                 text-white tracking-wide transition-all duration-200
                 disabled:opacity-55 disabled:cursor-not-allowed
                 active:scale-[0.98] flex items-center justify-center gap-2.5"
      style={{
        background:   `linear-gradient(135deg, ${C.brown} 0%, ${C.brownMuted} 100%)`,
        boxShadow:    '0 4px 14px rgba(138,77,31,0.32)',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(138,77,31,0.44)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(138,77,31,0.32)'; }}
      aria-busy={loading}
    >
      {/* Gold shimmer top line */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${C.gold}70, transparent)` }}
      />
      {loading ? (
        <>
          <span
            className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0"
            aria-hidden="true"
          />
          {loadingLabel}
        </>
      ) : (
        <>
          {icon && <span aria-hidden="true">{icon}</span>}
          {label}
        </>
      )}
    </button>
  );
}

// ─── Agent apply form ─────────────────────────────────────────────────────────
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
    { id: 'apply-name',  name: 'name',  type: 'text',  icon: '👤', label: 'Full Name',     placeholder: 'e.g. Sara Tesfaye',     autoComplete: 'name' },
    { id: 'apply-phone', name: 'phone', type: 'tel',   icon: '📱', label: 'Phone Number',  placeholder: 'e.g. 0912345678',       autoComplete: 'tel'  },
    { id: 'apply-email', name: 'email', type: 'email', icon: '✉️', label: 'Email Address', placeholder: 'e.g. sara@example.com', autoComplete: 'email' },
  ];

  return (
    <div className="animate-slide-in-up">
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold
                   transition-colors duration-150 mb-6 group"
        style={{ color: C.brown }}
        onMouseEnter={e => { e.currentTarget.style.color = C.gold; }}
        onMouseLeave={e => { e.currentTarget.style.color = C.brown; }}
      >
        <span className="transition-transform duration-150 group-hover:-translate-x-0.5">←</span>
        Back to Sign In
      </button>

      <div className="mb-6">
        <h2 className="font-bold text-xl tracking-tight" style={{ color: C.text1 }}>
          Agent Application
        </h2>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: C.text3 }}>
          Submit your details to apply as a Nib referral agent.
          An Admin will review your application.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Agent application form">
        {fields.map(({ id, name, type, icon, label, placeholder, autoComplete }, i) => (
          <div key={id}>
            <label
              className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
              style={{ color: C.text3 }}
              htmlFor={id}
            >
              {label}
            </label>
            <div className="relative">
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                aria-hidden="true"
              >
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

        <SubmitButton
          loading={submitting}
          label="Submit Application"
          loadingLabel="Submitting…"
          icon="📝"
        />
      </form>
    </div>
  );
}

// ─── Login (default export) ───────────────────────────────────────────────────
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
    setApplySuccess(
      'Application submitted! An Admin will review and send your login credentials.'
    );
    setTimeout(() => setApplySuccess(''), 9000);
  }

  return (
    <div className="min-h-screen flex" style={{ background: C.pageBg }}>

      {/* ── LEFT — Branding panel (desktop only) ── */}
      <BrandPanel />

      {/* ── RIGHT — Form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10">

        {/* Mobile brand mark — shown when left panel is hidden */}
        <div className="lg:hidden mb-8 flex items-center gap-3 w-full max-w-[420px]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${C.brown} 0%, ${C.brownMuted} 100%)` }}
          >
            <span className="text-[10px] font-black tracking-wider" style={{ color: C.gold }}>
              NIB
            </span>
          </div>
          <div>
            <p className="font-bold text-sm leading-none" style={{ color: C.text1 }}>
              Nib International Bank
            </p>
            <p className="text-xs mt-0.5" style={{ color: C.text3 }}>
              Referral Management System
            </p>
          </div>
        </div>

        {/* ── Form card ── */}
        <div className="w-full max-w-[420px]">

          {/* Gold accent bar */}
          <div
            className="h-[3px] w-12 rounded-full mb-8"
            style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.brown})` }}
          />

          {view === 'apply' ? (
            <AgentApplyForm
              onBack={() => setView('login')}
              onSuccess={handleApplySuccess}
            />
          ) : (
            <div className="animate-fade-in">
              {/* Heading */}
              <div className="mb-8">
                <h1
                  className="font-extrabold text-2xl tracking-tight leading-tight"
                  style={{ color: C.text1 }}
                >
                  Welcome back
                </h1>
                <p className="text-sm mt-1.5" style={{ color: C.text3 }}>
                  Sign in to your secure staff portal.
                </p>
              </div>

              {/* Success banner from agent apply */}
              {applySuccess && (
                <div className="mb-5">
                  <SuccessBanner message={applySuccess} />
                </div>
              )}

              {/* Login form */}
              <form
                id="login-form"
                onSubmit={handleSubmit}
                noValidate
                className="space-y-5"
                aria-label="Login form"
              >
                {/* Username field */}
                <div>
                  <label
                    className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
                    style={{ color: C.text3 }}
                    htmlFor="login-username"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      aria-hidden="true"
                    >
                      👤
                    </span>
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

                {/* Password field */}
                <div>
                  <label
                    className="block text-[11px] font-bold uppercase tracking-widest mb-1.5"
                    style={{ color: C.text3 }}
                    htmlFor="login-password"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <span
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                      aria-hidden="true"
                    >
                      🔒
                    </span>
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

                {/* Error banner */}
                {error && <ErrorBanner message={error} />}

                {/* Submit */}
                <SubmitButton
                  loading={submitting}
                  label="Sign In to Dashboard"
                  loadingLabel="Signing in…"
                  icon="🔐"
                />
              </form>

              {/* Agent apply CTA */}
              <div
                className="mt-7 pt-6 text-center"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <p className="text-xs" style={{ color: C.text3 }}>
                  Not a staff member?{' '}
                  <button
                    type="button"
                    className="font-bold underline-offset-2 hover:underline transition-colors duration-150"
                    style={{ color: C.brown }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.gold; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.brown; }}
                    onClick={() => { setError(''); setApplySuccess(''); setView('apply'); }}
                  >
                    Apply to become an agent →
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* Security badge */}
          <p
            className="mt-10 text-center text-[10px] leading-relaxed"
            style={{ color: C.text3 }}
          >
            🔐 Secured with HttpOnly JWT · Sessions are monitored
            <br />Internal use only · Nib International Bank
          </p>
        </div>
      </div>
    </div>
  );
}
